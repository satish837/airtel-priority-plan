"use strict";

const fs = require("fs");
const path = require("path");
const { getUri } = require("./db");

var LIST_CANDIDATES = [
  path.join(__dirname, "../../data/phone-whitelist.json"),
  path.join(__dirname, "../data/phone-whitelist.json"),
  path.join(process.cwd(), "data/phone-whitelist.json"),
  path.join(process.cwd(), "server/data/phone-whitelist.json")
];

var MAP_CANDIDATES = [
  path.join(__dirname, "../../data/phone-whitelist-map.json"),
  path.join(__dirname, "../data/phone-whitelist-map.json"),
  path.join(process.cwd(), "data/phone-whitelist-map.json"),
  path.join(process.cwd(), "server/data/phone-whitelist-map.json")
];

var phoneSet = null;
var phoneMap = null;
var cacheSource = null;
var loadedFrom = null;
var mapLoadedFrom = null;
var fileLoadAttempted = false;
var initPromise = null;

function normalizePhone(phone) {
  var digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function getConfiguredSource() {
  var src = (process.env.PHONE_WHITELIST_SOURCE || "auto").toLowerCase();
  if (src === "mongodb" || src === "mongo" || src === "db") return "mongodb";
  if (src === "file" || src === "json") return "file";
  return "auto";
}

function isWhitelistRequired() {
  if (process.env.PHONE_WHITELIST === "off") return false;
  if (
    process.env.PHONE_WHITELIST === "required" ||
    process.env.PHONE_WHITELIST_REQUIRED === "1"
  ) {
    return true;
  }
  if (process.env.VERCEL || process.env.NODE_ENV === "production") return true;
  return false;
}

function findFile(candidates, envKey) {
  var filePath = process.env[envKey] || null;
  if (filePath && fs.existsSync(filePath)) return filePath;
  for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return null;
}

function applyCache(map, source, meta) {
  phoneMap = map || {};
  phoneSet = new Set(Object.keys(phoneMap));
  cacheSource = source;
  loadedFrom = meta && meta.loadedFrom ? meta.loadedFrom : null;
  mapLoadedFrom = meta && meta.mapLoadedFrom ? meta.mapLoadedFrom : null;
}

function clearCache() {
  phoneSet = null;
  phoneMap = null;
  cacheSource = null;
  loadedFrom = null;
  mapLoadedFrom = null;
}

function loadWhitelistFromFiles() {
  if (process.env.PHONE_WHITELIST === "off") {
    clearCache();
    return null;
  }
  if (fileLoadAttempted && cacheSource === "file") return phoneSet;
  fileLoadAttempted = true;
  try {
    var mapPath = findFile(MAP_CANDIDATES, "PHONE_WHITELIST_MAP_PATH");
    if (mapPath) {
      mapLoadedFrom = mapPath;
      var rawMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      if (rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)) {
        var map = {};
        Object.keys(rawMap).forEach(function (key) {
          var phone = normalizePhone(key);
          if (phone.length !== 10) return;
          var row = rawMap[key] || {};
          var olmId = String(row.olmId || row.storeId || "").trim();
          map[phone] = {
            olmId: olmId,
            storeId: olmId,
            circle: String(row.circle || "").trim(),
            name: String(row.name || "").trim()
          };
        });
        applyCache(map, "file", { loadedFrom: mapPath, mapLoadedFrom: mapPath });
        console.log(
          "Phone whitelist (file):",
          phoneSet.size,
          "numbers from",
          mapPath
        );
        return phoneSet;
      }
    }

    var listPath = findFile(LIST_CANDIDATES, "PHONE_WHITELIST_PATH");
    if (!listPath) {
      if (isWhitelistRequired()) {
        console.error(
          "PHONE WHITELIST REQUIRED but whitelist data was not found. All numbers will be blocked."
        );
      }
      clearCache();
      return null;
    }
    loadedFrom = listPath;
    var list = JSON.parse(fs.readFileSync(listPath, "utf8"));
    if (!Array.isArray(list) || !list.length) {
      clearCache();
      return null;
    }
    var listMap = {};
    list.forEach(function (p) {
      var phone = normalizePhone(p);
      if (phone.length === 10) {
        listMap[phone] = { olmId: "", storeId: "", circle: "", name: "" };
      }
    });
    applyCache(listMap, "file", { loadedFrom: listPath });
    console.log("Phone whitelist (file):", phoneSet.size, "numbers from", listPath);
  } catch (e) {
    console.error("Failed to load phone whitelist from file:", e.message);
    clearCache();
  }
  return phoneSet;
}

