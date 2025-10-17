# Rental Booking System - Complete Setup Guide

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Features](#features)
3. [Installation](#installation)
4. [Running Locally](#running-locally)
5. [Embedding in Wix](#embedding-in-wix)
6. [Deployment](#deployment)
7. [Configuration](#configuration)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 System Overview

This is a complete booking system with:
- **Frontend**: Customer booking interface (HTML/CSS/JS)
- **Backend**: Node.js API server with database
- **Admin Panel**: Booking management interface

### Business Rules
- **Hours**: Monday - Sunday, 7:00 AM - 10:00 PM
- **Slots**: 30 minutes or 1 hour sessions
- **Pricing**:
  - 30 minutes: HKD 140
  - 1 hour: HKD 280
  - Sunday aircon fee: +HKD 80 per hour
- **Payment**: Manual confirmation via WhatsApp or Email

---

## ✨ Features

### Customer Features
✓ Interactive calendar with real-time availability
✓ Select multiple consecutive time slots
✓ Choose between 30-min or 1-hour durations
✓ Automatic pricing calculation (including Sunday fees)
✓ Prevent double-booking
✓ Payment instructions with WhatsApp/Email links
✓ Mobile-responsive design

### Admin Features
✓ View all bookings in a table
✓ Filter by status (pending/confirmed/cancelled)
✓ Filter by date
✓ Confirm or cancel bookings
✓ View customer contact information
✓ Revenue tracking
✓ Real-time statistics

---

## 🚀 Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- A text editor (VS Code recommended)

### Step 1: Install Backend Dependencies
```bash
cd backend
npm install
```

This will install:
- express: Web server
- cors: Cross-origin resource sharing

---

## 💻 Running Locally

### Start the Backend Server
```bash
cd backend
npm start
```

The server will start at: `http://localhost:3000`

### Test the Frontend
1. Open `frontend/index.html` in your browser
2. You should see the booking interface
3. Select a date and time slots to test

### Access Admin Panel
1. Open `admin/index.html` in your browser
2. You'll see all bookings with management options

---

## 🌐 Embedding in Wix

### Method 1: Using Wix Custom Element (Recommended)

1. **Deploy Backend First** (see Deployment section below)

2. **Update API URLs**:
   - Open `frontend/index.html`
   - Find line: `const API_BASE_URL = 'http://localhost:3000/api';`
   - Replace with your deployed backend URL: 
     ```javascript
     const API_BASE_URL = 'https://your-backend-url.com/api';
     ```

3. **In Wix Editor**:
   - Click **Add** (+) button
   - Go to **Embed** → **Custom Element**
   - Choose **HTML iframe**

4. **Add Your Code**:
   - Copy the ENTIRE content of `frontend/index.html`
   - Paste it into the Wix HTML iframe
   - Click **Update**

5. **Adjust Size**:
   - Drag the iframe to desired size
   - Recommended: Full width, minimum height 800px

### Method 2: Using Wix Velo

1. In Wix Editor, enable **Dev Mode**
2. Add a **Custom Element**
3. Create a new page in Velo
4. Import the booking system code
5. Connect to your backend API

### Method 3: External Link (Easiest for Testing)

1. Deploy `frontend/index.html` to any hosting service
2. In Wix, add a button or link
3. Link it to your deployed booking page

---

## 🚀 Deployment

### Option A: Deploy to Heroku (Free Tier Available)

#### Backend Deployment

1. **Install Heroku CLI**:
   ```bash
   npm install -g heroku
   ```

2. **Login to Heroku**:
   ```bash
   heroku login
   ```

3. **Create Heroku App**:
   ```bash
   cd backend
   heroku create your-booking-api
   ```

4. **Deploy**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```

5. **Your API URL**:
   ```
   https://your-booking-api.herokuapp.com/api
   ```

#### Frontend Deployment

1. **Update API URL** in `frontend/index.html`:
   ```javascript
   const API_BASE_URL = 'https://your-booking-api.herokuapp.com/api';
   ```

2. **Deploy to Netlify/Vercel**:
   - Drag and drop `frontend` folder to [Netlify Drop](https://app.netlify.com/drop)
   - Get your frontend URL: `https://your-booking.netlify.app`

### Option B: Deploy to Railway (Recommended)

1. Go to [Railway.app](https://railway.app)
2. Sign up/Login with GitHub
3. Click "New Project" → "Deploy from GitHub"
4. Select your repository
5. Railway will auto-detect Node.js and deploy
6. Get your backend URL from Railway dashboard

### Option C: Deploy to Your Own Server

1. **Requirements**:
   - VPS with Node.js installed
   - Domain name (optional)

2. **Transfer Files**:
   ```bash
   scp -r backend user@your-server:/var/www/booking-api
   ```

3. **Install PM2** (keeps server running):
   ```bash
   npm install -g pm2
   ```

4. **Start Server**:
   ```bash
   cd /var/www/booking-api
   npm install
   pm2 start server.js --name booking-api
   pm2 save
   pm2 startup
   ```

5. **Setup Nginx** (optional, for custom domain):
   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## ⚙️ Configuration

### Update Payment Information

In `frontend/index.html`, find these lines and update:

```javascript
const WHATSAPP_NUMBER = '85298725268'; // Your WhatsApp (with country code)
const EMAIL = 'connectpoint@atsumaru.com'; // Your email

// In the payment modal section, update:
<p>💳 <strong>Bank Transfer:</strong><br>
Account Number: <strong>123-456789-001</strong><br>  // Your account
Bank: HSBC</p>  // Your bank

<p>📱 <strong>PayMe:</strong><br>
Phone: <strong>+852 9872 5268</strong></p>  // Your PayMe
```

### Update Business Hours

To change operating hours, modify in `frontend/index.html`:

```javascript
// Find this loop (around line 500)
for (let hour = 7; hour < 22; hour++) {  // 7 = 7am, 22 = 10pm
    // Change these numbers to adjust hours
}
```

### Update Pricing

In `frontend/index.html`:

```javascript
const PRICE_PER_HOUR = 280;  // Your hourly rate
const PRICE_PER_30MIN = 140;  // Your 30-min rate
const SUNDAY_AIRCON_FEE = 80;  // Sunday additional fee
```

---

## 🔧 Troubleshooting

### Problem: "Failed to load time slots"
**Solution**: Backend server is not running
- Start backend: `cd backend && npm start`
- Check console for errors

### Problem: CORS Error
**Solution**: Update CORS settings in `backend/server.js`:
```javascript
app.use(cors({
    origin: 'https://your-wix-site.com'
}));
```

### Problem: Bookings not saving
**Solution**: Check `bookings.json` file exists
```bash
cd backend
ls -la bookings.json
# If missing, restart server (it will create it)
```

### Problem: Admin panel shows no bookings
**Solution**: 
1. Check if backend is running
2. Open browser console (F12)
3. Look for API errors
4. Verify API URL is correct

### Problem: Double bookings happening
**Solution**: Make sure only ONE backend server is running
```bash
# Find running processes
ps aux | grep node
# Kill duplicate processes if needed
kill [PID]
```

---

## 📱 Testing Checklist

Before going live, test:

- [ ] Select a date and see available slots
- [ ] Book multiple consecutive slots
- [ ] Verify pricing calculation (including Sunday fee)
- [ ] Submit booking with all details
- [ ] Check WhatsApp link opens correctly
- [ ] Check email link works
- [ ] Admin panel shows new booking
- [ ] Admin can confirm booking
- [ ] Admin can cancel booking
- [ ] Test on mobile device
- [ ] Test double-booking prevention

---

## 🔐 Security Considerations

For production use, consider:

1. **Add Authentication** for admin panel
2. **Use HTTPS** for all connections
3. **Add Rate Limiting** to prevent spam
4. **Validate Input** on backend
5. **Add Email Notifications** for bookings
6. **Use Real Database** (PostgreSQL, MongoDB)
7. **Add Backup System** for bookings.json

---

## 📈 Future Enhancements

Possible improvements:
- Email notifications to customers and admin
- SMS confirmations
- Online payment integration (Stripe, PayPal)
- Calendar sync (Google Calendar)
- Automated reminders
- Customer accounts with booking history
- Multi-language support
- Advanced analytics dashboard

---

## 📞 Support

If you need help:
1. Check the troubleshooting section above
2. Review browser console for errors (F12)
3. Check backend logs for errors
4. Verify all configuration is correct

---

## 📝 License

This booking system is provided as-is for your use. Feel free to modify and customize as needed.

---

**Happy Booking! 🎉**
