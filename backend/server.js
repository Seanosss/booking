const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'bookings.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

const ADMIN_TOKEN_TTL_MS = (() => {
    const ttlFromEnv = parseInt(process.env.ADMIN_TOKEN_TTL_MS, 10);
    return Number.isFinite(ttlFromEnv) && ttlFromEnv > 0
        ? ttlFromEnv
        : 1000 * 60 * 60; // 1 hour default
})();

const activeAdminTokens = new Map();

// Middleware
app.use(cors());
app.use(express.json());

function cleanupExpiredTokens() {
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

    activeAdminTokens.set(token, { issuedAt, expiresAt });

    return { token, issuedAt, expiresAt };
}

function authenticateAdmin(req, res, next) {
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

// Default settings with password and bilingual instructions
const defaultSettings = {
    businessName: "Premium Studio Booking",
    businessNameZh: "專業錄音室預約系統",
    businessDescription: "Professional Recording Studio",
    businessDescriptionZh: "專業錄音室",
    operatingHours: {
        startTime: "07:00",
        endTime: "22:00"
    },
    pricing: {
        thirtyMinutes: 140,
        oneHour: 280,
        sundayAirconFee: 80
    },
    paymentMethods: {
        bankTransfer: {
            enabled: true,
            bankName: "HSBC Hong Kong",
            accountNumber: "123-456789-001",
            accountName: "Connect Point Studio Ltd"
        },
        payme: {
            enabled: true,
            phoneNumber: "+852 9872 5268",
            displayName: "Connect Point Studio"
        }
    },
    contactInfo: {
        whatsapp: "85298725268",
        email: "connectpoint@atsumaru.com",
        phone: "+852 9872 5268"
    },
    bookingRules: {
        minAdvanceBooking: 0,
        maxAdvanceBooking: 30,
        slotInterval: 30,
        autoConfirm: false,
        requirePaymentProof: true
    },
    bookingInstructions: {
        titleZh: "重要預約須知",
        titleEn: "Important Booking Instructions",
        instruction1Zh: "選擇您想要的日期",
        instruction1En: "Select your preferred date",
        instruction2Zh: "點擊開始時段，再點擊結束時段（可選擇多個連續時段）",
        instruction2En: "Click start time, then click end time (can select multiple consecutive slots)",
        instruction3Zh: "填寫您的聯絡資料",
        instruction3En: "Fill in your contact information",
        instruction4Zh: "透過銀行轉帳或 PayMe 付款",
        instruction4En: "Make payment via Bank Transfer or PayMe",
        instruction5Zh: "將付款證明傳送至 WhatsApp: 98725268",
        instruction5En: "Send payment proof to WhatsApp: 98725268",
        instruction6Zh: "您的預約將在 30 分鐘內確認",
        instruction6En: "Your booking will be confirmed within 30 minutes"
    },
    adminPassword: "admin123", // Default password - CHANGE THIS!
    updatedAt: new Date().toISOString()
};

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Initialize files
async function initFiles() {
    // Initialize bookings file
    try {
        await fs.access(DATA_FILE);
    } catch (error) {
        await fs.writeFile(DATA_FILE, '[]');
        console.log('Created bookings.json file');
    }
    
    // Initialize settings file
    try {
        await fs.access(SETTINGS_FILE);
    } catch (error) {
        // Hash the default password before saving
        defaultSettings.adminPassword = hashPassword(defaultSettings.adminPassword);
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
        console.log('Created settings.json with default password: admin123');
    }
}

// Load settings
async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading settings:', error);
        return defaultSettings;
    }
}

// Save settings
async function saveSettings(settings) {
    try {
        settings.updatedAt = new Date().toISOString();
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving settings:', error);
        return false;
    }
}

// Load bookings
async function loadBookings() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading bookings:', error);
        return [];
    }
}

// Save bookings
async function saveBookings(bookings) {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(bookings, null, 2));
    } catch (error) {
        console.error('Error saving bookings:', error);
    }
}

// Generate unique booking ID
function generateBookingId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `BK-${timestamp}-${random}`.toUpperCase();
}

