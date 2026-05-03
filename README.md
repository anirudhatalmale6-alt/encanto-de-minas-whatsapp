# Encanto de Minas - WhatsApp Chatbot

WhatsApp Business API chatbot for **Encanto de Minas** trade event lead capture. Visitors scan a QR code at the booth, register via WhatsApp, receive a pickup code for tasting, and are then guided through a distributor interest survey.

## Setup

### 1. Prerequisites
- Node.js 18+
- WhatsApp Business API account (Meta Business Suite)
- Google Cloud service account with Sheets API enabled
- Google Sheet created with a tab named "Leads"

### 2. Install

```bash
npm install
```

### 3. Configure

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

**Required:**
- `WHATSAPP_TOKEN` - Meta API bearer token
- `WHATSAPP_PHONE_ID` - WhatsApp Business phone number ID
- `WHATSAPP_VERIFY_TOKEN` - Custom string for webhook verification
- `WHATSAPP_PHONE_NUMBER` - Full phone number with country code (no +)
- `GOOGLE_SHEETS_ID` - Spreadsheet ID from the Google Sheet URL
- `GOOGLE_SERVICE_ACCOUNT_KEY` - Path to service account JSON
- `BASE_URL` - Public URL where the bot is hosted

### 4. Google Sheets Setup

1. Create a Google Cloud project
2. Enable Google Sheets API
3. Create a service account and download the JSON key
4. Share the Google Sheet with the service account email (Editor access)
5. Place the JSON key file and set `GOOGLE_SERVICE_ACCOUNT_KEY` path in `.env`

### 5. WhatsApp Webhook Setup

1. In Meta Business Suite > WhatsApp > Configuration
2. Set webhook URL to: `{BASE_URL}/webhook`
3. Set verify token to match `WHATSAPP_VERIFY_TOKEN`
4. Subscribe to `messages` field

### 6. Run

```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | Landing page with QR code |
| `GET /admin` | Admin dashboard |
| `GET /webhook` | WhatsApp webhook verification |
| `POST /webhook` | WhatsApp incoming messages |
| `GET /qrcode` | QR code PNG image |
| `GET /qrcode?format=svg` | QR code SVG |
| `GET /qrcode/data` | QR code as data URL JSON |
| `GET /api/stats` | Bot statistics JSON |
| `GET /api/leads` | All leads JSON |
| `GET /api/leads/csv` | Export leads as CSV |
| `GET /api/codes` | All pickup codes JSON |

## Conversation Flow

1. **Registration** - Name, City, Phone → Pickup Code
2. **Follow-up** (after configurable delay) - Tasting feedback → Distributor interest
3. **Distributor path** - CEP, Sales experience, Timeline, Dedication, Investment → Presentation images
4. **Survey path** - Product rating, Reason not interested → Catalog + thank you

Users can type `reiniciar` at any time to restart the conversation.

## Project Structure

```
src/
  index.js       - Express server, routes, webhook handler
  flow.js        - Conversation state machine
  whatsapp.js    - WhatsApp Cloud API wrapper
  sheets.js      - Google Sheets integration
  codes.js       - Pickup code generation
  scheduler.js   - Follow-up message scheduling
  database.js    - SQLite database (sessions, codes, scheduled)
public/
  index.html     - Landing page with QR code
  admin.html     - Admin dashboard
data/
  bot.db         - SQLite database (auto-created)
```
