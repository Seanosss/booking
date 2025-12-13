require('dotenv').config();
const { Pool } = require('pg');

const poolConfig = {
    connectionString: process.env.DATABASE_URL,
};

if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')) {
    poolConfig.ssl = {
        rejectUnauthorized: false
    };
}

const pool = new Pool(poolConfig);
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

const DEFAULT_PAYMENT_METHODS = {
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
    },
    fps: {
        enabled: false,
        fpsNumber: '',
        displayName: ''
    }
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
    paymentMethods: { ...DEFAULT_PAYMENT_METHODS },
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

function mergePaymentMethods(paymentMethods = {}) {
    const bankTransfer = {
        ...DEFAULT_PAYMENT_METHODS.bankTransfer,
        ...(paymentMethods.bankTransfer || {})
    };

    const payme = {
        ...DEFAULT_PAYMENT_METHODS.payme,
        ...(paymentMethods.payme || {})
    };

    const fps = {
        ...DEFAULT_PAYMENT_METHODS.fps,
        ...(paymentMethods.fps || {})
    };

    return {
        bankTransfer,
        payme,
        fps
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

function formatDateOnly(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        return value.length >= 10 ? value.slice(0, 10) : value;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
        paymentMethods: mergePaymentMethods(row.payment_methods || {}),
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
        date: formatDateOnly(row.date),
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
        date: formatDateOnly(row.date),
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
        specialPriceForTwo: row.special_price_for_two === null
            ? null
            : Number(row.special_price_for_two),
        tags,
        isTrialOnly: Boolean(row.is_trial_only),
        type: 'class',
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
    console.log('Initializing database...');

    try {
        await pool.query('SELECT 1');
        console.log('Database connection established successfully.');
    } catch (error) {
        console.error('Failed to connect to the database:', error);
        throw error;
    }

    const schemaStatements = [
        `
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
    `,
        `
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
    `,
        `
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
    `,
        `
        ALTER TABLE catalog_items
        ADD COLUMN IF NOT EXISTS description TEXT
    `,
        `
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
    `,
        `
        CREATE INDEX IF NOT EXISTS idx_booking_items_date ON booking_items(date)
    `,
        `
        CREATE INDEX IF NOT EXISTS idx_booking_items_catalog ON booking_items(catalog_item_id)
    `,
        `
        ALTER TABLE bookings
        ALTER COLUMN total_people SET DEFAULT 0
    `,
        `
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
            special_price_for_two NUMERIC(10, 2),
            is_trial_only BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `,
        `
        ALTER TABLE classes
        ADD COLUMN IF NOT EXISTS special_price_for_two NUMERIC(10, 2)
    `,
        `
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
    `,
        `
        ALTER TABLE class_bookings
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    `,
        `
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
    `,
        `
        CREATE INDEX IF NOT EXISTS idx_classes_start_time ON classes(start_time)
    `,
        `
        CREATE INDEX IF NOT EXISTS idx_classes_tags ON classes USING GIN (tags)
    `,
        `
        CREATE INDEX IF NOT EXISTS idx_class_bookings_class_id ON class_bookings(class_id)
    `,
        `
        CREATE TABLE IF NOT EXISTS admin_users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'receptionist')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `
    ];

    for (const statement of schemaStatements) {
        await pool.query(statement);
    }

    console.log('Database schema ensured.');

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
            mergePaymentMethods(defaultSettings.paymentMethods),
            defaultSettings.contactInfo,
            defaultSettings.bookingRules,
            defaultSettings.bookingInstructions,
            DEFAULT_ADMIN_PASSWORD
        ]);
        console.log('Initialized settings with default admin password.');
    }

    // Ensure default super admin exists
    const adminCount = await pool.query('SELECT COUNT(*)::int AS count FROM admin_users');
    if (adminCount.rows[0].count === 0) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
        const passwordHash = `${salt}:${hash}`;

        await pool.query(`
            INSERT INTO admin_users (username, password_hash, role)
            VALUES ($1, $2, $3)
        `, ['admin', passwordHash, 'super_admin']);
        console.log('Initialized default super admin user (admin / admin123).');
    }

    console.log('Database initialization complete.');
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, originalHash] = storedHash.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
}

