# MongoDB Atlas setup

Lead form data, daily play limits, and scores are stored in **MongoDB Atlas** when the API is enabled.

## 1. Create a cluster

1. Sign in at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free **M0** cluster.
3. **Database Access** → add a database user (username + password).
4. **Network Access** → add your IP (or `0.0.0.0/0` for development only).
5. **Database** → **Connect** → **Drivers** → copy the connection string.

Replace `<password>` with your user password and set the database name if needed.

## 2. Local development

```bash
# Install API dependencies
cd server && cp .env.example .env
# Edit server/.env and set MONGODB_URI=...

npm install
npm start
# API runs at http://localhost:3001
```

In another terminal, serve the game:

```bash
python3 serve.py
# Open http://localhost:8080/index.html
```

`game/airtel-config.js` points localhost at `http://localhost:3001` automatically.

To use **localStorage only** (no MongoDB), set in the browser console before play:

```js
window.AIRTEL_API_BASE = "local";
location.reload();
```

## 3. Vercel production

1. Deploy this repo to Vercel.
2. **Project Settings → Environment Variables**:
   - `MONGODB_URI` = your Atlas connection string
   - `MONGODB_DB_NAME` = `airtel_challenge` (optional)
   - `AIRTEL_DAY_TIMEZONE` = `Asia/Kolkata` (optional; default matches India “today” for plays/scores)
   - `ADMIN_KEY` = random string for `/api/dashboard`
3. Redeploy. The app calls same-origin paths like `/api/leads/status` (do not set `AIRTEL_API_BASE` to `/api` on Vercel — that double-prefixes URLs).

## Phone whitelist

Eligible numbers are checked before play. Each row has **phone**, **OLM ID**, optional **name** and **circle**. Users must enter the correct OLM ID for their number (case-insensitive).

### MongoDB (recommended)

Store whitelist rows in the `phone_whitelist` collection. The API loads them into memory on startup (`PHONE_WHITELIST_SOURCE=auto` or `mongodb`).

**One-time seed from Excel export:**

```bash
pip3 install pyxlsb
python3 scripts/import-whitelist.py "/path/to/Whitelist Data.xlsb"
cd server && node ../scripts/seed-whitelist-mongo.js
```

**Admin UI:** open `http://localhost:8080/whitelist-admin.html` (same `ADMIN_KEY` as the player dashboard). Add/update/remove entries; changes apply immediately after save.

**Admin API** (header `x-admin-key: YOUR_ADMIN_KEY`):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/whitelist/stats` | Cache + MongoDB counts |
| GET | `/api/admin/whitelist?q=&page=&limit=` | List entries |
| POST | `/api/admin/whitelist` | Upsert `{ phone, olmId, name?, circle? }` |
| DELETE | `/api/admin/whitelist?phone=` | Deactivate entry |
| POST | `/api/admin/whitelist/import-files` | Bulk import from `data/phone-whitelist-map.json` |
| POST | `/api/admin/whitelist/import` | Bulk `{ entries: [...] }` or `{ map: { phone: row } }` |

Set `PHONE_WHITELIST_SOURCE=mongodb` to require MongoDB (no JSON fallback). Default `auto` uses MongoDB when the collection has rows, otherwise falls back to JSON files.

### JSON files (legacy / fallback)

`data/phone-whitelist-map.json` (phone → OLM ID, name, circle). Import from Excel with `scripts/import-whitelist.py`. Vercel can still bundle these via `vercel.json` `includeFiles` until MongoDB is seeded.

```bash
curl http://localhost:3001/api/health
# phoneWhitelistSource: "mongodb", phoneWhitelistMongoCount: 18729
```

To **disable** the whitelist (allow all numbers): set `PHONE_WHITELIST=off` in `server/.env`.

Non-listed numbers see: *"This mobile number is not eligible to play."*

## Collections

| Collection     | Purpose                                      |
|----------------|----------------------------------------------|
| `leads`        | Registration: name, phone, storeId, character |
| `daily_plays`  | Plays used per phone per day (max 99)         |
| `scores`       | Each run: coins, priority points, rank data  |

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/leads` | Upsert lead |
| GET | `/api/plays?phone=` | Remaining plays today |
| POST | `/api/plays` | Consume one play (`{ phone }`) |
| GET | `/api/leaderboard` | Top 50 today |
| GET | `/api/leaderboard?phone=` | User rank today |
| POST | `/api/scores` | Submit run score |
| GET | `/api/dashboard?day=` | Admin dashboard data (requires `ADMIN_KEY`) |
| GET | `/api/leads/status?phone=` | DB play flags: `canPlayToday`, `playsLeftToday`, `playLimitReached` |

### Play limit flags (per lead, synced from `daily_plays`)

Each lead document is updated with:

| Field | Meaning |
|-------|---------|
| `playsDay` | Date key `YYYY-MM-DD` |
| `playsUsedToday` | Runs started today (0–99) |
| `playsLeftToday` | Remaining plays |
| `canPlayToday` | `true` if user may start another run |
| `playLimitReached` | `true` after 99 plays used today |

If the dashboard shows **plays used** but **0 runs / no DB score**, the browser could not reach `/api/scores` (timeout, offline). Plays are still deducted in MongoDB. The app now **retries** score submission and **queues** failed payloads in `localStorage` (`airtel_pending_scores`) and flushes them on the next visit when the API is reachable.


## Admin dashboard

Open **http://localhost:8080/dashboard.html** (with `serve.py` + API running).

1. Set `ADMIN_KEY` in `server/.env` (optional for local dev).
2. Sign in with that key on the dashboard page.
3. View registered players, plays used, scores, and export CSV.

On Vercel, add `ADMIN_KEY` to environment variables and open `https://your-app.vercel.app/dashboard.html`.
