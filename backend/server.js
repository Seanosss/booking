require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const {
    initializeDatabase,
    loadSettings,
    saveSettings,
    createBooking,
    getBookings,
    getBookingById,
    updateBookingStatus,
    deleteBooking,
    getStats,
    getBookingItemsByDate,
    getRoomConflicts,
    getCatalogItemById,
    getCatalogItems,
    getCatalogItemsByIds,
    createCatalogItem,
    updateCatalogItem,
    deleteCatalogItem,
    getCatalogItemCapacityUsage,
    getClasses,
    getClassById,
    createClass,
    updateClass,
    deleteClass,
    getClassCapacityUsage,
    createClassBooking,
    getClassBookings,
    getClassProducts,
    createClassProduct,
    updateClassProduct,
    deleteClassProduct,
    DEFAULT_ADMIN_PASSWORD
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_TOKEN_TTL_MS = (() => {
    const ttlFromEnv = parseInt(process.env.ADMIN_TOKEN_TTL_MS, 10);
    return Number.isFinite(ttlFromEnv) && ttlFromEnv > 0
        ? ttlFromEnv
        : 1000 * 60 * 60; // 1 hour default
})();

const ADMIN_AUTH_DISABLED = true; // Toggle back to false to re-enable admin authentication

const activeAdminTokens = new Map();
const bookingCreationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many booking attempts. Please try again shortly.' }
});

app.use(cors());
app.use(express.json());

function cleanupExpiredTokens() {
    if (ADMIN_AUTH_DISABLED) {
        return;
    }
    const now = Date.now();
    for (const [token, metadata] of activeAdminTokens.entries()) {
        if (metadata.expiresAt <= now) {
            activeAdminTokens.delete(token);
        }
    }
}

function issueAdminToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ADMIN_TOKEN_TTL_MS;

    activeAdminTokens.set(token, {
        issuedAt,
        expiresAt
    });

    return {
        token,
        issuedAt,
        expiresAt
    };
}

function authenticateAdmin(req, res, next) {
    if (ADMIN_AUTH_DISABLED) {
        const issuedAt = Date.now();
        req.admin = {
            token: 'dev-admin-token',
            issuedAt: new Date(issuedAt).toISOString(),
            expiresAt: new Date(issuedAt + ADMIN_TOKEN_TTL_MS).toISOString()
        };
        return next();
    }

    cleanupExpiredTokens();

    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header required' });
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ error: 'Invalid authorization header format' });
    }

    const tokenMetadata = activeAdminTokens.get(token);
    if (!tokenMetadata) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (tokenMetadata.expiresAt <= Date.now()) {
        activeAdminTokens.delete(token);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.admin = {
        token,
        issuedAt: new Date(tokenMetadata.issuedAt).toISOString(),
        expiresAt: new Date(tokenMetadata.expiresAt).toISOString()
    };

    next();
}

function parseTimeToMinutes(timeString) {
    const [hour, minute] = timeString.split(':').map(Number);
    return (hour * 60) + minute;
}

function minutesToTimeString(totalMinutes) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function minutesBetween(startTime, endTime) {
    return parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime);
}

function normalizeIsoToDateTimeStrings(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const pad = (value) => value.toString().padStart(2, '0');
    const localYear = date.getFullYear();
    const localMonth = pad(date.getMonth() + 1);
    const localDay = pad(date.getDate());
    const localHour = pad(date.getHours());
    const localMinute = pad(date.getMinutes());

    return {
        date: `${localYear}-${localMonth}-${localDay}`,
        time: `${localHour}:${localMinute}`
    };
}

function resolvePeakSchedule(settings) {
    const schedule = settings.pricing?.peakSchedule;
    if (!schedule) {
        return null;
    }

    const days = Array.isArray(schedule.days)
        ? schedule.days.map(day => day.toString().toLowerCase())
        : [];

    return {
        days,
        startTime: schedule.startTime || '18:00',
        endTime: schedule.endTime || '23:00'
    };
}

function determinePeriodType(date, startTime, endTime, settings) {
    const schedule = resolvePeakSchedule(settings);
    if (!schedule || schedule.days.length === 0) {
        return 'normal';
    }

    const parsedDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
        return 'normal';
    }

    const dayIndex = parsedDate.getDay();
    const dayToken = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIndex];
    if (!schedule.days.includes(dayToken)) {
        return 'normal';
    }

    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);
    const peakStart = parseTimeToMinutes(schedule.startTime);
    const peakEnd = parseTimeToMinutes(schedule.endTime);

    const overlapsPeak = startMinutes < peakEnd && endMinutes > peakStart;
    return overlapsPeak ? 'peak' : 'normal';
}

