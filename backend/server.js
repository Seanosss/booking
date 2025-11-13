require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const {
    initializeDatabase,
    loadSettings,
    saveSettings,
    areSlotsAvailable,
    getBookings,
    createBooking,
    getBookingById,
    updateBookingStatus,
    deleteBooking,
    getStats,
    DEFAULT_ADMIN_PASSWORD
} = require('./db');
const { hashPassword } = require('./utils/hash');

const app = express();
const PORT = process.env.PORT || 3000;

const DEFAULT_SLOT_INTERVAL = 30;

const bookingSchema = z.object({
    customerName: z.string({ required_error: 'Customer name is required' })
        .trim()
        .min(1, 'Customer name is required')
        .max(100, 'Customer name must be 100 characters or fewer'),
    email: z.string({ required_error: 'Email address is required' })
        .trim()
        .email('Please enter a valid email address'),
    phone: z.string({ required_error: 'Phone number is required' })
        .trim()
        .regex(/^[+\d][\d\s-]{6,19}$/, 'Please enter a valid phone number'),
    date: z.string({ required_error: 'Booking date is required' })
        .trim()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
        .refine(value => {
            const date = new Date(`${value}T00:00:00`);
            return !Number.isNaN(date.getTime());
        }, 'Date is invalid'),
    startTime: z.string({ required_error: 'Start time is required' })
        .trim()
        .regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format')
        .refine(value => {
            const [hour, minute] = value.split(':').map(Number);
            return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
        }, 'Start time must be a valid time'),
    selectedSlots: z.array(
        z.string()
            .trim()
            .regex(/^\d{2}:\d{2}$/, 'Each selected slot must be in HH:MM format')
            .refine(value => {
                const [hour, minute] = value.split(':').map(Number);
                return hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
            }, 'Each selected slot must be a valid time')
    ).min(1, 'Please select at least one time slot'),
    notes: z.string().trim().max(1000, 'Notes must be 1000 characters or fewer').optional().default('')
}).strict();

const rateLimitHandler = (message) => (req, res) => {
    res.status(429).json({
        error: message,
        details: ['Please try again in a few minutes.']
    });
};

const bookingCreationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler('Too many booking attempts detected.')
});

const slotLookupLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler('Too many slot lookup requests.')
});

// Middleware
app.use(cors());
app.use(express.json());

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
            // Generate session token
            const token = crypto.randomBytes(32).toString('hex');
            
            res.json({
                success: true,
                token: token,
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
app.post('/api/admin/change-password', async (req, res) => {
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
app.put('/api/settings', async (req, res) => {
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
app.get('/api/bookings', slotLookupLimiter, async (req, res) => {
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

// Create new booking
app.post('/api/bookings', bookingCreationLimiter, async (req, res) => {
    try {
        const { customerName, email, phone, date, startTime, duration, totalPrice, notes } = req.body;

        if (!customerName || !email || !phone || !date || !startTime || !duration || totalPrice === undefined) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['customerName', 'email', 'phone', 'date', 'startTime', 'duration', 'totalPrice']
            });
        }

        const parsedDuration = parseInt(duration, 10);
        const numericTotalPrice = Number(totalPrice);

        if (Number.isNaN(parsedDuration) || parsedDuration <= 0) {
            return res.status(400).json({ error: 'Duration must be a positive number of minutes' });
        }

        if (Number.isNaN(numericTotalPrice)) {
            return res.status(400).json({ error: 'Total price must be a valid number' });
        }

        const available = await areSlotsAvailable(date, startTime, parsedDuration);
        if (!available) {
            return res.status(400).json({
                error: 'This time slot has already been confirmed. Please select another time.'
            });
        }

        const settings = await loadSettings();
        const status = settings.bookingRules.autoConfirm ? 'confirmed' : 'pending';

        const newBooking = await createBooking({
            customerName,
            email,
            phone,
            date,
            startTime,
            duration: parsedDuration,
            totalPrice: numericTotalPrice,
            notes: notes || '',
            status
        });

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
app.patch('/api/bookings/:id/status', async (req, res) => {
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
            const slotInterval = Number(settings.bookingRules?.slotInterval) || DEFAULT_SLOT_INTERVAL;
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

// Get booking by ID
app.get('/api/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const booking = await getBookingById(id);

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
app.delete('/api/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await deleteBooking(id);

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

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const stats = await getStats(today);

        res.json(stats);
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
});

// Start server
async function startServer() {
    try {
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(`====================================`);
            console.log(`🚀 Booking Server Running`);
            console.log(`====================================`);
            console.log(`📍 Port: ${PORT}`);
            console.log(`🌐 API: http://localhost:${PORT}/api`);
            console.log(`🔐 Default Admin Password: ${DEFAULT_ADMIN_PASSWORD}`);
            console.log(`⚠️  PLEASE CHANGE THE DEFAULT PASSWORD!`);
            console.log(`====================================`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
