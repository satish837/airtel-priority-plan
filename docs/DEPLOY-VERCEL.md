# Deploy to Vercel

This project is a **static game + serverless API** on one Vercel deployment. The frontend calls same-origin `/api/*` routes; no separate API host is required.

## 1. MongoDB Atlas (required)

Vercel cannot use local Docker MongoDB. Use a free **MongoDB Atlas** cluster:

1. Sign in at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free **M0** cluster
3. **Database Access** → create a database user (save username + password)
4. **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (`0.0.0.0/0`)  
   Vercel serverless functions use changing IPs, so this is required for production.
5. **Database** → **Connect** → **Drivers** → copy the connection string
6. Replace `<password>` with your database user password (URL-encode special characters)

Example:

```
mongodb+srv://myuser:myP%40ss@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

Test locally before deploying:

```bash
# Edit server/.env with your Atlas URI, then:
npm run mongodb:test
```

## 2. Push code to GitHub

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

## 3. Import project in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `satish837/airtel-priority-plan` (or your fork)
3. Framework preset: **Other** (no build command needed)
4. Root directory: `.` (repo root)

## 4. Environment variables

In **Vercel → Project → Settings → Environment Variables**, add:

| Variable | Value | Required |
|----------|--------|----------|
| `MONGODB_URI` | Your Atlas connection string | Yes |
| `MONGODB_DB_NAME` | `airtel_challenge` | Optional |
| `AIRTEL_DAY_TIMEZONE` | `Asia/Kolkata` | Optional |
| `ADMIN_KEY` | Long random string for admin dashboard | Recommended |
| `PHONE_WHITELIST` | `off` | Recommended (whitelist removed) |

Apply to **Production**, **Preview**, and **Development**.

## 5. Deploy

Click **Deploy**. Vercel will:

- Serve static files (`index.html`, `game/`, `css/`, etc.)
- Run serverless functions in `/api` for leads, scores, leaderboard, dashboard

## 6. Verify after deploy

Replace `YOUR_APP` with your Vercel URL:

```bash
curl https://YOUR_APP.vercel.app/api/health
curl "https://YOUR_APP.vercel.app/api/leaderboard"
```

Open in browser:

- Game: `https://YOUR_APP.vercel.app/index.html`
- Leaderboard: in-game **View Leaderboard**
- Admin dashboard: `https://YOUR_APP.vercel.app/dashboard.html` (sign in with `ADMIN_KEY`)

## 7. Custom domain (optional)

1. Vercel → **Settings → Domains** → add your domain
2. No code changes needed — `js/api-config.js` uses same-origin `/api` on Vercel custom domains

## Local vs production

| | Local (`localhost:8080`) | Vercel |
|--|--------------------------|--------|
| Frontend | `npm run serve` | Automatic |
| API | `npm run api` or `?api=1` proxy | `/api/*` serverless |
| Database | Atlas URI in `server/.env` | `MONGODB_URI` env var |
| Default mode | localStorage (no `?api=1`) | MongoDB API |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `querySrv ENOTFOUND` | Invalid `MONGODB_URI` — check Atlas connection string |
| `MongoServerError: bad auth` | Wrong password; URL-encode special chars in URI |
| `Could not verify play limit` | `MONGODB_URI` missing on Vercel; redeploy after adding env vars |
| API returns 500 | Check **Vercel → Deployments → Functions** logs |
| Atlas connection timeout | Add `0.0.0.0/0` in Atlas Network Access |