function resolveHourlyRate(pricing, peopleCount, periodType) {
    if (peopleCount > 18) {
        throw new Error('Maximum capacity per booking item is 18 people');
    }

    if (peopleCount <= 10) {
        return periodType === 'peak'
            ? Number(pricing.peakUpTo10)
            : Number(pricing.normalUpTo10);
    }

    return periodType === 'peak'
        ? Number(pricing.peakUpTo18)
        : Number(pricing.normalUpTo18);
}

function calculateRoomRentalPrice({ duration, peopleCount, periodType }, settings) {
    const pricing = settings.pricing || {};
    const rate = resolveHourlyRate(pricing, peopleCount, periodType);
    const hours = duration / 60;
    const total = rate * hours;
    return Math.round(total * 100) / 100;
}

function hasInPayloadRoomConflict(items, date, startTime, endTime) {
    const targetStart = parseTimeToMinutes(startTime);
    const targetEnd = parseTimeToMinutes(endTime);
    return items.some(existing => {
        if (existing.itemType !== 'room_rental') {
            return false;
        }

        if (existing.date !== date) {
            return false;
        }

        const existingStart = parseTimeToMinutes(existing.startTime);
        const existingEnd = parseTimeToMinutes(existing.endTime);

        return existingStart < targetEnd && existingEnd > targetStart;
    });
}

function generateSlotsForRange(startTime, endTime, intervalMinutes = 30) {
    const slots = [];
    let cursor = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);

    while (cursor < end) {
        slots.push(minutesToTimeString(cursor));
        cursor += intervalMinutes;
    }

    return slots;
}

async function buildCatalogItemResponse(items) {
    const enriched = [];
    for (const item of items) {
        const usage = await getCatalogItemCapacityUsage(item.id);
        enriched.push({
            ...item,
            availableCapacity: Math.max(item.capacity - usage, 0),
            usedCapacity: usage
        });
    }
    return enriched;
}

async function buildClassResponse(classes) {
    const enriched = [];
    for (const cls of classes) {
        const used = await getClassCapacityUsage(cls.id);
        enriched.push({
            ...cls,
            seatsRemaining: Math.max(cls.capacity - used, 0),
            usedCapacity: used
        });
    }
    return enriched;
}

async function getRentalAvailability(date) {
    const settings = await loadSettings();
    const items = await getBookingItemsByDate(date);
    const confirmedSlots = [];
    const pendingSlots = [];

    const operatingHours = settings.operatingHours || {};
    const openingHours = {
        startTime: operatingHours.startTime || '07:00',
        endTime: operatingHours.endTime || '22:00'
    };

    items.forEach(item => {
        if (item.itemType !== 'room_rental') {
            return;
        }

        const slots = generateSlotsForRange(item.startTime, item.endTime);
        if (item.status === 'confirmed') {
            confirmedSlots.push(...slots);
        } else {
            pendingSlots.push(...slots);
        }
    });

    return {
        date,
        confirmedSlots,
        pendingSlots,
        openingHours
    };
}

function validateClassPayload(payload) {
    const errors = [];
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : '';
    const instructor = typeof payload.instructor === 'string' && payload.instructor.trim()
        ? payload.instructor.trim()
        : null;
    const location = typeof payload.location === 'string' && payload.location.trim()
        ? payload.location.trim()
        : null;
    const description = typeof payload.description === 'string' ? payload.description : '';
    const startTime = payload.startTime ? new Date(payload.startTime) : null;
    const endTime = payload.endTime ? new Date(payload.endTime) : null;
    const capacity = Number.parseInt(payload.capacity, 10);
    const price = Number.parseFloat(payload.price);
    const tags = Array.isArray(payload.tags)
        ? payload.tags.map(tag => tag.toString().trim()).filter(Boolean)
        : [];
    const isTrialOnly = Boolean(payload.isTrialOnly);

    if (!name) {
        errors.push('Class name is required.');
    }

    if (!startTime || Number.isNaN(startTime.getTime())) {
        errors.push('Valid start time is required.');
    }

    if (!endTime || Number.isNaN(endTime.getTime())) {
        errors.push('Valid end time is required.');
    }

    if (startTime && endTime && startTime >= endTime) {
        errors.push('End time must be after start time.');
    }

    if (!Number.isFinite(capacity) || capacity <= 0) {
        errors.push('Capacity must be a positive integer.');
    }

    if (!Number.isFinite(price) || price < 0) {
        errors.push('Price must be a positive number.');
    }

    if (errors.length > 0) {
        return { errors };
    }

    return {
        errors: null,
        data: {
            name,
            description,
            instructor,
            location,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            capacity,
            price,
            tags,
            isTrialOnly
        }
    };
}

