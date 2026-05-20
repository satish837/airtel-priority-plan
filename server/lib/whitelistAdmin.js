"use strict";

const fs = require("fs");
const path = require("path");
const whitelist = require("./whitelist");
const whitelistDb = require("./whitelistDb");

var MAP_CANDIDATES = [
  path.join(__dirname, "../../data/phone-whitelist-map.json"),
  path.join(__dirname, "../data/phone-whitelist-map.json"),
  path.join(process.cwd(), "data/phone-whitelist-map.json")
];

function findMapFile() {
  var filePath = process.env.PHONE_WHITELIST_MAP_PATH || null;
  if (filePath && fs.existsSync(filePath)) return filePath;
  for (var i = 0; i < MAP_CANDIDATES.length; i++) {
    if (fs.existsSync(MAP_CANDIDATES[i])) return MAP_CANDIDATES[i];
  }
  return null;
}

async function getWhitelistAdminStats() {
  var mongoCount = 0;
  try {
    mongoCount = await whitelistDb.countActive();
  } catch (e) {
    mongoCount = -1;
  }
  return {
    cacheSource: whitelist.getCacheSource(),
    configuredSource: whitelist.getConfiguredSource(),
    cacheCount: whitelist.whitelistSize(),
    mongoCount: mongoCount,
    filePath: whitelist.getWhitelistPath()
  };
}

async function listWhitelist(query) {
  return whitelistDb.listEntries({
    q: query.q,
    page: query.page,
    limit: query.limit
  });
}

async function upsertWhitelistEntry(body) {
  var doc = await whitelistDb.upsertEntry(body || {});
  await whitelist.refreshWhitelistCache();
  return doc;
}

async function removeWhitelistEntry(phone) {
  var result = await whitelistDb.deactivateEntry(phone);
  await whitelist.refreshWhitelistCache();
  return result;
}

async function importWhitelistFromJsonFiles() {
  var mapPath = findMapFile();
  if (!mapPath) {
    throw new Error(
      "phone-whitelist-map.json not found. Run import-whitelist.py first or upload via admin form."
    );
  }
  var rawMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  var result = await whitelistDb.bulkUpsertFromMap(rawMap);
  await whitelist.refreshWhitelistCache();
  return {
    sourceFile: mapPath,
    rows: result.upserted,
    cacheCount: whitelist.whitelistSize()
  };
}

async function importWhitelistFromBody(body) {
  if (!body || typeof body !== "object") {
    throw new Error("JSON body required: { entries: [...] } or { map: { phone: row } }");
  }
  if (Array.isArray(body.entries)) {
    var map = {};
    body.entries.forEach(function (row) {
      var phone = whitelistDb.normalizePhone(row.phone);
      if (phone.length !== 10) return;
      map[phone] = row;
    });
    var bulk = await whitelistDb.bulkUpsertFromMap(map);
    await whitelist.refreshWhitelistCache();
    return { rows: bulk.upserted, cacheCount: whitelist.whitelistSize() };
  }
  if (body.map && typeof body.map === "object") {
    var bulkMap = await whitelistDb.bulkUpsertFromMap(body.map);
    await whitelist.refreshWhitelistCache();
    return { rows: bulkMap.upserted, cacheCount: whitelist.whitelistSize() };
  }
  throw new Error("Provide entries array or map object.");
}

module.exports = {
  getWhitelistAdminStats: getWhitelistAdminStats,
  listWhitelist: listWhitelist,
  upsertWhitelistEntry: upsertWhitelistEntry,
  removeWhitelistEntry: removeWhitelistEntry,
  importWhitelistFromJsonFiles: importWhitelistFromJsonFiles,
  importWhitelistFromBody: importWhitelistFromBody
};