// Generate slots for a booking duration
function generateSlotsForDuration(startTime, durationMinutes) {
    const slots = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    let currentMinutes = startHour * 60 + startMinute;
    const endMinutes = currentMinutes + durationMinutes;
    
    while (currentMinutes < endMinutes) {
        const hour = Math.floor(currentMinutes / 60);
        const minute = currentMinutes % 60;
        const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push(timeSlot);
        currentMinutes += 30;
    }
    
    return slots;
}

// Check if slots are available
async function areSlotsAvailable(date, startTime, duration, excludeBookingId = null) {
    const bookings = await loadBookings();
    const requestedSlots = generateSlotsForDuration(startTime, duration);
    
    const confirmedBookings = bookings.filter(b => 
        b.date === date && 
        b.status === 'confirmed' && 
        b.id !== excludeBookingId
    );
    
    for (const booking of confirmedBookings) {
        const bookedSlots = generateSlotsForDuration(booking.startTime, booking.duration);
        const hasConflict = requestedSlots.some(slot => bookedSlots.includes(slot));
        if (hasConflict) {
            return false;
        }
    }
    
    return true;
}

// ===== ROUTES =====

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        timezone: 'Asia/Hong_Kong'
    });
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({ error: 'Password required' });
        }
        
        const settings = await loadSettings();
        const hashedPassword = hashPassword(password);
        
        if (hashedPassword === settings.adminPassword) {
            const { token, expiresAt } = issueAdminToken();

            res.json({
                success: true,
                token: token,
                tokenType: 'Bearer',
                expiresAt: new Date(expiresAt).toISOString(),
                message: 'Login successful'
            });
        } else {
            res.status(401).json({ 
                success: false,
                error: 'Invalid password' 
            });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Change admin password
app.post('/api/admin/change-password', authenticateAdmin, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: 'Both old and new passwords required' });
        }
        
        const settings = await loadSettings();
        const hashedOldPassword = hashPassword(oldPassword);
        
        if (hashedOldPassword !== settings.adminPassword) {
            return res.status(401).json({ error: 'Current password incorrect' });
        }
        
        settings.adminPassword = hashPassword(newPassword);
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

// Get settings (public version without password)
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await loadSettings();
        // Remove password before sending
        const publicSettings = { ...settings };
        delete publicSettings.adminPassword;
        res.json(publicSettings);
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ error: 'Failed to retrieve settings' });
    }
});

// Update settings (requires admin access)
app.put('/api/settings', authenticateAdmin, async (req, res) => {
    try {
        const currentSettings = await loadSettings();
        const updatedSettings = {
            ...currentSettings,
            ...req.body,
            adminPassword: currentSettings.adminPassword, // Keep existing password
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

// Get all bookings
app.get('/api/bookings', authenticateAdmin, async (req, res) => {
    try {
        let bookings = await loadBookings();
        
        if (req.query.date) {
            bookings = bookings.filter(b => b.date === req.query.date);
        }
        
        if (req.query.status) {
            bookings = bookings.filter(b => b.status === req.query.status);
        }
        
        bookings.sort((a, b) => {
            const dateA = new Date(a.date + 'T' + a.startTime);
            const dateB = new Date(b.date + 'T' + b.startTime);
            return dateA - dateB;
        });
        
        res.json(bookings);
    } catch (error) {
        console.error('Error getting bookings:', error);
        res.status(500).json({ error: 'Failed to retrieve bookings' });
    }
});

// Create new booking
app.post('/api/bookings', async (req, res) => {
    try {
        const { customerName, email, phone, date, startTime, duration, totalPrice, notes } = req.body;
        
        if (!customerName || !email || !phone || !date || !startTime || !duration || !totalPrice) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['customerName', 'email', 'phone', 'date', 'startTime', 'duration', 'totalPrice']
            });
        }
        
        const available = await areSlotsAvailable(date, startTime, duration);
        if (!available) {
            return res.status(400).json({ 
                error: 'This time slot has already been confirmed. Please select another time.' 
            });
        }
        
        const settings = await loadSettings();
        const status = settings.bookingRules.autoConfirm ? 'confirmed' : 'pending';
        
        const newBooking = {
            id: generateBookingId(),
            customerName,
            email,
            phone,
            date,
            startTime,
            duration,
            totalPrice,
            notes: notes || '',
            status: status,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            confirmedAt: status === 'confirmed' ? new Date().toISOString() : null,
            cancelledAt: null
        };
        
        const bookings = await loadBookings();
        bookings.push(newBooking);
        await saveBookings(bookings);
        
        const message = status === 'confirmed' 
            ? 'Booking confirmed successfully!'
            : 'Booking created successfully. Please send payment confirmation.';
        
        res.status(201).json({
            success: true,
            booking: newBooking,
            message: message
        });
        
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ error: 'Failed to create booking' });
    }
});

