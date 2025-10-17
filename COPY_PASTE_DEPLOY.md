# 📋 Copy-Paste Commands for Heroku Deploy

Just copy and paste these commands one by one. **That's it!**

---

## ✅ Before You Start

1. Created Heroku account? ✅ (https://signup.heroku.com)
2. Installed Heroku CLI? ✅ (https://devcenter.heroku.com/articles/heroku-cli)
3. Have Terminal/Command Prompt open? ✅

**Let's go!** 🚀

---

## 📍 Step 1: Navigate to Backend Folder

**Mac/Linux:**
```bash
cd ~/Downloads/booking-system/backend
```

**Windows:**
```bash
cd %USERPROFILE%\Downloads\booking-system\backend
```

**Not in Downloads?** Change the path to wherever you extracted the files.

---

## 🔐 Step 2: Login to Heroku

Copy and paste:
```bash
heroku login
```

Press **Enter**, then click **"Log in"** in the browser window that opens.

---

## 🎯 Step 3: Create Your App

Copy and paste (change `my-booking-api` to your preferred name):
```bash
heroku create my-booking-api
```

**SAVE THE URL IT GIVES YOU!** 
Example: `https://my-booking-api.herokuapp.com`

**App name already taken?** Try:
```bash
heroku create my-booking-api-2024
```

Or let Heroku choose a random name:
```bash
heroku create
```

---

## 📦 Step 4: Initialize Git (if needed)

Copy and paste:
```bash
git init
```

If you see "Reinitialized existing Git repository" - that's fine! ✅

---

## ➕ Step 5: Add Files

Copy and paste:
```bash
git add .
```

---

## 💾 Step 6: Commit Files

Copy and paste:
```bash
git commit -m "Deploy booking system"
```

---

## 🚀 Step 7: Deploy to Heroku

Copy and paste:
```bash
git push heroku main
```

**If that gives an error**, try:
```bash
git branch -M main
git push heroku main
```

**Still getting errors?** Try:
```bash
git push heroku master
```

---

## ⏳ Wait for Deployment

You'll see lots of text scrolling. Wait for:

```
remote: -----> Build succeeded!
remote: -----> Launching...
remote:        https://your-app-name.herokuapp.com/ deployed to Heroku
```

**This means SUCCESS!** ✅

---

## ✅ Step 8: Test Your Backend

Copy and paste:
```bash
heroku open
```

This opens your app in browser.

Add `/api/bookings` to the URL to test:
```
https://your-app-name.herokuapp.com/api/bookings
```

**Should see:**
```json
{"bookings":[]}
```

**If you see that = IT WORKS!** 🎉

---

## 📝 Step 9: Copy Your URL

Your backend URL is:
```
https://YOUR-APP-NAME.herokuapp.com
```

**Write this down!** You need it for the frontend.

---

## 🎨 Step 10: Update Frontend

1. Open `frontend/index.html` in TextEdit (Mac) or Notepad (Windows)

2. Find line 442 (or press Cmd+F / Ctrl+F and search for `API_BASE_URL`)

3. Change from:
   ```javascript
   const API_BASE_URL = 'http://localhost:3000/api';
   ```

4. To (use YOUR app name):
   ```javascript
   const API_BASE_URL = 'https://YOUR-APP-NAME.herokuapp.com/api';
   ```

5. Save the file

---

## ✅ Step 11: Test Everything

1. Open `frontend/index.html` in your browser (double-click it)
2. Select today's date
3. You should see time slots! ✅
4. Try making a test booking ✅
5. Open `admin/index.html` - you should see the booking! ✅

**Everything working?** YOU'RE DONE! 🎉

---

## 🎯 Next: Embed in Wix

1. Open `frontend/index.html` in text editor
2. Select ALL (Cmd+A or Ctrl+A)
3. Copy (Cmd+C or Ctrl+C)
4. Go to Wix Editor
5. Click Add (+) → Embed → Embed HTML
6. Paste your code
7. Resize: Full width, 900px height
8. Preview → Test booking
9. Publish! 🚀

---

## 🆘 Troubleshooting

### Error: "git: command not found"

**Install git first:**
- Mac: `brew install git`
- Windows: https://git-scm.com/download/win

### Error: "heroku: command not found"

**Restart Terminal and try again**. If still not working, reinstall Heroku CLI.

### Error: "! No default language could be detected"

**Make sure you're in the backend folder!** Check with:
```bash
pwd
```

Should show: `.../booking-system/backend`

### Error: "App name is already taken"

**Choose a different name:**
```bash
heroku create my-booking-api-unique-name-123
```

### Application Error when visiting URL

**Check logs:**
```bash
heroku logs --tail
```

Look for errors. Press Ctrl+C to stop.

---

## 📊 Useful Commands

**View logs:**
```bash
heroku logs --tail
```

**Restart app:**
```bash
heroku restart
```

**Open in browser:**
```bash
heroku open
```

**Check status:**
```bash
heroku ps
```

---

## 🎉 Success Checklist

- [ ] Ran `heroku login` ✅
- [ ] Ran `heroku create` ✅
- [ ] Got URL (saved it) ✅
- [ ] Ran git commands ✅
- [ ] Deployed successfully ✅
- [ ] Tested `/api/bookings` - saw `{"bookings":[]}` ✅
- [ ] Updated frontend with Heroku URL ✅
- [ ] Tested frontend - time slots appear ✅
- [ ] Admin panel shows bookings ✅
- [ ] Ready for Wix! ✅

---

**Total time: 5-10 minutes**

**That's it! You now have a live backend running 24/7!** 🎉

Next stop: Wix! 🚀
