#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/server/.env"
LOCAL_URI="mongodb://127.0.0.1:27017"

echo "==> Airtel Challenge — MongoDB setup"
echo

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed."
  echo "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  echo "Or use MongoDB Atlas and set MONGODB_URI in server/.env"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running."
  echo "Start Docker Desktop, then run this script again."
  exit 1
fi

echo "==> Starting MongoDB container (mongo:7 on port 27017)..."
cd "$ROOT"
docker compose up -d mongo

echo "==> Waiting for MongoDB to accept connections..."
for i in $(seq 1 30); do
  if docker compose exec -T mongo mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q 1; then
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "MongoDB did not become ready in time."
    exit 1
  fi
done

if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/server/.env.example" "$ENV_FILE"
fi

python3 - "$ENV_FILE" "$LOCAL_URI" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
uri = sys.argv[2]
text = path.read_text() if path.exists() else ""
if re.search(r"^MONGODB_URI=", text, flags=re.M):
    text = re.sub(r"^MONGODB_URI=.*$", f"MONGODB_URI={uri}", text, flags=re.M)
else:
    text = f"MONGODB_URI={uri}\n" + text
if "PHONE_WHITELIST=off" not in text:
    text = text.rstrip() + "\nPHONE_WHITELIST=off\n"
path.write_text(text)
PY

echo
echo "==> Wrote server/.env:"
echo "    MONGODB_URI=$LOCAL_URI"
echo "    PHONE_WHITELIST=off"
echo
echo "==> Testing connection..."
cd "$ROOT/server" && node ../scripts/test-mongodb.js

echo
echo "Done. Next steps:"
echo "  1. npm run api          # start API (port 3001)"
echo "  2. npm run serve        # start frontend (port 8080)"
echo "  3. Open http://localhost:8080/index.html?api=1"
