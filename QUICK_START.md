# ⚡ Quick Start Guide - Get Running in 5 Minutes

## 🎯 What You're Getting

A complete rental booking system with:
- ✅ Customer booking interface with calendar
- ✅ Real-time availability checking
- ✅ Automatic price calculation (including Sunday fees)
- ✅ Double-booking prevention
- ✅ WhatsApp & Email payment confirmation
- ✅ Admin panel to manage bookings
- ✅ Mobile-responsive design

## 🚀 Fastest Way to Get Started

### Step 1: Install Node.js (if you haven't)

**Download Node.js**: https://nodejs.org/
- Choose the LTS version
- Install with default settings
- Restart your computer if prompted

### Step 2: Start the System

**Windows Users:**
```
Double-click: start.bat
```

**Mac/Linux Users:**
```bash
./start.sh
```
or
```bash
bash start.sh
```

That's it! The backend server is now running.

### Step 3: Test It

1. **Open Frontend**: 
   - Go to `frontend` folder
   - Double-click `index.html`
   - Your browser will open the booking page

2. **Test Booking**:
   - Select today's date
   - Choose a time slot
   - Fill in your info
   - Click "Book Now"

3. **Check Admin Panel**:
   - Go to `admin` folder
   - Double-click `index.html`
   - See your test booking!

**It works!** 🎉

## 📝 Before Going Live

### 1. Update Your Information

Open `frontend/index.html` in a text editor and find:

```javascript
const WHATSAPP_NUMBER = '85298725268';  // ← Change this
const EMAIL = 'connectpoint@atsumaru.com';  // ← Change this
```

Also update payment info (around line 320):
```html
Account Number: <strong>123-456789-001</strong>  <!-- ← Change this -->
Bank: HSBC  <!-- ← Change this -->
```

### 2. Deploy Backend

Your booking system needs a backend server. Choose one:

#### Option A: Heroku (Recommended for Beginners)
1. Go to: https://www.heroku.com
2. Sign up (free tier available)
3. Install Heroku CLI
4. Run these commands in the `backend` folder:
```bash
heroku login
heroku create my-booking-api
git init
git add .
git commit -m "Initial commit"
git push heroku main
```
5. Your API URL: `https://my-booking-api.herokuapp.com/api`

#### Option B: Railway (Easiest)
1. Go to: https://railway.app
2. Sign in with GitHub
3. Click "New Project" → "Deploy from GitHub"
4. Connect your repository
5. Railway auto-deploys and gives you a URL

#### Option C: Your Own Server
If you have a VPS:
```bash
# Upload files to your server
scp -r backend user@your-server:/var/www/booking-api

# Install dependencies
ssh user@your-server
cd /var/www/booking-api
npm install

# Install PM2
npm install -g pm2

# Start server
pm2 start server.js --name booking-api
pm2 save
```

### 3. Update Frontend with Backend URL

In `frontend/index.html`, line 442:
```javascript
const API_BASE_URL = 'https://your-backend-url.com/api';
```

Replace with your actual backend URL from Step 2.

### 4. Embed in Wix

**Easiest Method**:
1. Open `frontend/index.html`
2. Copy ALL the code (Ctrl+A, then Ctrl+C)
3. In Wix Editor:
   - Click Add (+)
   - Embed → Embed Code
   - Choose "Custom embeds" → "Embed HTML"
   - Paste your code
   - Set size: Full width, 900px height
4. Preview, then Publish!

**Detailed instructions**: See `WIX_EMBEDDING_GUIDE.md`

## 🎨 Customization (Optional)

### Change Colors

In `frontend/index.html`, find the `<style>` section:

```css
/* Main colors - around line 22 */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

Replace `#667eea` and `#764ba2` with your brand colors.

### Change Pricing

In `frontend/index.html`, around line 443:

```javascript
const PRICE_PER_HOUR = 280;      // Your price
const PRICE_PER_30MIN = 140;     // Your price
const SUNDAY_AIRCON_FEE = 80;    // Your fee
```

### Change Business Hours