function validateClassProductPayload(payload) {
    const errors = [];
    const type = payload.type === 'trial' ? 'trial' : 'package';
    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : '';
    const description = typeof payload.description === 'string' ? payload.description : '';
    const price = Number.parseFloat(payload.price);
    const numberOfClasses = Number.parseInt(payload.numberOfClasses, 10);
    const validity = payload.validityPeriodDays === null || payload.validityPeriodDays === undefined
        ? null
        : Number.parseInt(payload.validityPeriodDays, 10);

    if (!name) {
        errors.push('Name is required.');
    }

    if (!Number.isFinite(price) || price < 0) {
        errors.push('Price must be a positive number.');
    }

    if (!Number.isFinite(numberOfClasses) || numberOfClasses <= 0) {
        errors.push('Number of classes must be a positive integer.');
    }

    if (validity !== null && (!Number.isFinite(validity) || validity <= 0)) {
        errors.push('Validity period must be a positive integer when provided.');
    }

    if (errors.length > 0) {
        return { errors };
    }

    return {
        errors: null,
        data: {
            type,
            name,
            description,
            price,
            numberOfClasses,
            validityPeriodDays: validity
        }
    };
}

function validateClassBookingPayload(payload) {
    const errors = [];
    const classId = Number.parseInt(payload.classId, 10);
    const customerName = typeof payload.customerName === 'string' && payload.customerName.trim()
        ? payload.customerName.trim()
        : '';
    const email = typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : '';
    const phone = typeof payload.phone === 'string' && payload.phone.trim() ? payload.phone.trim() : '';
    const peopleCount = Number.parseInt(payload.peopleCount ?? 1, 10);

    if (!Number.isInteger(classId) || classId <= 0) {
        errors.push('Valid classId is required.');
    }
    if (!customerName) {
        errors.push('Customer name is required.');
    }
    if (!email) {
        errors.push('Email is required.');
    }
    if (!phone) {
        errors.push('Phone is required.');
    }
    if (!Number.isInteger(peopleCount) || peopleCount <= 0) {
        errors.push('peopleCount must be a positive integer.');
    }

    if (errors.length > 0) {
        return { errors };
    }

    return {
        errors: null,
        data: {
            classId,
            customerName,
            email,
            phone,
            peopleCount
        }
    };
}

// ===== ROUTES =====

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        timezone: 'Asia/Hong_Kong'
    });
});

