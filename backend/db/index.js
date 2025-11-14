require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

const DEFAULT_OPERATING_HOURS = {
    startTime: '07:00',
    endTime: '22:00',
    daysLabelZh: '每日營業',
    daysLabelEn: 'Open Daily'
};

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
    operatingHours: { ...DEFAULT_OPERATING_HOURS },
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
    updatedAt: new Date().toISOString(),
    adminPassword: DEFAULT_ADMIN_PASSWORD
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set. Cannot establish database connection.');
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
});

function getPool() {
    return pool;
}

function query(text, params = []) {
    return pool.query(text, params);
}

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

function mergeOperatingHours(operatingHours = {}) {
    const merged = {
        ...DEFAULT_OPERATING_HOURS,
        ...(operatingHours || {})
    };

    const normalizedStart = normalizeTimeString(merged.startTime);
    const normalizedEnd = normalizeTimeString(merged.endTime);

    merged.startTime = normalizedStart || DEFAULT_OPERATING_HOURS.startTime;
    merged.endTime = normalizedEnd || DEFAULT_OPERATING_HOURS.endTime;

    return merged;
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
        operatingHours: mergeOperatingHours(row.operating_hours || {}),
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
        description: row.description || '',
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

function mapClassRow(row) {
    if (!row) {
        return null;
    }

    const tags = Array.isArray(row.tags)
        ? row.tags
        : (() => {
            if (!row.tags) return [];
            if (typeof row.tags === 'string') {
                try {
                    const parsed = JSON.parse(row.tags);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (error) {
                    return [];
                }
            }
            if (typeof row.tags === 'object') {
                return Array.isArray(row.tags) ? row.tags : Object.values(row.tags || {});
            }
            return [];
        })();

    return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        instructor: row.instructor,
        location: row.location || '',
        startTime: row.start_time ? new Date(row.start_time).toISOString() : null,
        endTime: row.end_time ? new Date(row.end_time).toISOString() : null,
        capacity: Number(row.capacity || 0),
        price: row.price === null ? null : Number(row.price),
        tags,
        isTrialOnly: Boolean(row.is_trial_only),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    };
}

function mapClassBookingRow(row) {
    return {
        id: row.id,
        classId: row.class_id,
        customerName: row.customer_name,
        email: row.email,
        phone: row.phone,
        status: row.status,
        peopleCount: Number(row.people_count || 1),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    };
}

function mapClassBookingWithClassRow(row) {
    const base = mapClassBookingRow(row);

    return {
        ...base,
        className: row.class_name || null,
        classStartTime: row.class_start_time
            ? new Date(row.class_start_time).toISOString()
            : null,
        classEndTime: row.class_end_time
            ? new Date(row.class_end_time).toISOString()
            : null,
        classInstructor: row.class_instructor || null,
        classLocation: row.class_location || null,
        classCapacity: row.class_capacity === null
            ? null
            : Number(row.class_capacity),
        classPrice: row.class_price === null
            ? null
            : Number(row.class_price)
    };
}

function mapClassProductRow(row) {
    return {
        id: row.id,
        type: row.type,
        name: row.name,
        description: row.description || '',
        price: row.price === null ? null : Number(row.price),
        numberOfClasses: Number(row.number_of_classes || 0),
        validityPeriodDays: row.validity_period_days === null
            ? null
            : Number(row.validity_period_days),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
    };
}

async function initializeDatabase() {
    try {
        await pool.query('SELECT 1');
        console.log('Database connection established successfully.');
    } catch (error) {
        console.error('Failed to connect to the database:', error);
        throw error;
    }

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
            description TEXT,
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
        ALTER TABLE catalog_items
        ADD COLUMN IF NOT EXISTS description TEXT
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

    await pool.query(`
        CREATE TABLE IF NOT EXISTS classes (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            instructor TEXT,
            location TEXT,
            start_time TIMESTAMPTZ NOT NULL,
            end_time TIMESTAMPTZ NOT NULL,
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            capacity INTEGER NOT NULL,
            price NUMERIC(10, 2) NOT NULL,
            is_trial_only BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS class_bookings (
            id SERIAL PRIMARY KEY,
            class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            customer_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            people_count INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        ALTER TABLE class_bookings
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS class_products (
            id SERIAL PRIMARY KEY,
            type TEXT NOT NULL CHECK (type IN ('package', 'trial')),
            name TEXT NOT NULL,
            description TEXT,
            price NUMERIC(10, 2) NOT NULL,
            number_of_classes INTEGER NOT NULL,
            validity_period_days INTEGER,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_classes_start_time ON classes(start_time)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_classes_tags ON classes USING GIN (tags)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_class_bookings_class_id ON class_bookings(class_id)
    `);

    // Ensure at least one settings row exists
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM settings');
    if (rows[0].count === 0) {
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
            mergeOperatingHours(defaultSettings.operatingHours),
            mergePricing(defaultSettings.pricing),
            defaultSettings.paymentMethods,
            defaultSettings.contactInfo,
            defaultSettings.bookingRules,
            defaultSettings.bookingInstructions,
            DEFAULT_ADMIN_PASSWORD
        ]);
        console.log('Initialized settings with default admin password. Please change it as soon as possible.');
    }
}

