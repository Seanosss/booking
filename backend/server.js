require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
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
    checkRentalAvailability,
    hashPassword,
    verifyPassword,
    pool,
    DEFAULT_ADMIN_PASSWORD
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin Auth Configuration
const ADMIN_TOKEN_TTL_MS = (() => {
    const ttlFromEnv = parseInt(process.env.ADMIN_TOKEN_TTL_MS, 10);
    return Number.isFinite(ttlFromEnv) && ttlFromEnv > 0 ? ttlFromEnv : 1000 * 60 * 60;
})();
// AUTH REMOVED AS REQUESTED
const ADMIN_AUTH_DISABLED = true;
const activeAdminTokens = new Map();

// Rate Limiter
const bookingCreationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many booking attempts. Please try again shortly.' }
});

// Middleware
app.use(cors());
app.use(express.json());

// --- Helper Functions ---

function cleanupExpiredTokens() {
    if (ADMIN_AUTH_DISABLED) return;
    const now = Date.now();
    for (const [token, metadata] of activeAdminTokens.entries()) {
        if (metadata.expiresAt <= now) activeAdminTokens.delete(token);
    }
}

function issueAdminToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const issuedAt = Date.now();
    const expiresAt = issuedAt + ADMIN_TOKEN_TTL_MS;
    activeAdminTokens.set(token, { issuedAt, expiresAt });
    return { token, issuedAt, expiresAt };
}

function authenticateAdmin(req, res, next) {
    if (ADMIN_AUTH_DISABLED) {
        req.admin = { token: 'dev', issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 999999).toISOString() };
        return next();
    }
    cleanupExpiredTokens();
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Authorization header required' });
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Invalid format' });
    const meta = activeAdminTokens.get(token);
    if (!meta || meta.expiresAt <= Date.now()) return res.status(401).json({ error: 'Invalid or expired token' });
    req.admin = { token, ...meta };
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
    if (Number.isNaN(date.getTime())) return null;
    const pad = (v) => v.toString().padStart(2, '0');
    return {
        date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
    };
}

function resolvePeakSchedule(settings) {
    const schedule = settings.pricing?.peakSchedule;
    if (!schedule) return null;
    return {
        days: Array.isArray(schedule.days) ? schedule.days.map(d => d.toLowerCase()) : [],
        startTime: schedule.startTime || '18:00',
        endTime: schedule.endTime || '23:00'
    };
}

function determinePeriodType(date, startTime, endTime, settings) {
    const schedule = resolvePeakSchedule(settings);
    if (!schedule || schedule.days.length === 0) return 'normal';
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 'normal';
    const dayToken = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][parsed.getDay()];
    if (!schedule.days.includes(dayToken)) return 'normal';

    const startM = parseTimeToMinutes(startTime);
    const endM = parseTimeToMinutes(endTime);
    const peakStart = parseTimeToMinutes(schedule.startTime);
    const peakEnd = parseTimeToMinutes(schedule.endTime);
    return (startM < peakEnd && endM > peakStart) ? 'peak' : 'normal';
}

function resolveHourlyRate(pricing, peopleCount, periodType) {
    if (peopleCount > 18) throw new Error('Maximum capacity is 18');
    const base = periodType === 'peak' ? 'peak' : 'normal';
    return peopleCount <= 10 ? Number(pricing[`${base}UpTo10`]) : Number(pricing[`${base}UpTo18`]);
}

function calculateRoomRentalPrice({ duration, peopleCount, periodType }, settings) {
    const rate = resolveHourlyRate(settings.pricing || {}, peopleCount, periodType);
    return Math.round((rate * (duration / 60)) * 100) / 100;
}

function generateSlotsForRange(startTime, endTime, interval = 30) {
    const slots = [];
    let cursor = parseTimeToMinutes(startTime);
    const end = parseTimeToMinutes(endTime);
    while (cursor < end) {
        slots.push(minutesToTimeString(cursor));
        cursor += interval;
    }
    return slots;
}