app.post('/api/admin/login', async (req, res) => {
    if (ADMIN_AUTH_DISABLED) {
        const issuedAt = Date.now();
        const expiresAt = issuedAt + ADMIN_TOKEN_TTL_MS;
        return res.json({
            success: true,
            token: 'dev-admin-token',
            tokenType: 'Bearer',
            expiresAt: new Date(expiresAt).toISOString(),
            message: 'Development login (no password required)'
        });
    }

    try {
        const { password } = req.body || {};

        if (typeof password !== 'string' || password.length === 0) {
            return res.status(400).json({ error: 'Password is required' });
        }

        const settings = await loadSettings();
        const storedPassword = settings.adminPassword || DEFAULT_ADMIN_PASSWORD;

        if (password !== storedPassword) {
            console.warn('Admin login failed: incorrect shared password');
            return res.status(401).json({ success: false, error: 'Invalid password' });
        }

        const { token, expiresAt } = issueAdminToken();

        res.json({
            success: true,
            token,
            tokenType: 'Bearer',
            expiresAt: new Date(expiresAt).toISOString(),
            message: 'Login successful'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/admin/change-password', authenticateAdmin, async (req, res) => {
    if (ADMIN_AUTH_DISABLED) {
        return res.json({
            success: true,
            message: 'Development mode: admin password changes are disabled while authentication is off.'
        });
    }

    try {
        const { oldPassword, currentPassword, newPassword } = req.body || {};
        const providedCurrent = typeof currentPassword === 'string' && currentPassword.length > 0
            ? currentPassword
            : (typeof oldPassword === 'string' ? oldPassword : '');

        if (!providedCurrent || typeof newPassword !== 'string' || newPassword.length === 0) {
            return res.status(400).json({ error: 'Both current and new passwords are required' });
        }

        const settings = await loadSettings();
        const storedPassword = settings.adminPassword || DEFAULT_ADMIN_PASSWORD;

        if (providedCurrent !== storedPassword) {
            console.warn('Admin password change rejected: incorrect current password');
            return res.status(401).json({ error: 'Current password incorrect' });
        }

        settings.adminPassword = newPassword;
        const saved = await saveSettings(settings);

        if (saved) {
            activeAdminTokens.clear();
            res.json({
                success: true,
                message: 'Password changed successfully'
            });
        } else {
            res.status(500).json({ error: 'Failed to save new password' });
        }
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const settings = await loadSettings();
        const publicSettings = { ...settings };
        delete publicSettings.adminPassword;
        res.json(publicSettings);
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ error: 'Failed to retrieve settings' });
    }
});

app.put('/api/settings', authenticateAdmin, async (req, res) => {
    try {
        const currentSettings = await loadSettings();
        if (req.body.operatingHours) {
            const { startTime, endTime } = req.body.operatingHours;
            const start = startTime ? parseTimeToMinutes(startTime) : null;
            const end = endTime ? parseTimeToMinutes(endTime) : null;
            if (startTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
                return res.status(400).json({ error: 'Invalid opening time format' });
            }
            if (endTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime)) {
                return res.status(400).json({ error: 'Invalid closing time format' });
            }
            if (start !== null && end !== null && start >= end) {
                return res.status(400).json({ error: 'Opening time must be before closing time' });
            }
        }

        const mergedPricing = {
            ...currentSettings.pricing,
            ...(req.body.pricing || {})
        };

        const updatedSettings = {
            ...currentSettings,
            ...req.body,
            pricing: mergedPricing,
            adminPassword: currentSettings.adminPassword,
            updatedAt: new Date().toISOString()
        };

        const saved = await saveSettings(updatedSettings);
        if (saved) {
            const publicSettings = { ...updatedSettings };
            delete publicSettings.adminPassword;
            res.json({
                success: true,
                settings: publicSettings,
                message: 'Settings updated successfully'
            });
        } else {
            res.status(500).json({ error: 'Failed to save settings' });
        }
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

app.get('/api/bookings', authenticateAdmin, async (req, res) => {
    try {
        const bookings = await getBookings({
            date: req.query.date,
            status: req.query.status
        });

        res.json(bookings);
    } catch (error) {
        console.error('Error getting bookings:', error);
        res.status(500).json({ error: 'Failed to retrieve bookings' });
    }
});

app.get('/api/bookings/:id', async (req, res) => {
    try {
        const booking = await getBookingById(req.params.id);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json(booking);
    } catch (error) {
        console.error('Error getting booking:', error);
        res.status(500).json({ error: 'Failed to retrieve booking' });
    }
});

app.patch('/api/bookings/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;

        const validStatuses = ['pending', 'confirmed', 'cancelled'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({
                error: 'Invalid status. Must be: pending, confirmed, or cancelled'
            });
        }

        const booking = await getBookingById(id);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        if (status === 'confirmed' && booking.status !== 'confirmed') {
            const settings = await loadSettings();
            for (const item of booking.items) {
                if (item.itemType === 'room_rental') {
                    const conflicts = await getRoomConflicts(item.date, item.startTime, item.endTime, booking.id);
                    if (conflicts.length > 0) {
                        return res.status(400).json({
                            error: 'Cannot confirm booking. Time slot is already taken.'
                        });
                    }
                }

                if (item.catalogItemId) {
                    const catalogItem = await getCatalogItemById(item.catalogItemId);
                    if (!catalogItem) {
                        return res.status(400).json({
                            error: 'Linked catalog item no longer exists.'
                        });
                    }

                    const usedCapacity = await getCatalogItemCapacityUsage(item.catalogItemId, booking.id);
                    if (usedCapacity + item.peopleCount > catalogItem.capacity) {
                        return res.status(400).json({
                            error: `Cannot confirm booking. Capacity exceeded for ${catalogItem.name}.`
                        });
                    }
                }

                if (item.itemType === 'room_rental') {
                    try {
                        resolveHourlyRate(settings.pricing, item.peopleCount, item.periodType || 'normal');
                    } catch (priceError) {
                        return res.status(400).json({ error: priceError.message });
                    }
                }
            }
        }

        const updatedBooking = await updateBookingStatus(id, status, adminNotes);

        if (!updatedBooking) {
            return res.status(500).json({ error: 'Failed to update booking status' });
        }

        res.json({
            success: true,
            booking: updatedBooking,
            message: `Booking ${status} successfully`
        });

    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ error: 'Failed to update booking status' });
    }
});

app.delete('/api/bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        const deleted = await deleteBooking(req.params.id);

        if (!deleted) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        res.json({
            success: true,
            message: 'Booking deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ error: 'Failed to delete booking' });
    }
});

app.get('/api/stats', authenticateAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const stats = await getStats(today);

        res.json(stats);
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
});

app.get('/api/availability', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date parameter required' });
        }

        const availability = await getRentalAvailability(date);
        res.json(availability);
    } catch (error) {
        console.error('Error getting availability:', error);
        res.status(500).json({ error: 'Failed to retrieve availability' });
    }
});

app.get('/api/rentals/availability', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date parameter required' });
        }

        const availability = await getRentalAvailability(date);
        res.json(availability);
    } catch (error) {
        console.error('Error getting rental availability:', error);
        res.status(500).json({ error: 'Failed to retrieve rental availability' });
    }
});

app.get('/api/items', async (req, res) => {
    try {
        const items = await getCatalogItems();
        const enriched = await buildCatalogItemResponse(items);
        const workshops = enriched.filter(item => item.type === 'workshop_class');
        const rentals = enriched.filter(item => item.type === 'room_rental');

        res.json({
            workshops,
            roomRentals: rentals
        });
    } catch (error) {
        console.error('Error getting catalog items:', error);
        res.status(500).json({ error: 'Failed to retrieve items' });
    }
});