In `frontend/index.html`, around line 500:

```javascript
for (let hour = 7; hour < 22; hour++) {  // 7am to 10pm
```

Change 7 (start) and 22 (end) to your hours.

## 📊 File Structure

```
booking-system/
├── frontend/
│   └── index.html          ← Customer booking page
├── backend/
│   ├── server.js           ← API server
│   ├── package.json        ← Dependencies
│   └── bookings.json       ← Database (auto-created)
├── admin/
│   └── index.html          ← Admin panel
├── README.md               ← Full documentation
├── WIX_EMBEDDING_GUIDE.md  ← Wix instructions
├── DEPLOYMENT_CHECKLIST.md ← Pre-launch checklist
├── start.sh                ← Start script (Mac/Linux)
└── start.bat               ← Start script (Windows)
```

## 🔧 Troubleshooting

### "Cannot find module 'express'"
```bash
cd backend
npm install
```

### "Address already in use"
Another app is using port 3000. Either:
- Close that app
- Or change port in `backend/server.js`:
```javascript
const PORT = 3001;  // Use different port
```

### "Failed to load slots"
- Backend server not running
- Check if http://localhost:3000/api/bookings works
- Start the backend with `start.bat` or `start.sh`

### Frontend not connecting to backend
Check the API URL in `frontend/index.html`:
```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```
Make sure it matches where your backend is running.

## 💡 Pro Tips

1. **Keep backend running**: Don't close the terminal/command prompt with the server
2. **Test locally first**: Make sure everything works before deploying
3. **Backup bookings**: The `bookings.json` file contains all bookings
4. **Check admin panel regularly**: Monitor new bookings
5. **Mobile test**: Always test on your phone before going live

## 📱 What Happens When Customer Books?

1. Customer selects date and time slots
2. System checks availability (prevents double-booking)
3. Customer fills in their info
4. System calculates total (including Sunday fee if applicable)
5. Booking is created with "pending" status
6. Payment modal shows with:
   - Your bank account details
   - Your PayMe info
   - WhatsApp link (pre-filled message)
   - Email link (pre-filled subject)
7. Customer sends payment proof via WhatsApp or email
8. You see booking in admin panel
9. You verify payment
10. You click "Confirm" in admin panel
11. Booking is confirmed! ✅

## 🎓 Need More Help?

- **Full documentation**: `README.md`
- **Wix setup**: `WIX_EMBEDDING_GUIDE.md`
- **Pre-launch checklist**: `DEPLOYMENT_CHECKLIST.md`

## ⚠️ Important Notes

- Keep the backend running at all times (use PM2 or similar)
- Backup `bookings.json` regularly
- Monitor the admin panel for new bookings
- Respond to payment confirmations promptly
- Test the entire flow before going live

## 🎯 Your Booking System Features

### Customer Side
- 📅 Visual calendar interface
- ⏰ Real-time availability
- 💰 Automatic pricing (Mon-Sat: HKD 280/hr, Sun: +HKD 80)
- 📱 WhatsApp integration
- 📧 Email integration
- 🚫 Prevents double-booking
- 📱 Mobile-friendly

### Admin Side
- 📊 Dashboard with statistics
- ✅ Confirm bookings
- ❌ Cancel bookings
- 🔍 Filter by date/status
- 💵 Revenue tracking
- 📞 Customer contact info

## 🚀 Ready to Launch?

1. ✅ Backend deployed
2. ✅ Frontend updated with backend URL
3. ✅ Payment info updated
4. ✅ Tested entire booking flow
5. ✅ Embedded in Wix
6. ✅ Mobile tested

**You're ready to take bookings!** 🎉

---

## 📞 Support Resources

- Node.js help: https://nodejs.org/en/docs/
- Heroku docs: https://devcenter.heroku.com/
- Wix support: https://support.wix.com/
- General questions: Review README.md

---

**Estimated setup time**: 
- Local testing: 5 minutes
- Backend deployment: 15 minutes
- Wix embedding: 10 minutes
- **Total: ~30 minutes to live!**

Good luck! 🍀
