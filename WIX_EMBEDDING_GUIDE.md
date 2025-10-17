# 🎯 How to Embed Booking System in Wix - Step by Step Guide

## 📋 Prerequisites
Before starting, make sure you have:
- [ ] Deployed your backend server (see main README.md)
- [ ] Updated the API URL in frontend/index.html
- [ ] Tested the booking system works locally
- [ ] A Wix website with editor access

---

## 🚀 Method 1: Embed Code (Easiest Method)

### Step 1: Prepare Your Code

1. **Open** `frontend/index.html` in a text editor

2. **Find this line** (around line 442):
   ```javascript
   const API_BASE_URL = 'http://localhost:3000/api';
   ```

3. **Replace with your deployed backend URL**:
   ```javascript
   const API_BASE_URL = 'https://your-backend-url.herokuapp.com/api';
   ```
   *Note: Use your actual backend URL from Heroku, Railway, or your server*

4. **Save the file**

### Step 2: Copy the Code

1. Open `frontend/index.html`
2. Select ALL content (Ctrl+A or Cmd+A)
3. Copy (Ctrl+C or Cmd+C)

### Step 3: Add to Wix

1. **Login to Wix** and open your website editor

2. **Click the "Add" (+) button** on the left panel

3. **Navigate to**: Embed → Embed Code

4. **Choose**: "Custom embeds" → "Embed HTML"

5. **In the popup**:
   - Click "Add Code"
   - Choose "Code" tab
   - Paste your copied HTML code
   - Give it a name (e.g., "Booking System")
   - Click "Apply"

6. **Position the element**:
   - Drag to resize (recommended: full width, 900px height)
   - Position on your page

7. **Click "Preview"** to test

8. **If it works → Click "Publish"**

---

## 🎨 Method 2: Using Custom Element (More Control)

### Step 1: Enable Dev Mode

1. In Wix Editor, click **Tools** → **Developer Tools**
2. Enable **Velo by Wix** (if not already enabled)
3. Accept the terms

### Step 2: Add Custom Element

1. Click **Add** (+) → **Embed** → **Custom Element**
2. Set element properties:
   - Tag name: `booking-widget`
   - Width: 100%
   - Height: 900px

### Step 3: Add Code to Page

1. At the bottom of editor, you'll see **Code** panel
2. Click the page you're working on (e.g., `Page Code` for Home)
3. Add this code:

```javascript
import { fetch } from 'wix-fetch';

$w.onReady(function () {
    const customElement = $w('#customElement1');
    
    // Set the HTML content
    customElement.html = `
        <!-- Paste your entire frontend/index.html content here -->
    `;
});
```

4. Replace `#customElement1` with your element ID

### Step 4: Test and Publish

1. Click **Preview** to test
2. Test booking functionality
3. If working correctly → **Publish**

---

## 🌐 Method 3: External Page (iframe)

This method hosts the booking page separately and embeds it via iframe.

### Step 1: Deploy Frontend

