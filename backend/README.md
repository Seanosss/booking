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
# Copy environment template and update values
cp .env.example .env

# Install dependencies
npm install

# Create database schema
npm run db:migrate

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
- `DATABASE_URL` - PostgreSQL connection string (required)
- `DB_POOL_SIZE` - Optional connection pool size (default: 10)
- `DB_SSL` - Enable SSL for database connections (`true`/`false`)
- `DB_SSL_REJECT_UNAUTHORIZED` - When SSL is enabled, set to `false` to allow self-signed certificates
- `NODE_ENV` - Environment (production/development)
- `ADMIN_PASSWORD` - Shared admin password used for the dashboard (default: `1234`)
- `ADMIN_AUTH_DISABLED` - Set to `true` to bypass admin authentication (defaults to `false` for security)

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

Bookings and settings are stored in PostgreSQL. Run `npm run db:migrate` after configuring `DATABASE_URL` to create the necessary tables. The server automatically seeds default settings (including the shared admin password) if no settings row exists. You can change the admin password from the dashboard settings tab.

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
