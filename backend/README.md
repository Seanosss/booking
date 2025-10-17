# Booking System Backend API

Backend API for rental booking system with availability checking and booking management.

## 🚀 One-Click Deploy to Heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

**If you uploaded this to GitHub**, just click the button above and it will:
1. Create a Heroku account (if needed)
2. Deploy this backend automatically
3. Give you a live URL in 2 minutes!

---

## 📋 Manual Deployment

If the button doesn't work, follow these steps:

### Prerequisites
- Node.js installed
- Heroku CLI installed

### Local Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Server runs on http://localhost:3000
```

### Deploy to Heroku

```bash
# Login to Heroku
heroku login

# Create new app
heroku create your-app-name

# Deploy
git push heroku main

# Open your app
heroku open
```

---

## 🔧 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bookings` | Get all bookings |
| GET | `/api/available-slots?date=YYYY-MM-DD` | Check availability for date |
| POST | `/api/bookings` | Create new booking |
| PATCH | `/api/bookings/:id` | Update booking status |
| DELETE | `/api/bookings/:id` | Delete booking |

---

## 📝 Booking Object

```json
{
  "id": "1697123456789",
  "customerName": "John Doe",
  "email": "john@example.com",
  "phone": "+852 1234 5678",
  "date": "2025-10-20",
  "slots": ["14:00", "14:30", "15:00"],
  "duration": 60,
  "totalPrice": 280,
  "status": "pending"
}
```

---

## 🎯 Configuration

The backend uses these environment variables:

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (production/development)

---

## 🔐 CORS

CORS is enabled for all origins by default. For production, update:

```javascript
app.use(cors({
    origin: 'https://your-wix-site.com'
}));
```

---

## 💾 Data Storage

Bookings are stored in `bookings.json` file. For production, consider upgrading to:
- PostgreSQL
- MongoDB
- MySQL

---

## 📊 Status Flow

```
pending → confirmed (slots blocked)
   ↓
cancelled (slots released)
```

---

## 🛡️ Important Notes

- **Pending bookings DO NOT block slots**
- Only **confirmed bookings** block time slots
- This prevents slots being held without payment

---

## 🚀 After Deployment

1. Copy your Heroku URL (e.g., `https://your-app.herokuapp.com`)
2. Update frontend API URL:
   ```javascript
   const API_BASE_URL = 'https://your-app.herokuapp.com/api';
   ```
3. Test: Visit `https://your-app.herokuapp.com/api/bookings`
4. Should see: `{"bookings":[]}`

---

## 📞 Support

For issues or questions, refer to:
- `HEROKU_DEPLOY_GUIDE.md` - Detailed deployment steps
- `TROUBLESHOOTING.md` - Common issues
- `README.md` - Full documentation

---

**Built with Express.js + Node.js**