async function loadSettings() {
    const result = await pool.query('SELECT * FROM settings ORDER BY id LIMIT 1');
    if (result.rows.length === 0) {
        return {
            ...defaultSettings,
            operatingHours: mergeOperatingHours(defaultSettings.operatingHours),
            pricing: mergePricing(defaultSettings.pricing),
            paymentMethods: mergePaymentMethods(defaultSettings.paymentMethods),
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
        mergePaymentMethods(settings.paymentMethods),
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
        const aggregatedPeople = Number.isInteger(bookingData.totalPeople) && bookingData.totalPeople > 0
            ? bookingData.totalPeople
            : null;
        const totalPeople = aggregatedPeople
            ?? bookingData.items.reduce((sum, item) => sum + item.peopleCount, 0);
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

        console.log('[BookingCreate] Database stored date fields:', {
            bookingDate: bookingResult.rows[0]?.date,
            bookingItemDates: bookingData.items.map(item => item.date)
        });

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

async function checkRentalAvailability(date, startTime, endTime, excludeBookingId = null, catalogItemId = null) {
    const conflicts = await getRoomConflicts(date, startTime, endTime, excludeBookingId, catalogItemId);
    return {
        available: conflicts.length === 0,
        conflicts
    };
}

async function getRoomConflicts(date, startTime, endTime, excludeBookingId = null, catalogItemId = null) {
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

    if (catalogItemId) {
        params.push(catalogItemId);
        // Conflict if existing booking is for the SAME room OR is a General booking (NULL)
        query += ` AND (bi.catalog_item_id = $${params.length} OR bi.catalog_item_id IS NULL)`;
    }

    const bookingResult = await pool.query(query, params);
    const bookingConflicts = bookingResult.rows.map(mapBookingItemRow);

    const classParams = [
        date,
        `${date}T${endTime}:00`,
        `${date}T${startTime}:00`
    ];
    // Classes block everything by default (as they assume full studio usage usually)
    // If classes had room allocation, we would filter here too.
    const classResult = await pool.query(`
        SELECT id, name, start_time, end_time
        FROM classes
        WHERE DATE(start_time) = $1
          AND start_time < $2::timestamptz
          AND end_time > $3::timestamptz
    `, classParams);

    const classConflicts = classResult.rows.map(row => ({
        id: row.id,
        itemType: 'class_session',
        name: row.name,
        startTime: row.start_time,
        endTime: row.end_time,
        date
    }));

    return [...bookingConflicts, ...classConflicts];
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
            special_price_for_two,
            is_trial_only
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
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
        data.specialPriceForTwo === null || data.specialPriceForTwo === undefined
            ? null
            : data.specialPriceForTwo,
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
            special_price_for_two = $10,
            is_trial_only = $11,
            updated_at = NOW()
        WHERE id = $12
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
        data.specialPriceForTwo === null || data.specialPriceForTwo === undefined
            ? null
            : data.specialPriceForTwo,
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

async function getClassConflicts(startTimeIso, endTimeIso, excludeClassId = null) {
    const params = [endTimeIso, startTimeIso];
    let sql = `
        SELECT *
        FROM classes
        WHERE start_time < $1::timestamptz
          AND end_time > $2::timestamptz
    `;

    if (excludeClassId) {
        params.push(excludeClassId);
        sql += ` AND id <> $${params.length}`;
    }

    const result = await pool.query(sql, params);
    return result.rows.map(mapClassRow);
}

async function checkClassScheduleAvailability(startTimeIso, endTimeIso, excludeClassId = null) {
    const start = new Date(startTimeIso);
    const end = new Date(endTimeIso);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Invalid date range provided');
    }

    const dateString = typeof startTimeIso === 'string' && startTimeIso.length >= 10
        ? startTimeIso.slice(0, 10)
        : formatDateOnly(start);
    const startTimeString = typeof startTimeIso === 'string' && startTimeIso.length >= 16
        ? startTimeIso.slice(11, 16)
        : `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
    const endTimeString = typeof endTimeIso === 'string' && endTimeIso.length >= 16
        ? endTimeIso.slice(11, 16)
        : `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

    const rentalConflicts = await getRoomConflicts(dateString, startTimeString, endTimeString);
    const classConflicts = await getClassConflicts(startTimeIso, endTimeIso, excludeClassId);

    return {
        available: rentalConflicts.length === 0 && classConflicts.length === 0,
        rentalConflicts,
        classConflicts
    };
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
    getClassConflicts,
    createClass,
    updateClass,
    deleteClass,
    checkClassScheduleAvailability,
    checkRentalAvailability,
    hashPassword,
    verifyPassword,
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
