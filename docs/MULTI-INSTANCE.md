# Host multiple links with separate user data

You can run the **same app** on different URLs while keeping each campaign’s players, scores, and leaderboards in a **separate MongoDB database** (MongoDB’s equivalent of a “folder”).

Each database has its own collections: `leads`, `daily_plays`, `scores`, `phone_whitelist`.

## Option A — Separate Vercel projects (simplest)

Use one GitHub repo and import it **multiple times** in Vercel. Each project gets its own URL and env vars.

| Vercel project | URL | `MONGODB_DB_NAME` |
|----------------|-----|-------------------|
| airtel-mumbai | `mumbai.example.com` | `airtel_mumbai` |
| airtel-delhi | `delhi.example.com` | `airtel_delhi` |

Steps:

1. [vercel.com/new](https://vercel.com/new) → import the same repo again.
2. Set a unique `MONGODB_DB_NAME` per project (same `MONGODB_URI` is fine).
3. Add a custom domain under **Settings → Domains**.
4. Deploy.

No `AIRTEL_INSTANCE_MAP` needed. Verify:

```bash
curl https://mumbai.example.com/api/health
# { "ok": true, "dbName": "airtel_mumbai", ... }
```

## Option B — One Vercel project, multiple domains

Point several custom domains at **one** Vercel project and route each hostname to its own database with `AIRTEL_INSTANCE_MAP`.

**Vercel → Settings → Environment Variables:**

```
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=airtel_default
AIRTEL_INSTANCE_MAP=campaign1.example.com=airtel_campaign1,campaign2.example.com=airtel_campaign2
```

Or JSON:

```json
{"campaign1.example.com":"airtel_campaign1","campaign2.example.com":"airtel_campaign2"}
```

**Add domains** (Settings → Domains):

- `campaign1.example.com`
- `campaign2.example.com`

Redeploy, then verify each link uses its own database:

```bash
curl https://campaign1.example.com/api/health
# { "dbName": "airtel_campaign1", "host": "campaign1.example.com" }

curl https://campaign2.example.com/api/health
# { "dbName": "airtel_campaign2", "host": "campaign2.example.com" }
```

`www.` is normalized automatically (`www.campaign1.example.com` matches `campaign1.example.com`).

## Option C — Local testing

In `server/.env`:

```env
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=airtel_default
AIRTEL_INSTANCE_MAP=localhost=airtel_local_a,127.0.0.1=airtel_local_b
```

Run `npm run api`, then call the API with different `Host` headers:

```bash
curl -H "Host: localhost" http://127.0.0.1:3001/api/health
curl -H "Host: 127.0.0.1" http://127.0.0.1:3001/api/health
```

## Admin dashboard per instance

Open `dashboard.html` on the **same domain** as the campaign (e.g. `https://campaign1.example.com/dashboard.html`). The dashboard reads from that hostname’s database automatically.

Use the same `ADMIN_KEY` for all instances, or set different keys per Vercel project (Option A only).

## MongoDB Atlas

You do **not** need to create databases manually. MongoDB creates a database on first write. All instances can share one Atlas cluster (`MONGODB_URI`); only the database **name** changes.

In Atlas → **Browse Collections**, you will see separate databases:

- `airtel_campaign1` → leads, scores, …
- `airtel_campaign2` → leads, scores, …

## Which option to choose?

| Goal | Recommendation |
|------|----------------|
| Fully isolated deploys, different admin keys | **Option A** — separate Vercel projects |
| One deploy, many custom domains | **Option B** — `AIRTEL_INSTANCE_MAP` |
| Quick single campaign | Default `MONGODB_DB_NAME` only |
