require('dotenv').config();
const { Pool } = require('pg');
const { hashPassword } = require('../utils/hash');
const crypto = require('crypto');

const DEFAULT_ADMIN_PASSWORD = 'admin123';

const DEFAULT_PEAK_SCHEDULE = {
    days: ['fri', 'sat', 'sun'],
    startTime: '18:00',
    endTime: '23:00'
};

const defaultSettings = {
    businessName: 'Premium Studio Booking',
    businessNameZh: '專業錄音室預約系統',
    businessDescription: 'Professional Recording Studio',
    businessDescriptionZh: '專業錄音室',
    operatingHours: {
        startTime: '07:00',
        endTime: '22:00',
        daysLabelZh: '每日營業',
        daysLabelEn: 'Open Daily'
    },
    pricing: {
        normalUpTo10: 250,
        normalUpTo18: 320,
        peakUpTo10: 280,
        peakUpTo18: 350,
        peakSchedule: DEFAULT_PEAK_SCHEDULE
    },
    paymentMethods: {
        bankTransfer: {
            enabled: true,
            bankName: 'HSBC Hong Kong',
            accountNumber: '123-456789-001',
            accountName: 'Connect Point Studio Ltd'
        },
        payme: {
            enabled: true,
            phoneNumber: '+852 9872 5268',
            displayName: 'Connect Point Studio'
        }
    },
    contactInfo: {
        whatsapp: '85298725268',
        email: 'connectpoint@atsumaru.com',
        phone: '+852 9872 5268'
    },
    bookingRules: {
        minAdvanceBooking: 0,
        maxAdvanceBooking: 30,
        slotInterval: 30,
        autoConfirm: false,
        requirePaymentProof: true
    },
    bookingInstructions: {
        titleZh: '重要預約須知',
        titleEn: 'Important Booking Instructions',
        instruction1Zh: '選擇您想要的日期',
        instruction1En: 'Select your preferred date',
        instruction2Zh: '點擊開始時段，再點擊結束時段（可選擇多個連續時段）',
        instruction2En: 'Click start time, then click end time (can select multiple consecutive slots)',
        instruction3Zh: '填寫您的聯絡資料',
        instruction3En: 'Fill in your contact information',
        instruction4Zh: '透過銀行轉帳或 PayMe 付款',
        instruction4En: 'Make payment via Bank Transfer or PayMe',
        instruction5Zh: '將付款證明傳送至 WhatsApp: 98725268',
        instruction5En: 'Send payment proof to WhatsApp: 98725268',
        instruction6Zh: '您的預約將在 30 分鐘內確認',
        instruction6En: 'Your booking will be confirmed within 30 minutes'
    },
    adminPassword: DEFAULT_ADMIN_PASSWORD,
    updatedAt: new Date().toISOString()
};

const connectionString = process.env.DATABASE_URL
    || process.env.POSTGRES_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.SUPABASE_DB_URL
    || (process.env.NODE_ENV === 'production' ? null : 'postgresql://localhost:5432/booking');

if (!connectionString) {
    throw new Error('Database connection string not provided. Set DATABASE_URL or POSTGRES_URL.');
}

if (!process.env.DATABASE_URL && connectionString.startsWith('postgresql://localhost')) {
    console.warn('DATABASE_URL not set. Falling back to local database on postgresql://localhost:5432/booking');
}

const pool = new Pool({
    connectionString,
    max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    ssl: process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined
});

pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
});

function mergePricing(pricing = {}) {
    const mergedSchedule = {
        ...DEFAULT_PEAK_SCHEDULE,
        ...(pricing.peakSchedule || {})
    };

    return {
        normalUpTo10: Number(pricing.normalUpTo10 ?? defaultSettings.pricing.normalUpTo10),
        normalUpTo18: Number(pricing.normalUpTo18 ?? defaultSettings.pricing.normalUpTo18),
        peakUpTo10: Number(pricing.peakUpTo10 ?? defaultSettings.pricing.peakUpTo10),
        peakUpTo18: Number(pricing.peakUpTo18 ?? defaultSettings.pricing.peakUpTo18),
        peakSchedule: mergedSchedule
    };
}

