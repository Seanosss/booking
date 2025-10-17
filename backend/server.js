const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'bookings.json');

app.use(cors());
app.use(express.json());

// Initialize data file if it doesn't exist
async function initDataFile() {
    try {
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({ bookings: [] }));
    }
}

// Read bookings from file
async function readBookings() {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
}

// Write bookings to file
async function writeBookings(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get all bookings
app.get('/api/bookings', async (req, res) => {
    try {
        const data = await readBookings();
        res.json(data.bookings);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read bookings' });
    }
});

// Get available slots for a specific date
app.get('/api/available-slots', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Date parameter required' });
        }

        const data = await readBookings();
        // ONLY show confirmed bookings as blocked (not pending)
        const dayBookings = data.bookings.filter(b => 
            b.date === date && b.status === 'confirmed'
        );

        // Generate all possible slots for the day (7am - 10pm)
        const allSlots = [];
        for (let hour = 7; hour < 22; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                allSlots.push(time);
            }
        }

        // Check which slots are booked
        const bookedSlots = new Set();
        dayBookings.forEach(booking => {
            booking.slots.forEach(slot => {
                bookedSlots.add(slot);
            });
        });

        // Return available slots
        const availableSlots = allSlots.filter(slot => !bookedSlots.has(slot));
        
        res.json({ 
            date, 
            availableSlots,
            bookedSlots: Array.from(bookedSlots)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to check availability' });
    }
});

// Create a new booking
app.post('/api/bookings', async (req, res) => {
    try {
        const { customerName, email, phone, date, slots, duration, totalPrice } = req.body;

        // Validation
        if (!customerName || !email || !phone || !date || !slots || !duration) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const data = await readBookings();

        // Check if slots are still available
        // IMPORTANT: Only count CONFIRMED bookings as blocked
        // Pending bookings don't block slots until admin confirms
        const dayBookings = data.bookings.filter(b => 
            b.date === date && b.status === 'confirmed'
        );
        
        const bookedSlots = new Set();
        dayBookings.forEach(booking => {
            booking.slots.forEach(slot => bookedSlots.add(slot));
        });

        const conflict = slots.some(slot => bookedSlots.has(slot));
        if (conflict) {
            return res.status(409).json({ error: 'Some slots are no longer available' });
        }

        // Create new booking
        const newBooking = {
            id: Date.now().toString(),
            customerName,
            email,
            phone,
            date,
            slots,
            duration,
            totalPrice,
            status: 'pending', // pending, confirmed, cancelled
            createdAt: new Date().toISOString()
        };

        data.bookings.push(newBooking);
        await writeBookings(data);

        res.status(201).json({ 
            success: true, 
            booking: newBooking,
            message: 'Booking created successfully. Please send payment confirmation.'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create booking' });
    }
});

// Update booking status (for admin)
app.patch('/api/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const data = await readBookings();
        const bookingIndex = data.bookings.findIndex(b => b.id === id);

        if (bookingIndex === -1) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        data.bookings[bookingIndex].status = status;
        data.bookings[bookingIndex].updatedAt = new Date().toISOString();
        
        await writeBookings(data);

        res.json({ 
            success: true, 
            booking: data.bookings[bookingIndex] 
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update booking' });
    }
});

// Delete booking (for admin)
app.delete('/api/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await readBookings();
        
        data.bookings = data.bookings.filter(b => b.id !== id);
        await writeBookings(data);

        res.json({ success: true, message: 'Booking deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete booking' });
    }
});

// Initialize and start server
initDataFile().then(() => {
    app.listen(PORT, () => {
        console.log(`Booking system backend running on http://localhost:${PORT}`);
    });
});