app.get('/api/classes', async (req, res) => {
    try {
        const { date, start, end, includeTrial, onlyTrial } = req.query;
        const filters = { includePast: false };
        if (date) {
            filters.onDate = date;
        } else {
            if (start) {
                filters.startDate = start;
            }
            if (end) {
                filters.endDate = end;
            }
        }
        const classes = await getClasses(filters);
        let filtered = classes;
        if (onlyTrial === 'true') {
            filtered = filtered.filter(cls => cls.isTrialOnly);
        } else if (includeTrial !== 'true') {
            filtered = filtered.filter(cls => !cls.isTrialOnly);
        }
        const enriched = await buildClassResponse(filtered);
        res.json(enriched);
    } catch (error) {
        console.error('Error getting classes:', error);
        res.status(500).json({ error: 'Failed to retrieve classes' });
    }
});

app.get('/api/classes/:id', async (req, res) => {
    try {
        const cls = await getClassById(req.params.id);
        if (!cls) {
            return res.status(404).json({ error: 'Class not found' });
        }

        const [enriched] = await buildClassResponse([cls]);
        res.json(enriched);
    } catch (error) {
        console.error('Error getting class details:', error);
        res.status(500).json({ error: 'Failed to retrieve class' });
    }
});

app.post('/api/class-bookings', async (req, res) => {
    try {
        const { errors, data } = validateClassBookingPayload(req.body || {});
        if (errors) {
            return res.status(400).json({ error: errors.join(' ') });
        }

        const cls = await getClassById(data.classId);
        if (!cls) {
            return res.status(404).json({ error: 'Class not found' });
        }

        if (cls.isTrialOnly) {
            return res.status(400).json({ error: 'This class is only available through trial plans.' });
        }

        const used = await getClassCapacityUsage(cls.id);
        if (used + data.peopleCount > cls.capacity) {
            const remaining = Math.max(cls.capacity - used, 0);
            return res.status(400).json({
                error: remaining > 0
                    ? `Only ${remaining} seat(s) remaining for ${cls.name}.`
                    : `${cls.name} is fully booked.`
            });
        }

        const booking = await createClassBooking({
            ...data,
            status: 'pending'
        });

        res.status(201).json({
            success: true,
            booking
        });
    } catch (error) {
        console.error('Error creating class booking:', error);
        res.status(500).json({ error: 'Failed to create class booking' });
    }
});

app.get('/api/class-products', async (req, res) => {
    try {
        const { type } = req.query;
        const products = await getClassProducts({ type: type === 'trial' ? 'trial' : type === 'package' ? 'package' : null });
        res.json(products);
    } catch (error) {
        console.error('Error getting class products:', error);
        res.status(500).json({ error: 'Failed to retrieve class products' });
    }
});

app.get('/api/admin/items', authenticateAdmin, async (req, res) => {
    try {
        const items = await getCatalogItems({ includePast: true });
        const enriched = await buildCatalogItemResponse(items);
        res.json(enriched);
    } catch (error) {
        console.error('Error listing catalog items:', error);
        res.status(500).json({ error: 'Failed to retrieve items' });
    }
});

app.get('/api/admin/classes', authenticateAdmin, async (req, res) => {
    try {
        const { includePast, start, end } = req.query;
        const classes = await getClasses({
            includePast: includePast === 'true',
            startDate: start,
            endDate: end
        });
        const enriched = await buildClassResponse(classes);
        res.json(enriched);
    } catch (error) {
        console.error('Error listing classes:', error);
        res.status(500).json({ error: 'Failed to retrieve classes' });
    }
});

app.get('/api/admin/classes/:id/bookings', authenticateAdmin, async (req, res) => {
    try {
        const cls = await getClassById(req.params.id);
        if (!cls) {
            return res.status(404).json({ error: 'Class not found' });
        }

        const bookings = await getClassBookings(cls.id);
        res.json({
            class: cls,
            bookings
        });
    } catch (error) {
        console.error('Error listing class bookings:', error);
        res.status(500).json({ error: 'Failed to retrieve class bookings' });
    }
});

app.post('/api/admin/classes', authenticateAdmin, async (req, res) => {
    try {
        const { errors, data } = validateClassPayload(req.body || {});
        if (errors) {
            return res.status(400).json({ error: errors.join(' ') });
        }

        const cls = await createClass(data);
        const [enriched] = await buildClassResponse([cls]);
        res.status(201).json(enriched);
    } catch (error) {
        console.error('Error creating class:', error);
        res.status(500).json({ error: 'Failed to create class' });
    }
});