function mapSettingsRow(row) {
    if (!row) {
        return null;
    }

    return {
        businessName: row.business_name,
        businessNameZh: row.business_name_zh,
        businessDescription: row.business_description,
        businessDescriptionZh: row.business_description_zh,
        operatingHours: {
            ...defaultSettings.operatingHours,
            ...(row.operating_hours || {})
        },
        pricing: mergePricing(row.pricing || {}),
        paymentMethods: row.payment_methods,
        contactInfo: row.contact_info,
        bookingRules: row.booking_rules,
        bookingInstructions: row.booking_instructions,
        adminPassword: row.admin_password,
        updatedAt: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString()
    };
}

function normalizeTimeString(timeString) {
    if (!timeString) {
        return null;
    }

    if (typeof timeString === 'string' && timeString.length === 5) {
        return timeString;
    }

    const str = timeString.toString();
    return str.length >= 5 ? str.slice(0, 5) : str.padStart(5, '0');
}

function mapBookingRow(row) {
    return {
        id: row.id,
        customerName: row.customer_name,
        email: row.email,
        phone: row.phone,
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
        startTime: normalizeTimeString(row.start_time),
        duration: row.duration,
        totalPrice: row.total_price === null ? null : Number(row.total_price),
        totalPeople: row.total_people === null ? null : Number(row.total_people),
        notes: row.notes || '',
        status: row.status,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
        confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
        cancelledAt: row.cancelled_at ? new Date(row.cancelled_at).toISOString() : null,
        adminNotes: row.admin_notes || null
    };
}

function mapBookingItemRow(row) {
    return {
        id: row.id,
        bookingId: row.booking_id,
        catalogItemId: row.catalog_item_id,
        itemType: row.item_type,
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date,
        startTime: normalizeTimeString(row.start_time),
        endTime: normalizeTimeString(row.end_time),
        duration: row.duration,
        peopleCount: Number(row.people_count),
        price: Number(row.price),
        periodType: row.period_type
    };
}

function mapCatalogItemRow(row) {
    return {
        id: row.id,
        type: row.type,
        name: row.name,
        startDateTime: row.start_datetime ? new Date(row.start_datetime).toISOString() : null,
        endDateTime: row.end_datetime ? new Date(row.end_datetime).toISOString() : null,
        duration: row.duration,
        price: row.price === null ? null : Number(row.price),
        instructorName: row.instructor_name,
        capacity: row.capacity,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    };
}

function generateBookingId() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    return `BK-${timestamp}-${random}`.toUpperCase();
}