async function getRentalAvailability(date) {
    const settings = await loadSettings();
    const items = await getBookingItemsByDate(date);
    const confirmedSlots = [];
    const pendingSlots = [];
    const openingHours = {
        startTime: settings.operatingHours?.startTime || '07:00',
        endTime: settings.operatingHours?.endTime || '22:00'
    };

    items.forEach(item => {
        if (item.itemType !== 'room_rental') return;
        const slots = generateSlotsForRange(item.startTime, item.endTime);
        if (item.status === 'confirmed') confirmedSlots.push(...slots);
        else pendingSlots.push(...slots);
    });

    const classes = await getClasses({ onDate: date });
    classes.forEach(cls => {
        const start = normalizeIsoToDateTimeStrings(cls.startTime);
        const end = normalizeIsoToDateTimeStrings(cls.endTime);
        if (start && end && start.date === date) {
            confirmedSlots.push(...generateSlotsForRange(start.time, end.time));
        }
    });

    return { date, confirmedSlots, pendingSlots, openingHours };
}

// ---------------- API ROUTES ----------------

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/admin/login', async (req, res) => {
    if (ADMIN_AUTH_DISABLED) return res.json({ success: true, token: 'dev', expiresAt: new Date(Date.now() + 3600000).toISOString(), username: 'dev', role: 'super_admin' });
    try {
        const { username, password } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        // Try authenticating against admin_users table first
        const userResult = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            if (!verifyPassword(password, user.password_hash)) {
                return res.status(401).json({ error: 'Invalid username or password' });
            }
            const { token, expiresAt } = issueAdminToken();
            return res.json({ success: true, token, expiresAt: new Date(expiresAt).toISOString(), username: user.username, role: user.role });
        }

        // Fallback: legacy single-password login (for backward compatibility)
        const settings = await loadSettings();
        const stored = settings.adminPassword || DEFAULT_ADMIN_PASSWORD;
        if (password !== stored) return res.status(401).json({ error: 'Invalid username or password' });
        const { token, expiresAt } = issueAdminToken();
        res.json({ success: true, token, expiresAt: new Date(expiresAt).toISOString(), username: username || 'admin', role: 'super_admin' });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/admin/change-password', authenticateAdmin, async (req, res) => {
    if (ADMIN_AUTH_DISABLED) return res.json({ success: true, message: 'Disabled in dev mode' });
    try {
        const { currentPassword, newPassword } = req.body;
        const settings = await loadSettings();
        if (currentPassword !== (settings.adminPassword || DEFAULT_ADMIN_PASSWORD)) return res.status(401).json({ error: 'Current password incorrect' });
        settings.adminPassword = newPassword;
        await saveSettings(settings);
        activeAdminTokens.clear();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

app.get('/api/settings', async (req, res) => {
    try {
        const settings = await loadSettings();
        const publicSettings = { ...settings };
        delete publicSettings.adminPassword;
        res.json(publicSettings);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load settings' });
    }
});

app.put('/api/settings', authenticateAdmin, async (req, res) => {
    try {
        const current = await loadSettings();
        const updated = { ...current, ...req.body, pricing: { ...current.pricing, ...req.body.pricing }, updatedAt: new Date().toISOString() };
        await saveSettings(updated);
        const publicSettings = { ...updated };
        delete publicSettings.adminPassword;
        res.json({ success: true, settings: publicSettings });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

app.get('/api/rentals/availability', async (req, res) => {
    try {
        if (!req.query.date) return res.status(400).json({ error: 'Date required' });
        const data = await getRentalAvailability(req.query.date);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: 'Failed to check availability' });
    }
});

app.post('/api/bookings', bookingCreationLimiter, async (req, res) => {
    try {
        const { customerName, email, phone, notes, slots, peopleCount: sharedCount } = req.body;
        if (!customerName || !email || !phone) return res.status(400).json({ error: 'Missing contact info' });

        const bookingItems = slots.map(s => ({ ...s, type: 'room_rental', peopleCount: sharedCount || 1 }));
        if (!bookingItems.length) return res.status(400).json({ error: 'No slots selected' });

        const settings = await loadSettings();
        const normalizedItems = [];

        for (const item of bookingItems) {
            const { date, startTime, endTime } = item;
            const periodType = determinePeriodType(date, startTime, endTime, settings);
            const duration = minutesBetween(startTime, endTime);
            const availability = await checkRentalAvailability(date, startTime, endTime);

            if (!availability.available) return res.status(409).json({ error: '時間衝突：此時段已有場地租用或課堂安排' });

            normalizedItems.push({
                itemType: 'room_rental',
                date, startTime, endTime, duration,
                peopleCount: item.peopleCount,
                price: calculateRoomRentalPrice({ duration, peopleCount: item.peopleCount, periodType }, settings),
                periodType
            });
        }

        const status = settings.bookingRules?.autoConfirm ? 'confirmed' : 'pending';
        const booking = await createBooking({
            customerName, email, phone, notes, status,
            totalPeople: sharedCount || 1,
            items: normalizedItems
        });

        res.status(201).json({ success: true, booking, message: 'Booking created' });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Booking creation failed' });
    }
});

app.get('/api/bookings', authenticateAdmin, async (req, res) => {
    try {
        const bookings = await getBookings({ date: req.query.date, status: req.query.status });
        res.json(bookings);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load bookings' });
    }
});

app.patch('/api/bookings/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['pending', 'confirmed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

        const booking = await getBookingById(req.params.id);
        if (!booking) return res.status(404).json({ error: 'Not found' });

        if (status === 'confirmed' && booking.status !== 'confirmed') {
            for (const item of booking.items) {
                if (item.itemType === 'room_rental') {
                    const conflicts = await getRoomConflicts(item.date, item.startTime, item.endTime, booking.id);
                    if (conflicts.length) return res.status(409).json({ error: 'Slot conflict detected' });
                }
            }
        }

        const updated = await updateBookingStatus(req.params.id, status, req.body.adminNotes);
        res.json({ success: true, booking: updated });
    } catch (e) {
        res.status(500).json({ error: 'Update failed' });
    }
});