// Update booking status
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
        
        const bookings = await loadBookings();
        const bookingIndex = bookings.findIndex(b => b.id === id);
        
        if (bookingIndex === -1) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        const booking = bookings[bookingIndex];
        
        if (status === 'confirmed' && booking.status !== 'confirmed') {
            const available = await areSlotsAvailable(
                booking.date, 
                booking.startTime, 
                booking.duration, 
                booking.id
            );
            
            if (!available) {
                return res.status(400).json({ 
                    error: 'Cannot confirm booking. Time slot is already taken.' 
                });
            }
        }
        
        booking.status = status;
        booking.updatedAt = new Date().toISOString();
        
        if (adminNotes) {
            booking.adminNotes = adminNotes;
        }
        
        if (status === 'confirmed') {
            booking.confirmedAt = new Date().toISOString();
        } else if (status === 'cancelled') {
            booking.cancelledAt = new Date().toISOString();
        }
        
        await saveBookings(bookings);
        
        res.json({
            success: true,
            booking: booking,
            message: `Booking ${status} successfully`
        });
        
    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ error: 'Failed to update booking status' });
    }
});

// Get booking by ID
app.get('/api/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const bookings = await loadBookings();
        const booking = bookings.find(b => b.id === id);
        
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        res.json(booking);
    } catch (error) {
        console.error('Error getting booking:', error);
        res.status(500).json({ error: 'Failed to retrieve booking' });
    }
});

// Delete booking
app.delete('/api/bookings/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const bookings = await loadBookings();
        const bookingIndex = bookings.findIndex(b => b.id === id);
        
        if (bookingIndex === -1) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        bookings.splice(bookingIndex, 1);
        await saveBookings(bookings);
        
        res.json({ 
            success: true,
            message: 'Booking deleted successfully' 
        });
        
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ error: 'Failed to delete booking' });
    }
});

// Get statistics
app.get('/api/stats', authenticateAdmin, async (req, res) => {
    try {
        const bookings = await loadBookings();
        const today = new Date().toISOString().split('T')[0];
        
        const stats = {
            total: bookings.length,
            pending: bookings.filter(b => b.status === 'pending').length,
            confirmed: bookings.filter(b => b.status === 'confirmed').length,
            cancelled: bookings.filter(b => b.status === 'cancelled').length,
            todayBookings: bookings.filter(b => b.date === today).length,
            upcomingBookings: bookings.filter(b => b.date >= today && b.status === 'confirmed').length,
            totalRevenue: bookings
                .filter(b => b.status === 'confirmed')
                .reduce((sum, b) => sum + (b.totalPrice || 0), 0)
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
});

// Start server
async function startServer() {
    await initFiles();
    
    app.listen(PORT, () => {
        console.log(`====================================`);
        console.log(`🚀 Booking Server Running`);
        console.log(`====================================`);
        console.log(`📍 Port: ${PORT}`);
        console.log(`🌐 API: http://localhost:${PORT}/api`);
        console.log(`🔐 Default Admin Password: admin123`);
        console.log(`⚠️  PLEASE CHANGE THE DEFAULT PASSWORD!`);
        console.log(`====================================`);
    });
}

startServer();