async function loadSettings() {
    const result = await pool.query('SELECT * FROM settings ORDER BY id LIMIT 1');
    if (result.rows.length === 0) {
        return {
            ...defaultSettings,
            operatingHours: mergeOperatingHours(defaultSettings.operatingHours),
            pricing: mergePricing(defaultSettings.pricing),
            adminPassword: DEFAULT_ADMIN_PASSWORD
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
    const operatingHours = mergeOperatingHours(settings.operatingHours || {});
    let adminPassword = typeof settings.adminPassword === 'string' && settings.adminPassword.length > 0
        ? settings.adminPassword
        : null;

    if (!adminPassword) {
        const existing = await pool.query('SELECT admin_password FROM settings WHERE id = $1', [id]);
        adminPassword = existing.rows[0]?.admin_password || DEFAULT_ADMIN_PASSWORD;
    }

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
        adminPassword,
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

async function getCatalogItems({ includePast = false, type = null, onOrAfter = null, onDate = null } = {}) {
    const conditions = [];
    const params = [];

    if (!includePast) {
        params.push(new Date());
        conditions.push(`end_datetime >= $${params.length}`);
    }

    if (type) {
        params.push(type);
        conditions.push(`type = $${params.length}`);
    }

    if (onOrAfter) {
        params.push(onOrAfter);
        conditions.push(`start_datetime >= $${params.length}`);
    }

    if (onDate) {
        params.push(onDate);
        conditions.push(`DATE(start_datetime) = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
        SELECT * FROM catalog_items
        ${whereClause}
        ORDER BY start_datetime ASC
    `, params);

    return result.rows.map(mapCatalogItemRow);
}

async function getCatalogItemsByIds(ids = []) {
    if (!Array.isArray(ids) || ids.length === 0) {
        return [];
    }

    const result = await pool.query(
        'SELECT * FROM catalog_items WHERE id = ANY($1::int[])',
        [ids]
    );

    return result.rows.map(mapCatalogItemRow);
}

async function createCatalogItem(item) {
    const result = await pool.query(`
        INSERT INTO catalog_items (
            type,
            name,
            description,
            start_datetime,
            end_datetime,
            duration,
            price,
            instructor_name,
            capacity
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
    `, [
        item.type,
        item.name,
        item.description || null,
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
            description = $3,
            start_datetime = $4,
            end_datetime = $5,
            duration = $6,
            price = $7,
            instructor_name = $8,
            capacity = $9,
            updated_at = NOW()
        WHERE id = $10
        RETURNING *
    `, [
        item.type,
        item.name,
        item.description || null,
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

async function getClasses({ includePast = false, startDate = null, endDate = null, onDate = null } = {}) {
    const conditions = [];
    const params = [];

    if (!includePast) {
        params.push(new Date().toISOString());
        conditions.push(`end_time >= $${params.length}::timestamptz`);
    }

    if (onDate) {
        params.push(onDate);
        conditions.push(`DATE(start_time) = $${params.length}`);
    } else {
        if (startDate) {
            params.push(startDate);
            conditions.push(`start_time >= $${params.length}::timestamptz`);
        }
        if (endDate) {
            params.push(endDate);
            conditions.push(`start_time <= $${params.length}::timestamptz`);
        }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
        SELECT * FROM classes
        ${whereClause}
        ORDER BY start_time ASC
    `, params);

    return result.rows.map(mapClassRow);
}

async function getClassById(id) {
    const result = await pool.query('SELECT * FROM classes WHERE id = $1', [id]);
    if (result.rows.length === 0) {
        return null;
    }
    return mapClassRow(result.rows[0]);
}

async function createClass(data) {
    const tags = JSON.stringify(Array.isArray(data.tags) ? data.tags : []);

    const result = await pool.query(`
        INSERT INTO classes (
            name,
            description,
            instructor,
            location,
            start_time,
            end_time,
            tags,
            capacity,
            price,
            is_trial_only
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
        RETURNING *
    `, [
        data.name,
        data.description || null,
        data.instructor || null,
        data.location || null,
        data.startTime,
        data.endTime,
        tags,
        data.capacity,
        data.price,
        Boolean(data.isTrialOnly)
    ]);

    return mapClassRow(result.rows[0]);
}

async function updateClass(id, data) {
    const tags = JSON.stringify(Array.isArray(data.tags) ? data.tags : []);

    const result = await pool.query(`
        UPDATE classes
        SET
            name = $1,
            description = $2,
            instructor = $3,
            location = $4,
            start_time = $5,
            end_time = $6,
            tags = $7::jsonb,
            capacity = $8,
            price = $9,
            is_trial_only = $10,
            updated_at = NOW()
        WHERE id = $11
        RETURNING *
    `, [
        data.name,
        data.description || null,
        data.instructor || null,
        data.location || null,
        data.startTime,
        data.endTime,
        tags,
        data.capacity,
        data.price,
        Boolean(data.isTrialOnly),
        id
    ]);

    if (result.rows.length === 0) {
        return null;
    }

    return mapClassRow(result.rows[0]);
}

async function deleteClass(id) {
    const result = await pool.query('DELETE FROM classes WHERE id = $1', [id]);
    return result.rowCount > 0;
}

async function getClassCapacityUsage(classId, excludeBookingId = null) {
    const params = [classId];
    let query = `
        SELECT COALESCE(SUM(people_count), 0) AS used_capacity
        FROM class_bookings
        WHERE class_id = $1
          AND status IN ('pending', 'confirmed')
    `;

    if (excludeBookingId) {
        params.push(excludeBookingId);
        query += ` AND id <> $${params.length}`;
    }

    const result = await pool.query(query, params);
    return Number(result.rows[0].used_capacity);
}

async function createClassBooking(data) {
    const result = await pool.query(`
        INSERT INTO class_bookings (
            class_id,
            customer_name,
            email,
            phone,
            status,
            people_count
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
    `, [
        data.classId,
        data.customerName,
        data.email,
        data.phone,
        data.status || 'pending',
        data.peopleCount || 1
    ]);

    return mapClassBookingRow(result.rows[0]);
}

async function getClassBookings(classId) {
    const result = await pool.query(
        `SELECT * FROM class_bookings WHERE class_id = $1 ORDER BY created_at DESC`,
        [classId]
    );

    return result.rows.map(mapClassBookingRow);
}

async function getClassBookingById(id) {
    const result = await pool.query(`
        SELECT cb.*,
               c.name AS class_name,
               c.start_time AS class_start_time,
               c.end_time AS class_end_time,
               c.instructor AS class_instructor,
               c.location AS class_location,
               c.capacity AS class_capacity,
               c.price AS class_price
        FROM class_bookings cb
        JOIN classes c ON c.id = cb.class_id
        WHERE cb.id = $1
    `, [id]);

    if (result.rows.length === 0) {
        return null;
    }

    return mapClassBookingWithClassRow(result.rows[0]);
}

async function getClassBookingsByClassIds(classIds = []) {
    if (!Array.isArray(classIds) || classIds.length === 0) {
        return [];
    }

    const result = await pool.query(`
        SELECT cb.*,
               c.start_time AS class_start_time
        FROM class_bookings cb
        JOIN classes c ON c.id = cb.class_id
        WHERE cb.class_id = ANY($1::int[])
        ORDER BY c.start_time ASC, cb.created_at ASC
    `, [classIds]);

    return result.rows.map(mapClassBookingRow);
}

async function getClassBookingsDetailed({ date = null } = {}) {
    const params = [];
    const conditions = [];

    if (date) {
        params.push(date);
        conditions.push(`DATE(c.start_time) = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
        SELECT cb.*,
               c.name AS class_name,
               c.start_time AS class_start_time,
               c.end_time AS class_end_time,
               c.instructor AS class_instructor,
               c.location AS class_location,
               c.capacity AS class_capacity,
               c.price AS class_price
        FROM class_bookings cb
        JOIN classes c ON c.id = cb.class_id
        ${whereClause}
        ORDER BY c.start_time ASC, cb.created_at ASC
    `, params);

    return result.rows.map(mapClassBookingWithClassRow);
}

async function updateClassBookingStatus(id, status) {
    const result = await pool.query(`
        UPDATE class_bookings
        SET status = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
    `, [status, id]);

    if (result.rows.length === 0) {
        return null;
    }

    return mapClassBookingRow(result.rows[0]);
}

async function deleteClassBooking(id) {
    const result = await pool.query('DELETE FROM class_bookings WHERE id = $1', [id]);
    return result.rowCount > 0;
}

async function getClassProducts({ type = null } = {}) {
    const conditions = [];
    const params = [];

    if (type) {
        params.push(type);
        conditions.push(`type = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(`
        SELECT * FROM class_products
        ${whereClause}
        ORDER BY price ASC, name ASC
    `, params);

    return result.rows.map(mapClassProductRow);
}

async function createClassProduct(product) {
    const result = await pool.query(`
        INSERT INTO class_products (
            type,
            name,
            description,
            price,
            number_of_classes,
            validity_period_days
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
    `, [
        product.type,
        product.name,
        product.description || null,
        product.price,
        product.numberOfClasses,
        product.validityPeriodDays || null
    ]);

    return mapClassProductRow(result.rows[0]);
}

async function updateClassProduct(id, product) {
    const result = await pool.query(`
        UPDATE class_products
        SET
            type = $1,
            name = $2,
            description = $3,
            price = $4,
            number_of_classes = $5,
            validity_period_days = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING *
    `, [
        product.type,
        product.name,
        product.description || null,
        product.price,
        product.numberOfClasses,
        product.validityPeriodDays || null,
        id
    ]);

    if (result.rows.length === 0) {
        return null;
    }

    return mapClassProductRow(result.rows[0]);
}

async function deleteClassProduct(id) {
    const result = await pool.query('DELETE FROM class_products WHERE id = $1', [id]);
    return result.rowCount > 0;
}

module.exports = {
    pool,
    getPool,
    query,
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
    getClassBookingById,
    getClassBookingsByClassIds,
    getClassBookingsDetailed,
    updateClassBookingStatus,
    deleteClassBooking,
    getClassProducts,
    createClassProduct,
    updateClassProduct,
    deleteClassProduct
};
