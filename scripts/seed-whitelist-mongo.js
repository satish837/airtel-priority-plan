#!/usr/bin/env node
"use strict";

/**
 * One-time import: data/phone-whitelist-map.json → MongoDB phone_whitelist collection.
 *
 * Usage (from repo root):
 *   cd server && cp .env.example .env   # set MONGODB_URI
 *   node ../scripts/seed-whitelist-mongo.js
 */

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../server/.env") });

const whitelistDb = require("../server/lib/whitelistDb");
const whitelist = require("../server/lib/whitelist");

var MAP_PATH =
  process.env.PHONE_WHITELIST_MAP_PATH ||
  path.join(__dirname, "../data/phone-whitelist-map.json");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Configure server/.env first.");
    process.exit(1);
  }
  if (!fs.existsSync(MAP_PATH)) {
    console.error("Map file not found:", MAP_PATH);
    console.error("Run: python3 scripts/import-whitelist.py <your.xlsb>");
    process.exit(1);
  }
  console.log("Reading", MAP_PATH, "…");
  var rawMap = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
  var keys = Object.keys(rawMap || {});
  console.log("Upserting", keys.length, "rows into MongoDB…");
  var result = await whitelistDb.bulkUpsertFromMap(rawMap);
  await whitelist.refreshWhitelistCache();
  var count = await whitelistDb.countActive();
  console.log("Done. bulk ops:", result.upserted, "| active in DB:", count);
  console.log("Cache source:", whitelist.getCacheSource(), "| cache size:", whitelist.whitelistSize());
  process.exit(0);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