async function loadWhitelistFromMongo() {
  var whitelistDb = require("./whitelistDb");
  var loaded = await whitelistDb.loadActiveMap();
  if (loaded.count > 0) {
    applyCache(loaded.phoneMap, "mongodb", {
      loadedFrom: "mongodb:" + whitelistDb.COLLECTION
    });
    console.log(
      "Phone whitelist (MongoDB):",
      loaded.count,
      "numbers from",
      whitelistDb.COLLECTION
    );
    return phoneSet;
  }
  return null;
}

/** Initialize cache: MongoDB when configured (auto or mongodb), else JSON files. */
async function initWhitelist() {
  if (initPromise) return initPromise;
  initPromise = (async function () {
    if (process.env.PHONE_WHITELIST === "off") {
      clearCache();
      return;
    }
    var source = getConfiguredSource();
    var wantMongo = source === "mongodb" || source === "auto";
    if (wantMongo && getUri()) {
      try {
        var set = await loadWhitelistFromMongo();
        if (set && set.size > 0) return;
        if (source === "mongodb") {
          console.warn(
            "PHONE_WHITELIST_SOURCE=mongodb but collection is empty. Run: node scripts/seed-whitelist-mongo.js"
          );
          clearCache();
          return;
        }
      } catch (e) {
        console.error("MongoDB whitelist load failed:", e.message);
        if (source === "mongodb") {
          clearCache();
          return;
        }
      }
    }
    loadWhitelistFromFiles();
  })();
  return initPromise;
}

/** Reload in-memory cache after admin edits (MongoDB source). */
async function refreshWhitelistCache() {
  initPromise = null;
  fileLoadAttempted = false;
  return initWhitelist();
}

function ensureSyncCache() {
  if (phoneMap !== null) return;
  if (getConfiguredSource() === "file" || !getUri()) {
    loadWhitelistFromFiles();
  }
}

function lookupByPhone(phone) {
  ensureSyncCache();
  if (!phoneMap) return null;
  return phoneMap[normalizePhone(phone)] || null;
}

function isWhitelistActive() {
  ensureSyncCache();
  return !!(phoneSet && phoneSet.size > 0);
}

function isPhoneWhitelisted(phone) {
  if (isWhitelistActive()) {
    return phoneSet.has(normalizePhone(phone));
  }
  if (isWhitelistRequired()) {
    return false;
  }
  return true;
}

function whitelistSize() {
  ensureSyncCache();
  return phoneSet ? phoneSet.size : 0;
}

function whitelistMetaForPhone(phone) {
  var row = lookupByPhone(phone);
  if (!row) return { storeId: "", olmId: "", circle: "", name: "" };
  return {
    storeId: row.storeId || row.olmId || "",
    olmId: row.olmId || row.storeId || "",
    circle: row.circle || "",
    name: row.name || ""
  };
}

function getCacheSource() {
  ensureSyncCache();
  return cacheSource;
}

module.exports = {
  normalizePhone: normalizePhone,
  isWhitelistActive: isWhitelistActive,
  isWhitelistRequired: isWhitelistRequired,
  isPhoneWhitelisted: isPhoneWhitelisted,
  lookupByPhone: lookupByPhone,
  whitelistMetaForPhone: whitelistMetaForPhone,
  whitelistSize: whitelistSize,
  initWhitelist: initWhitelist,
  refreshWhitelistCache: refreshWhitelistCache,
  getCacheSource: getCacheSource,
  getConfiguredSource: getConfiguredSource,
  getWhitelistPath: function () {
    ensureSyncCache();
    return loadedFrom;
  },
  getWhitelistMapPath: function () {
    ensureSyncCache();
    return mapLoadedFrom;
  }
};
