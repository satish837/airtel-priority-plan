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

Only numbers in `data/phone-whitelist.json` can register and play. The list is imported from your Excel file (`MSISDN` column). **OLM ID** from the sheet is stored in `data/phone-whitelist-map.json`. Users type the OLM ID themselves; it must **match** the value on file for that phone (case-insensitive), or registration and score submission are rejected.

```bash
pip3 install pyxlsb
python3 scripts/import-whitelist.py "/Users/administrator/Downloads/Whitelist Data.xlsb"
```

Restart the API after updating the file. Check:

```bash
curl http://localhost:3001/api/health
# phoneWhitelistActive: true, phoneWhitelistCount: 18729
```

To **disable** the whitelist (allow all numbers): set `PHONE_WHITELIST=off` in `server/.env`.

Non-listed numbers see: *"This mobile number is not eligible to play."*

**Deploy:** commit `data/phone-whitelist.json` to git. Vercel bundles it via `vercel.json` `includeFiles`. After deploy, check:

```bash
curl https://YOUR_APP.vercel.app/api/health
# phoneWhitelistActive: true, phoneWhitelistCount: 18729
```

If `phoneWhitelistActive` is `false` on production, nobody should be able to play (fail-closed). Redeploy with the JSON file included.

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