1. **Deploy frontend to Netlify**:
   - Go to [Netlify Drop](https://app.netlify.com/drop)
   - Drag and drop your `frontend` folder
   - Get your URL (e.g., `https://my-booking.netlify.app`)

2. **Or deploy to Vercel**:
   - Go to [Vercel](https://vercel.com)
   - Import your project
   - Get deployment URL

### Step 2: Embed in Wix

1. In Wix Editor, click **Add** (+)
2. Go to **Embed** → **HTML iframe**
3. Paste your deployment URL:
   ```
   https://my-booking.netlify.app
   ```
4. Set dimensions:
   - Width: 100%
   - Height: 900px (or auto)
5. Click **Update**

### Step 3: Style the iframe

1. Select the iframe element
2. In settings, you can:
   - Remove border
   - Add shadow
   - Adjust spacing
3. Position on page

---

## 🎨 Styling Tips for Wix

### Match Your Wix Theme

1. **Open** `frontend/index.html`

2. **Find the CSS section** (starts at line 10 with `<style>`)

3. **Modify colors to match your site**:

```css
/* Example: Change primary colors */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
/* Change to your brand colors ↑ */

/* Change button colors */
.btn-primary {
    background: linear-gradient(135deg, #YOUR-COLOR-1 0%, #YOUR-COLOR-2 100%);
}
```

### Adjust Size for Mobile

```css
@media (max-width: 768px) {
    .booking-section {
        padding: 15px; /* Less padding on mobile */
    }
}
```

---

## ✅ Testing Checklist

After embedding, test these on your Wix site:

- [ ] Page loads without errors
- [ ] Calendar displays correctly
- [ ] Can select date
- [ ] Time slots appear
- [ ] Can select multiple slots
- [ ] Pricing calculates correctly
- [ ] Sunday fee applies correctly
- [ ] Form validates properly
- [ ] Can submit booking
- [ ] Payment modal appears
- [ ] WhatsApp link works
- [ ] Email link works
- [ ] Works on mobile
- [ ] Works on tablet
- [ ] Works on desktop

---

## 🔧 Troubleshooting

### Issue: "Failed to load slots"

**Cause**: Backend URL is wrong or server is down

**Solution**:
1. Check your backend is running
2. Open browser console (F12)
3. Look for errors
4. Verify API URL is correct in code

### Issue: Iframe shows blank page

**Cause**: CORS issue or wrong URL

**Solution**:
1. Make sure backend has CORS enabled:
```javascript
// In backend/server.js
app.use(cors({
    origin: '*' // or your Wix site URL
}));
```
2. Verify the frontend URL is correct

### Issue: Looks broken on mobile

**Cause**: CSS not responsive

**Solution**:
1. The code includes mobile styles
2. Make sure you didn't accidentally remove the `@media` queries
3. In Wix, test using the mobile preview

### Issue: WhatsApp/Email links don't work

**Cause**: Links not properly formatted

**Solution**:
1. Check WhatsApp number format: `85298725268` (no + or spaces)
2. Check email is valid
3. Test links outside of Wix first

---

## 🎨 Customization Ideas

### Change Header Image
Add a background image to the header:

```css
.header {
    background: linear-gradient(rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8)), 
                url('YOUR-IMAGE-URL');
    background-size: cover;
}
```

### Add Your Logo
In the header section (around line 450):

```html
<div class="header">
    <img src="YOUR-LOGO-URL" alt="Logo" style="height: 50px; margin-bottom: 15px;">
    <h1>🎯 Rental Booking System</h1>
</div>
```

### Change Fonts
In the CSS section:

```css
body {
    font-family: 'Your-Font-Name', 'Segoe UI', sans-serif;
}
```

### Add Terms & Conditions
Before the booking form:

```html
<div class="alert alert-warning">
    <strong>Terms:</strong> By booking, you agree to our 
    <a href="/terms">terms and conditions</a>.
</div>
```

---

## 📱 Mobile Optimization

The booking system is already mobile-responsive, but you can enhance it:

### 1. Test on Wix Mobile Editor
- Switch to mobile view in Wix editor
- Adjust iframe height if needed
- Test all interactions

### 2. Improve Touch Targets
Time slots are already optimized for touch, but you can make them larger:

```css
.time-slot {
    padding: 15px 10px; /* Increase for bigger touch area */
}
```

### 3. Simplify for Mobile
Consider hiding some elements on mobile:

```css
@media (max-width: 768px) {
    .pricing-info h3 {
        font-size: 1em; /* Smaller headings */
    }
}
```

---

## 🚀 Going Live Checklist

Before making your booking system live:

- [ ] Backend is deployed and running
- [ ] Frontend has correct backend URL
- [ ] All payment info is updated
- [ ] WhatsApp number is correct
- [ ] Email is correct
- [ ] Test booking flow completely
- [ ] Admin panel is accessible
- [ ] Mobile version works
- [ ] All links work
- [ ] Pricing is correct
- [ ] Sunday fee calculates correctly
- [ ] Terms and conditions added (optional)
- [ ] Privacy policy added (optional)

---

## 📊 Analytics (Optional)

### Add Google Analytics

In `frontend/index.html`, add before `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=YOUR-GA-ID"></script>
<script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'YOUR-GA-ID');
</script>
```

### Track Bookings
Add this after successful booking:

```javascript
// Track booking in analytics
if (typeof gtag !== 'undefined') {
    gtag('event', 'booking_completed', {
        'value': totalPrice,
        'currency': 'HKD'
    });
}
```

---

## 🎯 Need Help?

If you're stuck:

1. **Check browser console** (F12) for errors
2. **Verify backend is running** and accessible
3. **Test outside Wix first** (open index.html directly)
4. **Check Wix forums** for embed-specific issues
5. **Review the main README.md** for backend setup

---

## 📝 Summary

**Easiest Method**: Method 1 (Embed Code)
- Copy/paste HTML
- Works immediately
- No coding needed

**Most Flexible**: Method 2 (Custom Element)
- Full control
- Can integrate with Wix data
- Requires Velo knowledge

**Best for Complex Sites**: Method 3 (External Page)
- Separate hosting
- Easy to update
- Better performance

Choose the method that fits your skill level and needs!

---

**Good luck with your booking system! 🎉**
