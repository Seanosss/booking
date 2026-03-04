# 🔧 Troubleshooting Guide

## Problem: "Failed to load slots"

This error means the frontend cannot connect to the backend server.

### Solution Steps:

#### Step 1: Check if Backend is Running

**Windows:**
1. Open Command Prompt (Win + R, type `cmd`)
2. Navigate to backend folder:
   ```
   cd C:\path\to\booking-system\backend
   ```
3. Start the server:
   ```
   npm start
   ```

**Mac/Linux:**
1. Open Terminal
2. Navigate to backend folder:
   ```bash
   cd /path/to/booking-system/backend
   ```
3. Start the server:
   ```bash
   npm start
   ```

You should see:
```
Booking system backend running on http://localhost:3000
```

**KEEP THIS WINDOW OPEN!** The server must stay running.

#### Step 2: Test Backend Directly

Open your browser and go to:
```
http://localhost:3000/api/bookings
```

**Expected result:** You should see `{"bookings":[]}`

**If you see this:** Backend is working! ✅

**If you see an error:** Backend is not running ❌

#### Step 3: Check API URL in Frontend

Open `frontend/index.html` in a text editor and find (around line 442):

```javascript
const API_BASE_URL = 'http://localhost:3000/api';
```

Make sure it says `localhost:3000` if testing locally.

#### Step 4: Refresh the Page

After starting the backend:
1. Go back to `frontend/index.html` in your browser
2. Press F5 to refresh
3. Select a date
4. Time slots should now appear!

---

## Problem: Port Already in Use

**Error message:** `EADDRINUSE: address already in use :::3000`

**Solution:**

**Option A: Stop the Other Process**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID [PID_NUMBER] /F

# Mac/Linux
lsof -i :3000
kill -9 [PID_NUMBER]
```

**Option B: Use Different Port**

In `backend/server.js`, change line 5:
```javascript
const PORT = 3001; // Change from 3000 to 3001
```

Then in `frontend/index.html`, change line 442:
```javascript
const API_BASE_URL = 'http://localhost:3001/api';
```

---

## Problem: npm is not recognized

**Error:** `'npm' is not recognized as an internal or external command`

**Solution:** Install Node.js

1. Go to https://nodejs.org/
2. Download LTS version
3. Install with default settings
4. Restart your computer
5. Try again

---

## Problem: Slots show as available but shouldn't be

**This is now EXPECTED behavior!**

With the new manual confirmation system:
- **Pending bookings** = Slots still available (⚠️ NOT blocked)
- **Confirmed bookings** = Slots blocked (✅ Blocked)

**Why?** So customers can't book until you verify payment and manually confirm.

**To block slots:**
1. Check WhatsApp/email for payment
2. Go to admin panel
3. Click "Confirm" button
4. NOW the slots are blocked ✅

---

## Problem: Cannot access admin panel

**Solution:** Open the file directly

**Windows:**
```
C:\path\to\booking-system\admin\index.html
```

**Mac/Linux:**
```
/path/to/booking-system/admin/index.html
```

Just double-click the file or drag it to your browser.

---

## Problem: Bookings not showing in admin

**Check these:**

1. **Backend running?** 
   - Check terminal/command prompt
   - Should say "running on http://localhost:3000"

2. **API URL correct?**
   - In `admin/index.html`, line ~180:
   ```javascript
   const API_BASE_URL = 'http://localhost:3000/api';
   ```

3. **Browser console errors?**
   - Press F12 in browser
   - Check Console tab for red errors
   - Share the error message for help

---

## Problem: "Cannot find module 'express'"

**Solution:** Install dependencies

```bash
cd backend
npm install
```

Wait for installation to complete, then try `npm start` again.

---

## Problem: WhatsApp link not working

**Check these:**

In `frontend/index.html`, around line 444:

```javascript
const WHATSAPP_NUMBER = '85298725268'; // Should be: countrycode + number (no + or spaces)
```

**Correct format:**
- ✅ `85298725268` (Hong Kong)
- ✅ `14155551234` (US)
- ❌ `+852 9872 5268` (NO!)
- ❌ `9872 5268` (NO!)

---

## Testing Checklist

Before going live, verify:

- [ ] Backend server starts without errors
- [ ] Can access http://localhost:3000/api/bookings
- [ ] Frontend loads without errors
- [ ] Can select a date
- [ ] Time slots appear
- [ ] Can select time slots
- [ ] Pricing calculates correctly
- [ ] Can submit booking form
- [ ] Payment modal appears
- [ ] WhatsApp link opens (test on mobile)
- [ ] Email link works
- [ ] Admin panel loads
- [ ] Admin panel shows new booking
- [ ] Can confirm booking in admin
- [ ] After confirmation, slots are blocked
- [ ] Pending bookings don't block slots ✅

---

## Quick Debug Commands

**Check if Node.js is installed:**
```bash
node --version
npm --version
```

**Check if backend is running:**
```bash
# Should show node process
# Windows:
tasklist | findstr node

# Mac/Linux:
ps aux | grep node
```

**Check what's using port 3000:**
```bash
# Windows:
netstat -ano | findstr :3000

# Mac/Linux:
lsof -i :3000
```

**View backend logs:**
Just look at the terminal where you ran `npm start`

---

## Common Mistakes

❌ **Closing the terminal** → Backend stops working
✅ **Keep terminal open** while testing

❌ **Wrong API URL** in frontend
✅ **Check line 442** in frontend/index.html

❌ **Not running `npm install`** first
✅ **Always run `npm install`** before first `npm start`

❌ **Expecting pending bookings to block slots**
✅ **Only confirmed bookings block slots** (this is by design now!)

---

## Still Stuck?

1. **Check all steps above** ☑️
2. **Open browser console** (F12) and look for errors
3. **Check terminal** for backend error messages
4. **Verify Node.js is installed:** `node --version`
5. **Make sure backend is running:** Check terminal window

---

## Your New Booking Flow

1. ✅ Customer submits booking → Status: **PENDING** (slots NOT blocked)
2. ✅ Customer sees: "Send payment via WhatsApp/Email"
3. ✅ Customer sends payment proof
4. ✅ You check WhatsApp/Email for payment
5. ✅ You verify payment received
6. ✅ You go to admin panel
7. ✅ You click **"Confirm"** button
8. ✅ Status changes to: **CONFIRMED** (slots NOW blocked) ✅
9. ✅ Other customers can't book those slots anymore

**This is safer!** Slots only block after you verify payment.

---

## Need More Help?

- Review **QUICK_START.md**
- Check **README.md** for detailed info
- Make sure you've followed all steps in order

**Most common issue:** Backend not running! Always check that first.
