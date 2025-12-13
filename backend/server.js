require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
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
    getClassBookingById,
    getClassBookingsByClassIds,
    getClassBookingsDetailed,
    updateClassBookingStatus,
    deleteClassBooking,
    getClassProducts,
    createClassProduct,
    updateClassProduct,
    deleteClassProduct,
    checkClassScheduleAvailability,
    checkClassScheduleAvailability,
    checkRentalAvailability,
    getPool,
    hashPassword,
    verifyPassword,
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

const ADMIN_AUTH_DISABLED = String(process.env.ADMIN_AUTH_DISABLED).toLowerCase() === 'true';

const activeAdminTokens = new Map();
const bookingCreationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many booking attempts. Please try again shortly.' }
});

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/admin', express.static(path.join(__dirname, '../admin')));

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

function issueAdminToken(user) {
    const token = crypto.randomBytes(32).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ADMIN_TOKEN_TTL_MS;

    activeAdminTokens.set(token, {
        issuedAt,
        expiresAt,
        id: user.id || null,
        username: user.username || 'admin',
        role: user.role || 'super_admin'
    });

    return {
        token,
        issuedAt,
        expiresAt,
        role: user.role || 'super_admin',
        username: user.username || 'admin'
    };
}

async function authenticateAdmin(req, res, next) {
    if (ADMIN_AUTH_DISABLED) {
        req.admin = { role: 'super_admin', username: 'dev' };
        return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const metadata = activeAdminTokens.get(token);

    // Support legacy shared password if present (fallback) usually via login endpoint logic, 
    // but here we check active tokens.
    if (!metadata) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (Date.now() > metadata.expiresAt) {
        activeAdminTokens.delete(token);
        return res.status(401).json({ error: 'Token expired' });
    }

    req.admin = {
        expiresAt: new Date(tokenMetadata.expiresAt).toISOString()
    };

    next();
}

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Check for Admin Users in DB
        if (username && password) {
            const pool = getPool();
            const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
            const user = result.rows[0];

            if (user && verifyPassword(password, user.password_hash)) {
                const tokenData = issueAdminToken(user);
                return res.json({
                    success: true,
                    token: tokenData.token,
                    expiresAt: new Date(tokenData.expiresAt).toISOString(),
                    role: user.role,
                    username: user.username
                });
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Fallback for old shared password if username is missing
        if (!username && password) {
            const settings = await loadSettings();
            if (password === settings.adminPassword) {
                const tokenData = issueAdminToken({ username: 'legacy_admin', role: 'super_admin' });
                return res.json({
                    success: true,
                    token: tokenData.token,
                    expiresAt: new Date(tokenData.expiresAt).toISOString(),
                    role: 'super_admin',
                    username: 'legacy_admin'
                });
            }
        }

        return res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

function requireRole(requiredRole) {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // super_admin can do anything
        if (req.admin.role === 'super_admin') {
            return next();
        }

        if (req.admin.role !== requiredRole) {
            return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
        }

        next();
    };
}

// Create Admin User (Super Admin only)
app.post('/api/admin/users', authenticateAdmin, requireRole('super_admin'), async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Username, password, and role are required' });
        }

        if (!['super_admin', 'receptionist'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const pool = getPool();

        // Check if username exists
        const existing = await pool.query('SELECT id FROM admin_users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        const passwordHash = hashPassword(password);

        await pool.query(
            'INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3)',
            [username, passwordHash, role]
        );

        res.status(201).json({ success: true, message: 'User created' });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

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

function formatDateOnly(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

function formatDateTimeForICS(date, time) {
    const parsed = new Date(`${date}T${time}`);
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }

    const pad = (value) => value.toString().padStart(2, '0');
    return `${parsed.getUTCFullYear()}${pad(parsed.getUTCMonth() + 1)}${pad(parsed.getUTCDate())}`
        + `T${pad(parsed.getUTCHours())}${pad(parsed.getUTCMinutes())}${pad(parsed.getUTCSeconds())}Z`;
}

function escapeIcsText(value = '') {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

function buildIcsForBooking(booking) {
    if (!booking?.items?.length) {
        return null;
    }

    const events = booking.items
        .map((item, index) => {
            const dtStart = formatDateTimeForICS(item.date, item.startTime);
            const dtEnd = formatDateTimeForICS(item.date, item.endTime);

            if (!dtStart || !dtEnd) {
                return null;
            }

            const summary = escapeIcsText(`場地預約 ${booking.customerName || ''}`.trim());
            const descriptionLines = [
                `預約編號：${booking.id}`,
                booking.customerName ? `姓名：${booking.customerName}` : null,
                booking.email ? `Email：${booking.email}` : null,
                booking.phone ? `電話：${booking.phone}` : null,
                booking.status ? `狀態：${booking.status}` : null
            ].filter(Boolean);

            return [
                'BEGIN:VEVENT',
                `UID:${booking.id}-${index}@studio-booking`,
                `SUMMARY:${summary}`,
                `DTSTART:${dtStart}`,
                `DTEND:${dtEnd}`,
                `LOCATION:${escapeIcsText(item.itemType === 'room_rental' ? '場地' : '課程')}`,
                `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
                'END:VEVENT'
            ].join('\n');
        })
        .filter(Boolean);

    if (!events.length) {
        return null;
    }

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Studio Booking//EN',
        ...events,
        'END:VCALENDAR'
    ].join('\n');
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

    const classes = await getClasses({ onDate: date });
    classes.forEach(cls => {
        const startInfo = normalizeIsoToDateTimeStrings(cls.startTime);
        const endInfo = normalizeIsoToDateTimeStrings(cls.endTime);

        if (!startInfo || !endInfo || startInfo.date !== date || endInfo.date !== date) {
            return;
        }

        const classSlots = generateSlotsForRange(startInfo.time, endInfo.time);
        confirmedSlots.push(...classSlots);
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
    const endTimeRaw = payload.endTime ? new Date(payload.endTime) : null;
    const durationMinutes = payload.duration === null || payload.duration === undefined
        ? null
        : Number.parseInt(payload.duration, 10);
    const capacity = Number.parseInt(payload.capacity, 10);
    const price = Number.parseFloat(payload.price);
    const specialPriceForTwoRaw = payload.specialPriceForTwo;
    const specialPriceForTwo = specialPriceForTwoRaw === null || specialPriceForTwoRaw === undefined || specialPriceForTwoRaw === ''
        ? null
        : Number.parseFloat(specialPriceForTwoRaw);
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

    let endTime = endTimeRaw;

    if ((!endTime || Number.isNaN(endTime.getTime())) && Number.isInteger(durationMinutes) && durationMinutes > 0) {
        endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + durationMinutes);
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

    if (specialPriceForTwo !== null && (!Number.isFinite(specialPriceForTwo) || specialPriceForTwo < 0)) {
        errors.push('Special price for two must be a positive number when provided.');
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
            specialPriceForTwo,
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
        const storedPassword = (settings && typeof settings.adminPassword === 'string' && settings.adminPassword.length > 0)
            ? settings.adminPassword
            : DEFAULT_ADMIN_PASSWORD;

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

async function deleteBookingHandler(req, res) {
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
}

app.delete('/api/admin/bookings/:id', authenticateAdmin, deleteBookingHandler);

app.delete('/api/bookings/:id', authenticateAdmin, deleteBookingHandler);

app.get('/api/bookings/:id/ics', async (req, res) => {
    try {
        const booking = await getBookingById(req.params.id);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        const icsContent = buildIcsForBooking(booking);

        if (!icsContent) {
            return res.status(400).json({ error: 'Booking has no schedule to export' });
        }

        res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=booking-${booking.id}.ics`);
        res.send(icsContent);
    } catch (error) {
        console.error('Error generating booking ICS:', error);
        res.status(500).json({ error: 'Failed to generate calendar file' });
    }
});

app.get('/api/stats', authenticateAdmin, async (req, res) => {
    try {
        const today = formatDateOnly(new Date());
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
        const { date, start, end, includeTrial, onlyTrial, weekStart } = req.query;
        const filters = { includePast: false };
        if (date) {
            filters.onDate = date;
        } else if (weekStart) {
            const startDate = new Date(`${weekStart}T00:00:00`);
            if (!Number.isNaN(startDate.getTime())) {
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
                filters.startDate = startDate.toISOString();
                filters.endDate = endDate.toISOString();
            }
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

        const availability = await checkClassScheduleAvailability(data.startTime, data.endTime);
        if (!availability.available) {
            return res.status(400).json({ error: '時間衝突：此時段已有場地租用或課堂安排' });
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

        const availability = await checkClassScheduleAvailability(data.startTime, data.endTime, req.params.id);
        if (!availability.available) {
            return res.status(400).json({ error: '時間衝突：此時段已有場地租用或課堂安排' });
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

app.get('/api/admin/class-bookings', authenticateAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        const bookings = await getClassBookingsDetailed({ date: date || null });
        res.json(bookings);
    } catch (error) {
        console.error('Error listing class bookings:', error);
        res.status(500).json({ error: 'Failed to retrieve class bookings' });
    }
});

app.patch('/api/admin/class-bookings/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body || {};
        const validStatuses = ['pending', 'confirmed', 'cancelled'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be pending, confirmed, or cancelled.' });
        }

        const booking = await getClassBookingById(id);
        if (!booking) {
            return res.status(404).json({ error: 'Class booking not found' });
        }

        if (status === 'confirmed' && booking.status !== 'confirmed') {
            const usedCapacity = await getClassCapacityUsage(booking.classId, booking.id);
            const classCapacity = Number.isFinite(booking.classCapacity)
                ? booking.classCapacity
                : (await getClassById(booking.classId))?.capacity ?? 0;

            if (usedCapacity + booking.peopleCount > classCapacity) {
                const remaining = Math.max(classCapacity - usedCapacity, 0);
                return res.status(400).json({
                    error: remaining > 0
                        ? `Only ${remaining} seat(s) remaining for ${booking.className || 'the class'}.`
                        : `${booking.className || 'The class'} is fully booked.`
                });
            }
        }

        const updated = await updateClassBookingStatus(id, status);
        if (!updated) {
            return res.status(500).json({ error: 'Failed to update class booking status' });
        }

        const refreshed = await getClassBookingById(id);

        res.json({
            success: true,
            booking: refreshed,
            message: `Class booking ${status} successfully`
        });
    } catch (error) {
        console.error('Error updating class booking status:', error);
        res.status(500).json({ error: 'Failed to update class booking status' });
    }
});

app.delete('/api/admin/class-bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await getClassBookingById(id);
        if (!booking) {
            return res.status(404).json({ error: 'Class booking not found' });
        }

        const deleted = await deleteClassBooking(id);
        if (!deleted) {
            return res.status(500).json({ error: 'Failed to delete class booking' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting class booking:', error);
        res.status(500).json({ error: 'Failed to delete class booking' });
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
                }
            });
        });

        studioSessions.sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

        const classes = await getClasses({ includePast: true, onDate: date });
        const classIds = classes.map(cls => cls.id);
        const bookingsByClass = new Map();

        if (classIds.length > 0) {
            const classBookings = await getClassBookingsByClassIds(classIds);
            classBookings.forEach(entry => {
                const list = bookingsByClass.get(entry.classId) || [];
                list.push(entry);
                bookingsByClass.set(entry.classId, list);
            });
        }

        const classSessions = classes.map(cls => {
            const attendeesRaw = (bookingsByClass.get(cls.id) || []).slice();
            attendeesRaw.sort((a, b) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return aTime - bTime;
            });

            const totalParticipants = attendeesRaw.reduce((sum, bookingEntry) => sum + bookingEntry.peopleCount, 0);

            const attendees = attendeesRaw.map(entry => ({
                bookingId: entry.id,
                customerName: entry.customerName,
                email: entry.email,
                phone: entry.phone,
                peopleCount: entry.peopleCount,
                status: entry.status,
                createdAt: entry.createdAt
            }));

            return {
                classId: cls.id,
                name: cls.name,
                description: cls.description || '',
                instructorName: cls.instructor || null,
                location: cls.location || null,
                startDateTime: cls.startTime,
                endDateTime: cls.endTime,
                capacity: cls.capacity,
                price: cls.price,
                totalParticipants,
                seatsRemaining: Math.max(cls.capacity - totalParticipants, 0),
                attendees
            };
        }).sort((a, b) => {
            const aTime = a.startDateTime ? new Date(a.startDateTime).getTime() : 0;
            const bTime = b.startDateTime ? new Date(b.startDateTime).getTime() : 0;
            return aTime - bTime;
        });

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

app.post('/api/admin/items', authenticateAdmin, requireRole('super_admin'), async (req, res) => {
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

app.put('/api/admin/items/:id', authenticateAdmin, requireRole('super_admin'), async (req, res) => {
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

app.delete('/api/admin/items/:id', authenticateAdmin, requireRole('super_admin'), async (req, res) => {
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
        const {
            customerName,
            email,
            phone,
            notes,
            bookingItems: incomingBookingItems,
            slots,
            peopleCount: sharedPeopleCountInput
        } = req.body;

        console.log('[BookingCreate] Incoming payload summary:', {
            customerNameLength: (customerName || '').length,
            hasEmail: Boolean(email),
            hasPhone: Boolean(phone),
            slotCount: Array.isArray(slots) ? slots.length : 0,
            bookingItemsCount: Array.isArray(incomingBookingItems) ? incomingBookingItems.length : 0,
            sharedPeopleCountInput
        });

        const respondValidationError = (message) => {
            console.warn('[BookingCreate] Validation failed:', message);
            return res.status(400).json({ error: message });
        };

        if (!customerName || !email || !phone) {
            return respondValidationError('Customer name, email, and phone are required.');
        }

        const parsedSharedPeopleCount = parseInt(sharedPeopleCountInput, 10);
        const normalizedSharedPeopleCount = Number.isInteger(parsedSharedPeopleCount) && parsedSharedPeopleCount > 0
            ? Math.min(parsedSharedPeopleCount, 18)
            : null;

        let bookingItems = Array.isArray(incomingBookingItems) ? incomingBookingItems : null;

        if ((!bookingItems || bookingItems.length === 0) && Array.isArray(slots) && slots.length > 0) {
            bookingItems = slots.map(slot => ({
                ...slot,
                type: slot.type || 'room_rental'
            }));
        }

        if (!Array.isArray(bookingItems) || bookingItems.length === 0) {
            return respondValidationError('At least one booking item is required.');
        }

        const settings = await loadSettings();
        const normalizedItems = [];
        const catalogUsage = new Map();

        for (let index = 0; index < bookingItems.length; index += 1) {
            const item = bookingItems[index];
            const itemLabel = `Item #${index + 1}`;

            const defaultPeopleCount = normalizedSharedPeopleCount ?? 1;
            let peopleCount = parseInt(item.peopleCount, 10);
            if (!Number.isInteger(peopleCount) || peopleCount <= 0) {
                peopleCount = defaultPeopleCount;
            }

            if (!Number.isInteger(peopleCount) || peopleCount <= 0) {
                peopleCount = 1;
            }

            if (peopleCount > 18) {
                return respondValidationError(`${itemLabel}: maximum of 18 people per session.`);
            }

            let catalogItem = null;
            if (item.catalogItemId) {
                catalogItem = await getCatalogItemById(item.catalogItemId);
                if (!catalogItem) {
                    return respondValidationError(`${itemLabel}: linked item not found.`);
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
                    return respondValidationError(`${itemLabel}: invalid catalog item schedule.`);
                }

                date = startInfo.date;
                startTime = startInfo.time;
                endTime = endInfo.time;
                duration = catalogItem.duration;

                const usedCapacity = await getCatalogItemCapacityUsage(catalogItem.id);
                const alreadySelected = catalogUsage.get(catalogItem.id) || 0;
                if (usedCapacity + alreadySelected + peopleCount > catalogItem.capacity) {
                    const remaining = Math.max(catalogItem.capacity - usedCapacity - alreadySelected, 0);
                    return respondValidationError(`${catalogItem.name} has only ${remaining} seats remaining.`);
                }
                catalogUsage.set(catalogItem.id, alreadySelected + peopleCount);
            } else {
                date = item.date;
                startTime = item.startTime;
                endTime = item.endTime;
                if (!date || !startTime || !endTime) {
                    return respondValidationError(`${itemLabel}: date, startTime, and endTime are required.`);
                }
                duration = minutesBetween(startTime, endTime);
            }

            if (duration <= 0) {
                return respondValidationError(`${itemLabel}: end time must be after start time.`);
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
                    return respondValidationError(`${itemLabel}: selected time must fall within studio hours (${openingStart}-${openingEnd}).`);
                }

                if (hasInPayloadRoomConflict(normalizedItems, date, startTime, endTime)) {
                    return respondValidationError(`${itemLabel}: selected time overlaps with another session in your booking.`);
                }

                const availability = await checkRentalAvailability(date, startTime, endTime);
                if (!availability.available) {
                    console.warn('[BookingCreate] Availability conflict detected:', {
                        itemLabel,
                        date,
                        startTime,
                        endTime,
                        conflicts: availability.conflicts
                    });
                    return respondValidationError('時間衝突：此時段已有場地租用或課堂安排');
                }
            }

            let price;
            if (itemType === 'room_rental') {
                price = calculateRoomRentalPrice({ duration, peopleCount, periodType }, settings);
            } else {
                const catalogPrice = catalogItem ? catalogItem.price : Number(item.price);
                if (Number.isNaN(catalogPrice) || catalogPrice < 0) {
                    return respondValidationError(`${itemLabel}: invalid catalog price.`);
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
            totalPeople: normalizedSharedPeopleCount ?? 1,
            items: normalizedItems
        };

        console.log('[BookingCreate] Received date payloads:', {
            requestedDates: normalizedItems.map(item => item.date)
        });

        const booking = await createBooking(bookingPayload);
        console.log('[BookingCreate] API response date fields:', {
            bookingDate: booking.date,
            bookingItemDates: (booking.items || []).map(item => item.date)
        });
        const message = status === 'confirmed'
            ? 'Booking confirmed successfully!'
            : 'Booking created successfully. Please send payment confirmation.';

        res.status(201).json({
            success: true,
            booking,
            message
        });
    } catch (error) {
        console.error('[BookingCreate] Unexpected error:', {
            message: error.message,
            stack: error.stack,
            payloadSummary: {
                customerNameLength: (req.body?.customerName || '').length,
                hasEmail: Boolean(req.body?.email),
                hasPhone: Boolean(req.body?.phone),
                slotCount: Array.isArray(req.body?.slots) ? req.body.slots.length : 0,
                bookingItemsCount: Array.isArray(req.body?.bookingItems) ? req.body.bookingItems.length : 0
            }
        });
        res.status(500).json({ error: 'Failed to create booking' });
    }
});

// Catch-all route to serve frontend/index.html for any unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

async function startServer() {
    try {
        await initializeDatabase();

        console.log('Starting HTTP server...');
        app.listen(PORT, () => {
            console.log('====================================');
            console.log('🚀 Booking Server Running');
            console.log('====================================');
            console.log(`📍 Port: ${PORT}`);
            console.log(`🔊 Booking server listening on port ${PORT}`);
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