app.delete('/api/bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        const deleted = await deleteBooking(req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

app.get('/api/stats', authenticateAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const stats = await getStats(today);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

// Admin Items & Classes
app.get('/api/admin/items', authenticateAdmin, async (req, res) => {
    try {
        const items = await getCatalogItems({ includePast: true });
        const enriched = await Promise.all(items.map(async i => ({
            ...i, usedCapacity: await getCatalogItemCapacityUsage(i.id)
        })));
        res.json(enriched);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load items' });
    }
});

app.post('/api/admin/items', authenticateAdmin, async (req, res) => {
    try {
        const item = await createCatalogItem(req.body);
        res.status(201).json(item);
    } catch (e) {
        res.status(500).json({ error: 'Create failed' });
    }
});

app.delete('/api/admin/items/:id', authenticateAdmin, async (req, res) => {
    try {
        await deleteCatalogItem(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

app.get('/api/classes', async (req, res) => {
    try {
        const { start, end, includeTrial, weekStart, date } = req.query;
        let startDate = start;
        let endDate = end;
        if (date) {
            // Support ?date=YYYY-MM-DD for single-day queries
            // Use end-of-day timestamp so classes at any time of day are included
            startDate = `${date}T00:00:00`;
            endDate = `${date}T23:59:59`;
        } else if (weekStart) {
            startDate = weekStart;
            const d = new Date(weekStart);
            d.setDate(d.getDate() + 7);
            endDate = d.toISOString().split('T')[0];
        }
        const classes = await getClasses({ startDate, endDate, includePast: false });
        const filtered = includeTrial === 'true' ? classes : classes.filter(c => !c.isTrialOnly);

        const enriched = await Promise.all(filtered.map(async c => {
            const used = await getClassCapacityUsage(c.id);
            return { ...c, seatsRemaining: Math.max(c.capacity - used, 0), usedCapacity: used };
        }));
        res.json(enriched);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load classes' });
    }
});

app.get('/api/class-products', async (req, res) => {
    try {
        const { type } = req.query;
        let products = await getClassProducts();

        // Filter by type if provided (e.g., 'package', 'trial')
        if (type) {
            products = products.filter(p => p.type === type);
        }

        // Only return active products for public view
        const activeProducts = products.filter(p => p.active !== false && p.active !== 0);

        res.json(activeProducts);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load products' });
    }
});

app.post('/api/admin/classes', authenticateAdmin, async (req, res) => {
    try {
        const avail = await checkClassScheduleAvailability(req.body.startTime, req.body.endTime);
        if (!avail.available) return res.status(409).json({ error: 'Time conflict' });
        const cls = await createClass(req.body);
        res.status(201).json(cls);
    } catch (e) {
        res.status(500).json({ error: 'Create class failed' });
    }
});

app.delete('/api/admin/classes/:id', authenticateAdmin, async (req, res) => {
    try {
        await deleteClass(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Class Bookings
app.post('/api/class-bookings', async (req, res) => {
    try {
        const cls = await getClassById(req.body.classId);
        if (!cls) return res.status(404).json({ error: 'Class not found' });

        const used = await getClassCapacityUsage(cls.id);
        if (used + (req.body.peopleCount || 1) > cls.capacity) return res.status(400).json({ error: 'Class full' });

        const booking = await createClassBooking({ ...req.body, status: 'pending' });
        res.status(201).json({ success: true, booking });
    } catch (e) {
        res.status(500).json({ error: 'Booking failed' });
    }
});

app.get('/api/admin/class-bookings', authenticateAdmin, async (req, res) => {
    try {
        const bookings = await getClassBookingsDetailed({ date: req.query.date });
        res.json(bookings);
    } catch (e) {
        res.status(500).json({ error: 'Failed to load' });
    }
});

app.patch('/api/admin/class-bookings/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const updated = await updateClassBookingStatus(req.params.id, req.body.status, req.body.adminNotes);
        res.json({ success: true, booking: updated });
    } catch (e) {
        res.status(500).json({ error: 'Update failed' });
    }
});

app.delete('/api/admin/class-bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        await deleteClassBooking(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// ---------------- CLASS PRODUCT MANAGEMENT ----------------

app.post('/api/admin/class-products', authenticateAdmin, async (req, res) => {
    try {
        const product = await createClassProduct(req.body);
        res.status(201).json(product);
    } catch (e) {
        console.error('Create class product error:', e);
        res.status(500).json({ error: 'Create product failed' });
    }
});

app.put('/api/admin/class-products/:id', authenticateAdmin, async (req, res) => {
    try {
        const product = await updateClassProduct(req.params.id, req.body);
        res.json(product);
    } catch (e) {
        console.error('Update class product error:', e);
        res.status(500).json({ error: 'Update product failed' });
    }
});

app.delete('/api/admin/class-products/:id', authenticateAdmin, async (req, res) => {
    try {
        await deleteClassProduct(req.params.id);
        res.json({ success: true });
    } catch (e) {
        console.error('Delete class product error:', e);
        res.status(500).json({ error: 'Delete product failed' });
    }
});

// ---------------- CLASS UPDATE ----------------

app.put('/api/admin/classes/:id', authenticateAdmin, async (req, res) => {
    try {
        const cls = await updateClass(req.params.id, req.body);
        res.json(cls);
    } catch (e) {
        console.error('Update class error:', e);
        res.status(500).json({ error: 'Update class failed' });
    }
});

// ---------------- RENTAL ITEM UPDATE ----------------

app.put('/api/admin/items/:id', authenticateAdmin, async (req, res) => {
    try {
        const item = await updateCatalogItem(req.params.id, req.body);
        res.json(item);
    } catch (e) {
        console.error('Update item error:', e);
        res.status(500).json({ error: 'Update item failed' });
    }
});

// ---------------- ADMIN USER MANAGEMENT ----------------

app.post('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Username, password, and role are required' });
        }
        if (!['super_admin', 'receptionist'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be super_admin or receptionist' });
        }
        const hashedPassword = hashPassword(password);
        const result = await pool.query(
            'INSERT INTO admin_users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
            [username, hashedPassword, role]
        );
        res.status(201).json({ success: true, user: result.rows[0] });
    } catch (e) {
        if (e.code === '23505') {
            return res.status(409).json({ error: 'Username already exists' });
        }
        console.error('Create user error:', e);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, role, created_at FROM admin_users ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (e) {
        console.error('List users error:', e);
        res.status(500).json({ error: 'Failed to load users' });
    }
});

// ---------------- REPORTS ----------------

app.get('/api/admin/reports/csv', authenticateAdmin, async (req, res) => {
    try {
        const bookings = await getBookings();
        const classBookings = await getClassBookingsDetailed();

        // Build CSV for rental bookings
        let csv = 'Type,ID,Date,Time,Name,WhatsApp,Email,Status,Amount,Notes\n';

        bookings.forEach(b => {
            const date = b.date || '';
            const time = b.startTime ? `${b.startTime}-${b.endTime || ''}` : '';
            const name = (b.customerName || '').replace(/,/g, ' ');
            const whatsapp = (b.whatsapp || '').replace(/,/g, ' ');
            const email = (b.email || '').replace(/,/g, ' ');
            const status = b.status || '';
            const amount = b.totalPrice || b.amount || '';
            const notes = (b.adminNotes || '').replace(/,/g, ' ').replace(/\n/g, ' ');
            csv += `Rental,${b.id},${date},${time},${name},${whatsapp},${email},${status},${amount},${notes}\n`;
        });

        classBookings.forEach(b => {
            const date = b.classStartTime ? b.classStartTime.slice(0, 10) : '';
            const time = b.classStartTime ? b.classStartTime.slice(11, 16) : '';
            const name = (b.customerName || '').replace(/,/g, ' ');
            const phone = (b.phone || '').replace(/,/g, ' ');
            const email = (b.email || '').replace(/,/g, ' ');
            const status = b.status || '';
            const amount = b.totalPrice || '';
            const notes = (b.adminNotes || '').replace(/,/g, ' ').replace(/\n/g, ' ');
            csv += `Class,${b.id},${date},${time},${name},${phone},${email},${status},${amount},${notes}\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=bookings_report_${new Date().toISOString().slice(0, 10)}.csv`);
        res.send(csv);
    } catch (e) {
        console.error('CSV export error:', e);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// ---------------- STATIC FILES (Last Step) ----------------

// Public Items
app.get('/api/items', async (req, res) => {
    try {
        const items = await getCatalogItems({ includePast: false });
        // Filter for room rentals only if needed, but catalog usually has types.
        // The frontend expects { roomRentals: [] } or just array?
        // Let's check frontend: `const data = await res.json(); return data.roomRentals || [];`
        // So we should return { roomRentals: items.filter(...) }
        const roomRentals = items.filter(i => i.itemType === 'room_rental');
        res.json({ roomRentals });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load items' });
    }
});

// 1. Serve Frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// 2. Serve Admin
app.use('/admin', express.static(path.join(__dirname, '../admin')));

// 3. Catch-all for Frontend SPA (Ensure this is LAST)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ---------------- START SERVER ----------------

async function startServer() {
    try {
        // Attempt to initialize DB, but don't block server start if it fails (e.g. invalid credentials)
        // This ensures static files (Frontend/Admin) can still be served so the user doesn't see a blank page.
        initializeDatabase().catch(err => {
            console.error('⚠️ Database initialization failed:', err);
            console.error('Server will continue running to serve static files, but APIs may fail.');
        });

        // --- Calendar Export ---

        app.get('/api/bookings/:ref/ics', async (req, res) => {
            try {
                const booking = await getBookingById(req.params.ref);
                if (!booking) return res.status(404).json({ error: 'Booking not found' });

                // Parse date/time
                // Assuming booking has date (YYYY-MM-DD), startTime (HH:MM), endTime (HH:MM)
                // Adjust based on your schema. If it's rental, it might have items.
                // If it's class booking, it has class details.

                let summary = 'Booking';
                let description = `Reference: ${booking.id}`;
                let startDateTime, endDateTime;

                // Determine if it is a Class Booking or Rental Booking
                if (booking.classId) {
                    // Class Booking
                    const cls = await getClassById(booking.classId);
                    summary = cls ? `Class: ${cls.title}` : 'Class Booking';
                    startDateTime = cls ? cls.startTime : null; // ISO string expected
                    endDateTime = cls ? cls.endTime : null;
                    description += `\nClass: ${cls?.title || 'Unknown'}`;
                } else {
                    // Rental Booking (May have multiple slots, simplistic approach: use first slot or aggregate)
                    // For simplicity, finding items for this booking
                    // This part might be tricky if schema is complex. 
                    // Falling back to simple default logic or assuming 'booking' object has start/end if simplified.
                    // If getBookingById returns joined data (which it usually does for detail view):
                    summary = 'Studio Rental';
                }

                // Minimal ICS generation helper
                const formatICSDate = (dateStr) => {
                    if (!dateStr) return '';
                    const d = new Date(dateStr);
                    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
                };

                // Fallback for dates if not easily resolved (this acts as a robust fail-safe)
                const now = new Date();
                const dtStar = startDateTime ? formatICSDate(startDateTime) : formatICSDate(now);
                const dtEnd = endDateTime ? formatICSDate(endDateTime) : formatICSDate(new Date(now.getTime() + 3600000));

                const icsContent = [
                    'BEGIN:VCALENDAR',
                    'VERSION:2.0',
                    'PRODID:-//StudioBooking//EN',
                    'BEGIN:VEVENT',
                    `UID:${booking.id}@studiobooking`,
                    `DTSTAMP:${formatICSDate(new Date())}`,
                    `DTSTART:${dtStar}`,
                    `DTEND:${dtEnd}`,
                    `SUMMARY:${summary}`,
                    `DESCRIPTION:${description}`,
                    'END:VEVENT',
                    'END:VCALENDAR'
                ].join('\r\n');

                res.set('Content-Type', 'text/calendar');
                res.set('Content-Disposition', `attachment; filename="booking-${booking.id}.ics"`);
                res.send(icsContent);

            } catch (e) {
                console.error('ICS generation failed:', e);
                res.status(500).json({ error: 'Failed to generate calendar' });
            }
        });

        // --- Admin Analytics & Overview ---

        app.delete('/api/admin/bookings/:id', authenticateAdmin, async (req, res) => {
            try {
                await deleteBooking(req.params.id);
                res.json({ success: true });
            } catch (e) {
                console.error('Delete booking error:', e);
                res.status(500).json({ error: 'Delete failed' });
            }
        });

        app.get('/api/admin/bookings/overview', authenticateAdmin, async (req, res) => {
            try {
                const { date } = req.query;
                if (!date) return res.status(400).json({ error: 'Date required' });

                // 1. Studio Sessions
                const rentalItems = await getBookingItemsByDate(date);
                const studioSessions = await Promise.all(rentalItems.map(async item => {
                    const booking = await getBookingById(item.bookingId);
                    return {
                        startTime: item.startTime,
                        endTime: item.endTime,
                        bookingId: item.bookingId,
                        customerName: booking?.customerName,
                        peopleCount: item.peopleCount,
                        status: booking?.status,
                        email: booking?.email,
                        phone: booking?.phone,
                        notes: booking?.adminNotes || booking?.notes
                    };
                }));

                // 2. Class Sessions
                const classes = await getClasses({ startDate: `${date}T00:00:00`, endDate: `${date}T23:59:59`, includePast: true });
                const classSessions = await Promise.all(classes.map(async cls => {
                    const bookings = await getClassBookingsDetailed(cls.id);
                    return {
                        name: cls.title,
                        startDateTime: cls.startTime,
                        endDateTime: cls.endTime,
                        description: cls.description,
                        instructorName: cls.instructor,
                        attendees: bookings.map(b => ({
                            customerName: b.customerName,
                            peopleCount: b.peopleCount,
                            status: b.status
                        }))
                    };
                }));

                res.json({ studioSessions, classSessions });
            } catch (e) {
                console.error('Overview error:', e);
                res.status(500).json({ error: 'Failed to load overview' });
            }
        });

        app.get('/api/admin/classes', authenticateAdmin, async (req, res) => {
            try {
                const { includePast } = req.query;
                const classes = await getClasses({ includePast: includePast === 'true' });
                const enriched = await Promise.all(classes.map(async c => {
                    const used = await getClassCapacityUsage(c.id);
                    // Map to format expected by Admin
                    return {
                        id: c.id,
                        name: c.title,
                        instructor: c.instructor,
                        location: c.location,
                        startTime: c.startTime,
                        endTime: c.endTime,
                        price: c.price,
                        capacity: c.capacity,
                        tags: c.tags,
                        isTrialOnly: c.isTrialOnly,
                        confirmedCount: used
                    };
                }));
                res.json(enriched);
            } catch (e) {
                res.status(500).json({ error: 'Failed to load classes' });
            }
        });

        app.get('/api/admin/class-products', authenticateAdmin, async (req, res) => {
            try {
                const products = await getClassProducts();
                res.json(products);
            } catch (e) {
                res.status(500).json({ error: 'Failed to load products' });
            }
        });

        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        // process.exit(1); // Removed to prevent crash loops on Render
    }
}

startServer();