app.put('/api/admin/classes/:id', authenticateAdmin, async (req, res) => {
    try {
        const { errors, data } = validateClassPayload(req.body || {});
        if (errors) {
            return res.status(400).json({ error: errors.join(' ') });
        }

        const updated = await updateClass(req.params.id, data);
        if (!updated) {
            return res.status(404).json({ error: 'Class not found' });
        }

        const [enriched] = await buildClassResponse([updated]);
        res.json(enriched);
    } catch (error) {
        console.error('Error updating class:', error);
        res.status(500).json({ error: 'Failed to update class' });
    }
});

app.delete('/api/admin/classes/:id', authenticateAdmin, async (req, res) => {
    try {
        const deleted = await deleteClass(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Class not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting class:', error);
        res.status(500).json({ error: 'Failed to delete class' });
    }
});

app.get('/api/admin/class-products', authenticateAdmin, async (req, res) => {
    try {
        const { type } = req.query;
        const products = await getClassProducts({ type: type === 'trial' ? 'trial' : type === 'package' ? 'package' : null });
        res.json(products);
    } catch (error) {
        console.error('Error listing class products:', error);
        res.status(500).json({ error: 'Failed to retrieve class products' });
    }
});

app.post('/api/admin/class-products', authenticateAdmin, async (req, res) => {
    try {
        const { errors, data } = validateClassProductPayload(req.body || {});
        if (errors) {
            return res.status(400).json({ error: errors.join(' ') });
        }

        const product = await createClassProduct(data);
        res.status(201).json(product);
    } catch (error) {
        console.error('Error creating class product:', error);
        res.status(500).json({ error: 'Failed to create class product' });
    }
});

app.put('/api/admin/class-products/:id', authenticateAdmin, async (req, res) => {
    try {
        const { errors, data } = validateClassProductPayload(req.body || {});
        if (errors) {
            return res.status(400).json({ error: errors.join(' ') });
        }

        const product = await updateClassProduct(req.params.id, data);
        if (!product) {
            return res.status(404).json({ error: 'Class product not found' });
        }

        res.json(product);
    } catch (error) {
        console.error('Error updating class product:', error);
        res.status(500).json({ error: 'Failed to update class product' });
    }
});

app.delete('/api/admin/class-products/:id', authenticateAdmin, async (req, res) => {
    try {
        const deleted = await deleteClassProduct(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Class product not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting class product:', error);
        res.status(500).json({ error: 'Failed to delete class product' });
    }
});

app.get('/api/admin/bookings/overview', authenticateAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date parameter required' });
        }

        const bookings = await getBookings({ date });
        const studioSessions = [];
        const classSessionsMap = new Map();

        bookings.forEach(booking => {
            (booking.items || []).forEach(item => {
                if (item.date !== date) {
                    return;
                }

                if (item.itemType === 'room_rental') {
                    studioSessions.push({
                        bookingId: booking.id,
                        startTime: item.startTime,
                        endTime: item.endTime,
                        peopleCount: item.peopleCount,
                        status: booking.status,
                        customerName: booking.customerName,
                        email: booking.email,
                        phone: booking.phone,
                        notes: booking.adminNotes || null
                    });
                } else if (item.catalogItemId) {
                    const entry = classSessionsMap.get(item.catalogItemId) || {
                        attendees: [],
                        totalParticipants: 0
                    };

                    entry.attendees.push({
                        bookingId: booking.id,
                        customerName: booking.customerName,
                        email: booking.email,
                        phone: booking.phone,
                        peopleCount: item.peopleCount,
                        status: booking.status,
                        notes: booking.adminNotes || null
                    });
                    entry.totalParticipants += item.peopleCount;
                    classSessionsMap.set(item.catalogItemId, entry);
                }
            });
        });

        studioSessions.sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

        const classIds = Array.from(classSessionsMap.keys());
        let classDetailsMap = new Map();
        if (classIds.length > 0) {
            const classDetails = await getCatalogItemsByIds(classIds);
            classDetailsMap = new Map(classDetails.map(cls => [cls.id, cls]));
        }

        const classSessions = classIds.map(id => {
            const session = classSessionsMap.get(id);
            const detail = classDetailsMap.get(id) || {};
            const startTimestamp = detail.startDateTime ? new Date(detail.startDateTime).getTime() : 0;
            const seatsRemaining = Math.max((detail.capacity || 0) - session.totalParticipants, 0);

            const attendees = session.attendees.sort((a, b) => a.customerName.localeCompare(b.customerName));

            return {
                classId: id,
                name: detail.name || 'Unnamed Class',
                description: detail.description || '',
                instructorName: detail.instructorName || null,
                startDateTime: detail.startDateTime || null,
                endDateTime: detail.endDateTime || null,
                capacity: detail.capacity || 0,
                totalParticipants: session.totalParticipants,
                seatsRemaining,
                attendees,
                _sortKey: startTimestamp
            };
        }).sort((a, b) => a._sortKey - b._sortKey).map(({ _sortKey, ...rest }) => rest);

        res.json({
            date,
            studioSessions,
            classSessions
        });
    } catch (error) {
        console.error('Error building booking overview:', error);
        res.status(500).json({ error: 'Failed to retrieve booking overview' });
    }
});

