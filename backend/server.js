const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'bookings.json');
const SETTINGS_FILE = path.join(__dirname, 'settings.json');

// Middleware
app.use(cors());
app.use(express.json());

// Default settings
const defaultSettings = {
    businessName: "Premium Studio Booking",
    businessDescription: "Professional Recording Studio",
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
        minAdvanceBooking: 0, // hours
        maxAdvanceBooking: 30, // days
        slotInterval: 30, // minutes
        autoConfirm: false,
        requirePaymentProof: true
    },
    customMessage: {
        welcomeMessage: "Book your perfect space",
        bookingInstructions: "Please complete payment and send proof to WhatsApp after booking.",
        confirmationMessage: "Your booking will be confirmed within 30 minutes."
    },
    updatedAt: new Date().toISOString()
};

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
        await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2));
        console.log('Created settings.json file with defaults');
    }
}

// Load settings
async function loadSettings() {
    try {
        const data = await fs.readFile(SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading settings, using defaults:', error);
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
    
    // Only check confirmed bookings for conflicts
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

// ===== SETTINGS ROUTES =====

// Get current settings
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await loadSettings();
        res.json(settings);
    } catch (error) {
        console.error('Error getting settings:', error);
        res.status(500).json({ error: 'Failed to retrieve settings' });
    }
});

// Update settings
app.put('/api/settings', async (req, res) => {
    try {
        const currentSettings = await loadSettings();
        const updatedSettings = {
            ...currentSettings,
            ...req.body,
            updatedAt: new Date().toISOString()
        };
        
        const saved = await saveSettings(updatedSettings);
        if (saved) {
            res.json({
                success: true,
                settings: updatedSettings,
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

// Update specific setting category
app.patch('/api/settings/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const settings = await loadSettings();
        
        if (!settings[category]) {
            return res.status(400).json({ error: 'Invalid settings category' });
        }
        
        settings[category] = {
            ...settings[category],
            ...req.body
        };
        
        const saved = await saveSettings(settings);
        if (saved) {
            res.json({
                success: true,
                settings: settings,
                message: `${category} settings updated successfully`
            });
        } else {
            res.status(500).json({ error: 'Failed to save settings' });
        }
    } catch (error) {
        console.error('Error updating settings category:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// ===== BOOKING ROUTES =====

// Get all bookings or filter by date
app.get('/api/bookings', async (req, res) => {
    try {
        let bookings = await loadBookings();
        
        // Filter by date if provided
        if (req.query.date) {
            bookings = bookings.filter(b => b.date === req.query.date);
        }
        
        // Filter by status if provided
        if (req.query.status) {
            bookings = bookings.filter(b => b.status === req.query.status);
        }
        
        // Sort by date and time
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

// Create new booking (always starts as pending unless autoConfirm is enabled)
app.post('/api/bookings', async (req, res) => {
    try {
        const { customerName, email, phone, date, startTime, duration, totalPrice, notes } = req.body;
        
        // Validate required fields
        if (!customerName || !email || !phone || !date || !startTime || !duration || !totalPrice) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                required: ['customerName', 'email', 'phone', 'date', 'startTime', 'duration', 'totalPrice']
            });
        }
        
        // Validate duration
        if (duration !== 30 && duration !== 60) {
            return res.status(400).json({ error: 'Duration must be 30 or 60 minutes' });
        }
        
        // Check if time slots are available (only check against confirmed bookings)
        const available = await areSlotsAvailable(date, startTime, duration);
        if (!available) {
            return res.status(400).json({ 
                error: 'This time slot has already been confirmed. Please select another time.' 
            });
        }
        
        // Get settings to check if autoConfirm is enabled
        const settings = await loadSettings();
        const status = settings.bookingRules.autoConfirm ? 'confirmed' : 'pending';
        
        // Create new booking
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
        
        // Add booking to database
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

// Update booking status (for admin use)
app.patch('/api/bookings/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;
        
        // Validate status
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
        
        // If confirming, check availability again
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
        
        // Update booking
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

// Delete booking (admin only)
app.delete('/api/bookings/:id', async (req, res) => {
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

// Get statistics (admin use)
app.get('/api/stats', async (req, res) => {
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

// Clean up old cancelled/pending bookings (older than 30 days)
app.post('/api/cleanup', async (req, res) => {
    try {
        const bookings = await loadBookings();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const cleanedBookings = bookings.filter(b => {
            const bookingDate = new Date(b.date);
            // Keep all confirmed bookings and recent bookings
            return b.status === 'confirmed' || bookingDate > thirtyDaysAgo;
        });
        
        const removedCount = bookings.length - cleanedBookings.length;
        await saveBookings(cleanedBookings);
        
        res.json({
            success: true,
            message: `Cleaned up ${removedCount} old bookings`,
            removedCount: removedCount
        });
        
    } catch (error) {
        console.error('Error cleaning up bookings:', error);
        res.status(500).json({ error: 'Failed to clean up bookings' });
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
        console.log(`🌐 API Base: http://localhost:${PORT}/api`);
        console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
        console.log(`⚙️ Settings: http://localhost:${PORT}/api/settings`);
        console.log(`📅 Bookings: http://localhost:${PORT}/api/bookings`);
        console.log(`====================================`);
        console.log(`⏰ Timezone: Asia/Hong_Kong`);
        console.log(`📝 Dynamic settings loaded from settings.json`);
        console.log(`====================================`);
    });
}

startServer();