async function initializeDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            business_name TEXT NOT NULL,
            business_name_zh TEXT NOT NULL,
            business_description TEXT NOT NULL,
            business_description_zh TEXT NOT NULL,
            operating_hours JSONB NOT NULL,
            pricing JSONB NOT NULL,
            payment_methods JSONB NOT NULL,
            contact_info JSONB NOT NULL,
            booking_rules JSONB NOT NULL,
            booking_instructions JSONB NOT NULL,
            admin_password TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS bookings (
            id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            date DATE NOT NULL,
            start_time TIME NOT NULL,
            duration INTEGER NOT NULL,
            total_price NUMERIC(10, 2) NOT NULL,
            total_people INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            status TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            confirmed_at TIMESTAMPTZ,
            cancelled_at TIMESTAMPTZ,
            admin_notes TEXT
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS catalog_items (
            id SERIAL PRIMARY KEY,
            type TEXT NOT NULL CHECK (type IN ('workshop_class', 'room_rental')),
            name TEXT NOT NULL,
            start_datetime TIMESTAMPTZ NOT NULL,
            end_datetime TIMESTAMPTZ NOT NULL,
            duration INTEGER NOT NULL,
            price NUMERIC(10, 2) NOT NULL,
            instructor_name TEXT,
            capacity INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS booking_items (
            id SERIAL PRIMARY KEY,
            booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
            catalog_item_id INTEGER REFERENCES catalog_items(id) ON DELETE SET NULL,
            item_type TEXT NOT NULL,
            date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            duration INTEGER NOT NULL,
            people_count INTEGER NOT NULL,
            price NUMERIC(10, 2) NOT NULL,
            period_type TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_booking_items_date ON booking_items(date)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_booking_items_catalog ON booking_items(catalog_item_id)
    `);

    await pool.query(`
        ALTER TABLE bookings
        ALTER COLUMN total_people SET DEFAULT 0
    `);

    // Ensure at least one settings row exists
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM settings');
    if (rows[0].count === 0) {
        const hashedPassword = hashPassword(DEFAULT_ADMIN_PASSWORD);
        await pool.query(`
            INSERT INTO settings (
                business_name,
                business_name_zh,
                business_description,
                business_description_zh,
                operating_hours,
                pricing,
                payment_methods,
                contact_info,
                booking_rules,
                booking_instructions,
                admin_password
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `, [
            defaultSettings.businessName,
            defaultSettings.businessNameZh,
            defaultSettings.businessDescription,
            defaultSettings.businessDescriptionZh,
            defaultSettings.operatingHours,
            defaultSettings.pricing,
            defaultSettings.paymentMethods,
            defaultSettings.contactInfo,
            defaultSettings.bookingRules,
            defaultSettings.bookingInstructions,
            hashedPassword
        ]);
        console.log('Initialized settings with default admin password. Please change it as soon as possible.');
    }
}

async function loadSettings() {
    const result = await pool.query('SELECT * FROM settings ORDER BY id LIMIT 1');
    if (result.rows.length === 0) {
        return {
            ...defaultSettings,
            adminPassword: hashPassword(defaultSettings.adminPassword)
        };
    }
    return mapSettingsRow(result.rows[0]);
}

async function saveSettings(settings) {
    const result = await pool.query('SELECT id FROM settings ORDER BY id LIMIT 1');
    if (result.rows.length === 0) {
        return false;
    }

    const id = result.rows[0].id;
    const operatingHours = {
        ...defaultSettings.operatingHours,
        ...(settings.operatingHours || {})
    };

    await pool.query(`
        UPDATE settings
        SET
            business_name = $1,
            business_name_zh = $2,
            business_description = $3,
            business_description_zh = $4,
            operating_hours = $5,
            pricing = $6,
            payment_methods = $7,
            contact_info = $8,
            booking_rules = $9,
            booking_instructions = $10,
            admin_password = $11,
            updated_at = NOW()
        WHERE id = $12
    `, [
        settings.businessName,
        settings.businessNameZh,
        settings.businessDescription,
        settings.businessDescriptionZh,
        operatingHours,
        mergePricing(settings.pricing),
        settings.paymentMethods,
        settings.contactInfo,
        settings.bookingRules,
        settings.bookingInstructions,
        settings.adminPassword,
        id
    ]);

    return true;
}

async function getBookingItemsByBookingIds(bookingIds) {
    if (!bookingIds || bookingIds.length === 0) {
        return {};
    }

    const result = await pool.query(`
        SELECT * FROM booking_items
        WHERE booking_id = ANY($1::text[])
        ORDER BY date ASC, start_time ASC
    `, [bookingIds]);

    const grouped = {};
    result.rows.forEach(row => {
        const mapped = mapBookingItemRow(row);
        if (!grouped[mapped.bookingId]) {
            grouped[mapped.bookingId] = [];
        }
        grouped[mapped.bookingId].push(mapped);
    });

    return grouped;
}

async function createBooking(bookingData) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const id = generateBookingId();
        const now = new Date();
        const confirmedAt = bookingData.status === 'confirmed' ? now : null;

        const sortedItems = [...bookingData.items].sort((a, b) => {
            const aDateTime = new Date(`${a.date}T${a.startTime}:00`);
            const bDateTime = new Date(`${b.date}T${b.startTime}:00`);
            return aDateTime - bDateTime;
        });

        const firstItem = sortedItems[0];
        const totalDuration = bookingData.items.reduce((sum, item) => sum + item.duration, 0);
        const totalPeople = bookingData.items.reduce((sum, item) => sum + item.peopleCount, 0);
        const totalPrice = bookingData.items.reduce((sum, item) => sum + Number(item.price), 0);

        const bookingResult = await client.query(`
            INSERT INTO bookings (
                id,
                customer_name,
                email,
                phone,
                date,
                start_time,
                duration,
                total_price,
                total_people,
                notes,
                status,
                created_at,
                updated_at,
                confirmed_at,
                cancelled_at,
                admin_notes
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
            RETURNING *
        `, [
            id,
            bookingData.customerName,
            bookingData.email,
            bookingData.phone,
            firstItem.date,
            `${firstItem.startTime}:00`,
            totalDuration,
            totalPrice,
            totalPeople,
            bookingData.notes || '',
            bookingData.status,
            now,
            now,
            confirmedAt,
            null,
            bookingData.adminNotes || null
        ]);

        for (const item of bookingData.items) {
            await client.query(`
                INSERT INTO booking_items (
                    booking_id,
                    catalog_item_id,
                    item_type,
                    date,
                    start_time,
                    end_time,
                    duration,
                    people_count,
                    price,
                    period_type
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            `, [
                id,
                item.catalogItemId,
                item.itemType,
                item.date,
                `${item.startTime}:00`,
                `${item.endTime}:00`,
                item.duration,
                item.peopleCount,
                item.price,
                item.periodType
            ]);
        }

        await client.query('COMMIT');

        const booking = mapBookingRow(bookingResult.rows[0]);
        booking.items = bookingData.items.map(item => ({ ...item }));
        return booking;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function getBookings(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.date) {
        params.push(filters.date);
        conditions.push(`date = $${params.length}`);
    }

    if (filters.status) {
        params.push(filters.status);
        conditions.push(`status = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM bookings ${whereClause} ORDER BY date ASC, start_time ASC`;
    const result = await pool.query(query, params);
    const bookings = result.rows.map(mapBookingRow);

    const bookingIds = bookings.map(b => b.id);
    const itemsByBooking = await getBookingItemsByBookingIds(bookingIds);
    bookings.forEach(booking => {
        booking.items = itemsByBooking[booking.id] || [];
    });

    return bookings;
}

async function getBookingById(id) {
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (result.rows.length === 0) {
        return null;
    }
    const booking = mapBookingRow(result.rows[0]);
    const itemsByBooking = await getBookingItemsByBookingIds([booking.id]);
    booking.items = itemsByBooking[booking.id] || [];
    return booking;
}

async function updateBookingStatus(id, status, adminNotes) {
    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let paramIndex = params.length;

    if (adminNotes !== undefined) {
        params.push(adminNotes);
        paramIndex += 1;
        updates.push(`admin_notes = $${paramIndex}`);
    }

    if (status === 'confirmed') {
        updates.push('confirmed_at = NOW()');
    } else if (status === 'cancelled') {
        updates.push('cancelled_at = NOW()');
    }

    params.push(id);
    const result = await pool.query(`
        UPDATE bookings
        SET ${updates.join(', ')}
        WHERE id = $${params.length}
        RETURNING *
    `, params);

    if (result.rows.length === 0) {
        return null;
    }

    const booking = mapBookingRow(result.rows[0]);
    const itemsByBooking = await getBookingItemsByBookingIds([booking.id]);
    booking.items = itemsByBooking[booking.id] || [];
    return booking;
}

async function deleteBooking(id) {
    const result = await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
    return result.rowCount > 0;
}

async function getStats(today) {
    const result = await pool.query(`
        SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
            COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
            COUNT(*) FILTER (WHERE date = $1)::int AS today_bookings,
            COUNT(*) FILTER (WHERE date >= $1 AND status = 'confirmed')::int AS upcoming_bookings,
            COALESCE(SUM(CASE WHEN status = 'confirmed' THEN total_price ELSE 0 END), 0) AS total_revenue
        FROM bookings
    `, [today]);

    const row = result.rows[0];
    return {
        total: row.total,
        pending: row.pending,
        confirmed: row.confirmed,
        cancelled: row.cancelled,
        todayBookings: row.today_bookings,
        upcomingBookings: row.upcoming_bookings,
        totalRevenue: Number(row.total_revenue)
    };
}

async function getBookingItemsByDate(date) {
    const result = await pool.query(`
        SELECT bi.*, b.status
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.date = $1 AND b.status IN ('pending', 'confirmed')
        ORDER BY bi.start_time ASC
    `, [date]);
    return result.rows.map(row => ({
        ...mapBookingItemRow(row),
        status: row.status
    }));
}

async function getRoomConflicts(date, startTime, endTime, excludeBookingId = null) {
    const params = [date, `${endTime}:00`, `${startTime}:00`];
    let query = `
        SELECT bi.*, b.status
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.date = $1
          AND bi.item_type = 'room_rental'
          AND b.status IN ('pending', 'confirmed')
          AND bi.start_time < $2
          AND bi.end_time > $3
    `;

    if (excludeBookingId) {
        params.push(excludeBookingId);
        query += ` AND bi.booking_id <> $${params.length}`;
    }

    const result = await pool.query(query, params);
    return result.rows.map(mapBookingItemRow);
}

async function getCatalogItemById(id) {
    const result = await pool.query('SELECT * FROM catalog_items WHERE id = $1', [id]);
    if (result.rows.length === 0) {
        return null;
    }
    return mapCatalogItemRow(result.rows[0]);
}

async function getCatalogItems({ includePast = false } = {}) {
    const params = [];
    let where = '';

    if (!includePast) {
        params.push(new Date());
        where = 'WHERE end_datetime >= $1';
    }

    const result = await pool.query(`
        SELECT * FROM catalog_items
        ${where}
        ORDER BY start_datetime ASC
    `, params);

    return result.rows.map(mapCatalogItemRow);
}

async function createCatalogItem(item) {
    const result = await pool.query(`
        INSERT INTO catalog_items (
            type,
            name,
            start_datetime,
            end_datetime,
            duration,
            price,
            instructor_name,
            capacity
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
    `, [
        item.type,
        item.name,
        item.startDateTime,
        item.endDateTime,
        item.duration,
        item.price,
        item.instructorName || null,
        item.capacity
    ]);

    return mapCatalogItemRow(result.rows[0]);
}

async function updateCatalogItem(id, item) {
    const result = await pool.query(`
        UPDATE catalog_items
        SET
            type = $1,
            name = $2,
            start_datetime = $3,
            end_datetime = $4,
            duration = $5,
            price = $6,
            instructor_name = $7,
            capacity = $8,
            updated_at = NOW()
        WHERE id = $9
        RETURNING *
    `, [
        item.type,
        item.name,
        item.startDateTime,
        item.endDateTime,
        item.duration,
        item.price,
        item.instructorName || null,
        item.capacity,
        id
    ]);

    if (result.rows.length === 0) {
        return null;
    }

    return mapCatalogItemRow(result.rows[0]);
}

async function deleteCatalogItem(id) {
    const result = await pool.query('DELETE FROM catalog_items WHERE id = $1', [id]);
    return result.rowCount > 0;
}

async function getCatalogItemCapacityUsage(catalogItemId, excludeBookingId = null) {
    const params = [catalogItemId];
    let query = `
        SELECT COALESCE(SUM(bi.people_count), 0) AS used_capacity
        FROM booking_items bi
        JOIN bookings b ON b.id = bi.booking_id
        WHERE bi.catalog_item_id = $1
          AND b.status IN ('pending', 'confirmed')
    `;

    if (excludeBookingId) {
        params.push(excludeBookingId);
        query += ` AND bi.booking_id <> $${params.length}`;
    }

    const result = await pool.query(query, params);
    return Number(result.rows[0].used_capacity);
}

module.exports = {
    pool,
    defaultSettings,
    DEFAULT_ADMIN_PASSWORD,
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
    getCatalogItemCapacityUsage
};