function validateCatalogItemPayload(payload) {
    const errors = [];
    const type = payload.type;

    if (!['workshop_class', 'room_rental'].includes(type)) {
        errors.push('Invalid item type.');
    }

    if (!payload.name) {
        errors.push('Name is required.');
    }

    const description = typeof payload.description === 'string'
        ? payload.description.trim()
        : (payload.description ? String(payload.description).trim() : '');

    const start = payload.startDateTime || payload.start_datetime;
    const end = payload.endDateTime || payload.end_datetime;
    let startInfo = normalizeIsoToDateTimeStrings(start);
    let endInfo = normalizeIsoToDateTimeStrings(end);

    if (!startInfo) {
        errors.push('Start date and time are required.');
    }

    if (!endInfo && payload.duration == null) {
        errors.push('Provide either end date/time or duration in minutes.');
    }

    let duration = Number(payload.duration);
    if (Number.isNaN(duration) || duration <= 0) {
        if (startInfo && endInfo) {
            duration = minutesBetween(startInfo.time, endInfo.time);
        }
    }

    if (!Number.isFinite(duration) || duration <= 0) {
        errors.push('Duration must be a positive number of minutes.');
    }

    const price = Number(payload.price);
    if (Number.isNaN(price) || price < 0) {
        errors.push('Price must be a valid number.');
    }

    const capacity = parseInt(payload.capacity, 10);
    if (!Number.isInteger(capacity) || capacity <= 0) {
        errors.push('Capacity must be a positive integer.');
    }

    if (errors.length > 0) {
        return { errors };
    }

    if (!endInfo && startInfo) {
        const endMinutes = parseTimeToMinutes(startInfo.time) + duration;
        endInfo = {
            date: startInfo.date,
            time: minutesToTimeString(endMinutes)
        };
    }

    return {
        data: {
            type,
            name: payload.name,
            description,
            startDateTime: `${startInfo.date}T${startInfo.time}:00`,
            endDateTime: `${endInfo.date}T${endInfo.time}:00`,
            duration,
            price,
            instructorName: payload.instructorName || payload.instructor_name || null,
            capacity
        }
    };
}

app.post('/api/admin/items', authenticateAdmin, async (req, res) => {
    try {
        const { errors, data } = validateCatalogItemPayload(req.body);
        if (errors) {
            return res.status(400).json({ error: errors.join(' ') });
        }

        const item = await createCatalogItem(data);
        const enriched = await buildCatalogItemResponse([item]);
        res.status(201).json(enriched[0]);
    } catch (error) {
        console.error('Error creating catalog item:', error);
        res.status(500).json({ error: 'Failed to create item' });
    }
});

app.put('/api/admin/items/:id', authenticateAdmin, async (req, res) => {
    try {
        const { errors, data } = validateCatalogItemPayload(req.body);
        if (errors) {
            return res.status(400).json({ error: errors.join(' ') });
        }

        const updated = await updateCatalogItem(req.params.id, data);
        if (!updated) {
            return res.status(404).json({ error: 'Item not found' });
        }

        const enriched = await buildCatalogItemResponse([updated]);
        res.json(enriched[0]);
    } catch (error) {
        console.error('Error updating catalog item:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

app.delete('/api/admin/items/:id', authenticateAdmin, async (req, res) => {
    try {
        const deleted = await deleteCatalogItem(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Item not found' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting catalog item:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

app.post('/api/bookings', bookingCreationLimiter, async (req, res) => {
    try {
        const { customerName, email, phone, notes, bookingItems } = req.body;

        if (!customerName || !email || !phone) {
            return res.status(400).json({
                error: 'Customer name, email, and phone are required.'
            });
        }

        if (!Array.isArray(bookingItems) || bookingItems.length === 0) {
            return res.status(400).json({ error: 'At least one booking item is required.' });
        }

        const settings = await loadSettings();
        const normalizedItems = [];
        const catalogUsage = new Map();

        for (let index = 0; index < bookingItems.length; index += 1) {
            const item = bookingItems[index];
            const itemLabel = `Item #${index + 1}`;

            const peopleCount = parseInt(item.peopleCount, 10);
            if (!Number.isInteger(peopleCount) || peopleCount <= 0) {
                return res.status(400).json({ error: `${itemLabel}: peopleCount must be a positive integer.` });
            }

            if (peopleCount > 18) {
                return res.status(400).json({ error: `${itemLabel}: maximum of 18 people per session.` });
            }

            let catalogItem = null;
            if (item.catalogItemId) {
                catalogItem = await getCatalogItemById(item.catalogItemId);
                if (!catalogItem) {
                    return res.status(400).json({ error: `${itemLabel}: linked item not found.` });
                }
            }

            const itemType = catalogItem ? catalogItem.type : (item.type || 'room_rental');
            let date;
            let startTime;
            let endTime;
            let duration;

            if (catalogItem) {
                const startInfo = normalizeIsoToDateTimeStrings(catalogItem.startDateTime);
                const endInfo = normalizeIsoToDateTimeStrings(catalogItem.endDateTime);
                if (!startInfo || !endInfo) {
                    return res.status(400).json({ error: `${itemLabel}: invalid catalog item schedule.` });
                }

                date = startInfo.date;
                startTime = startInfo.time;
                endTime = endInfo.time;
                duration = catalogItem.duration;

                const usedCapacity = await getCatalogItemCapacityUsage(catalogItem.id);
                const alreadySelected = catalogUsage.get(catalogItem.id) || 0;
                if (usedCapacity + alreadySelected + peopleCount > catalogItem.capacity) {
                    const remaining = Math.max(catalogItem.capacity - usedCapacity - alreadySelected, 0);
                    return res.status(400).json({
                        error: `${catalogItem.name} has only ${remaining} seats remaining.`
                    });
                }
                catalogUsage.set(catalogItem.id, alreadySelected + peopleCount);
            } else {
                date = item.date;
                startTime = item.startTime;
                endTime = item.endTime;
                if (!date || !startTime || !endTime) {
                    return res.status(400).json({ error: `${itemLabel}: date, startTime, and endTime are required.` });
                }
                duration = minutesBetween(startTime, endTime);
            }

            if (duration <= 0) {
                return res.status(400).json({ error: `${itemLabel}: end time must be after start time.` });
            }

            const periodType = itemType === 'room_rental'
                ? determinePeriodType(date, startTime, endTime, settings)
                : 'catalog';

            if (itemType === 'room_rental') {
                const operatingHours = settings.operatingHours || {};
                const openingStart = operatingHours.startTime || '07:00';
                const openingEnd = operatingHours.endTime || '22:00';
                const openingStartMinutes = parseTimeToMinutes(openingStart);
                const openingEndMinutes = parseTimeToMinutes(openingEnd);
                const itemStartMinutes = parseTimeToMinutes(startTime);
                const itemEndMinutes = parseTimeToMinutes(endTime);

                if (itemStartMinutes < openingStartMinutes || itemEndMinutes > openingEndMinutes) {
                    return res.status(400).json({
                        error: `${itemLabel}: selected time must fall within studio hours (${openingStart}-${openingEnd}).`
                    });
                }

                if (hasInPayloadRoomConflict(normalizedItems, date, startTime, endTime)) {
                    return res.status(400).json({
                        error: `${itemLabel}: selected time overlaps with another session in your booking.`
                    });
                }

                const conflicts = await getRoomConflicts(date, startTime, endTime);
                if (conflicts.length > 0) {
                    return res.status(400).json({
                        error: `${itemLabel}: selected time overlaps with an existing booking.`
                    });
                }
            }

            let price;
            if (itemType === 'room_rental') {
                price = calculateRoomRentalPrice({ duration, peopleCount, periodType }, settings);
            } else {
                const catalogPrice = catalogItem ? catalogItem.price : Number(item.price);
                if (Number.isNaN(catalogPrice) || catalogPrice < 0) {
                    return res.status(400).json({ error: `${itemLabel}: invalid catalog price.` });
                }
                price = Math.round(catalogPrice * peopleCount * 100) / 100;
            }

            normalizedItems.push({
                catalogItemId: catalogItem ? catalogItem.id : null,
                itemType,
                date,
                startTime,
                endTime,
                duration,
                peopleCount,
                price,
                periodType
            });
        }

        const status = settings.bookingRules?.autoConfirm ? 'confirmed' : 'pending';
        const bookingPayload = {
            customerName,
            email,
            phone,
            notes: notes || '',
            status,
            items: normalizedItems
        };

        const booking = await createBooking(bookingPayload);
        const message = status === 'confirmed'
            ? 'Booking confirmed successfully!'
            : 'Booking created successfully. Please send payment confirmation.';

        res.status(201).json({
            success: true,
            booking,
            message
        });
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ error: 'Failed to create booking' });
    }
});

async function startServer() {
    try {
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log('====================================');
            console.log('🚀 Booking Server Running');
            console.log('====================================');
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌐 API: http://localhost:${PORT}/api`);
            console.log(`🔐 Shared Admin Password: ${DEFAULT_ADMIN_PASSWORD}`);
            console.log('⚠️  PLEASE CHANGE THE DEFAULT PASSWORD!');
            console.log('====================================');
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
