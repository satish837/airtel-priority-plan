"use strict";

const fs = require("fs");
const path = require("path");

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
var loadAttempted = false;
var loadedFrom = null;
var mapLoadedFrom = null;

function normalizePhone(phone) {
  var digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
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

function loadWhitelist() {
  if (loadAttempted) return phoneSet;
  loadAttempted = true;
  if (process.env.PHONE_WHITELIST === "off") {
    phoneSet = null;
    phoneMap = null;
    return null;
  }
  try {
    var mapPath = findFile(MAP_CANDIDATES, "PHONE_WHITELIST_MAP_PATH");
    if (mapPath) {
      mapLoadedFrom = mapPath;
      var rawMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
      if (rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)) {
        phoneMap = {};
        phoneSet = new Set();
        Object.keys(rawMap).forEach(function (key) {
          var phone = normalizePhone(key);
          if (phone.length !== 10) return;
          var row = rawMap[key] || {};
          var olmId = String(row.olmId || row.storeId || "").trim();
          phoneMap[phone] = {
            olmId: olmId,
            storeId: olmId,
            circle: String(row.circle || "").trim(),
            name: String(row.name || "").trim()
          };
          phoneSet.add(phone);
        });
        loadedFrom = mapPath;
        console.log(
          "Phone whitelist map loaded:",
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
      phoneSet = null;
      phoneMap = null;
      return null;
    }
    loadedFrom = listPath;
    var list = JSON.parse(fs.readFileSync(listPath, "utf8"));
    if (!Array.isArray(list) || !list.length) {
      phoneSet = null;
      phoneMap = null;
      return null;
    }
    phoneSet = new Set();
    phoneMap = {};
    list.forEach(function (p) {
      var phone = normalizePhone(p);
      if (phone.length === 10) {
        phoneSet.add(phone);
        if (!phoneMap[phone]) {
          phoneMap[phone] = { olmId: "", storeId: "", circle: "", name: "" };
        }
      }
    });
    console.log("Phone whitelist loaded:", phoneSet.size, "numbers from", listPath);
  } catch (e) {
    console.error("Failed to load phone whitelist:", e.message);
    phoneSet = null;
    phoneMap = null;
  }
  return phoneSet;
}

function lookupByPhone(phone) {
  loadWhitelist();
  if (!phoneMap) return null;
  return phoneMap[normalizePhone(phone)] || null;
}

function isWhitelistActive() {
  var set = loadWhitelist();
  return !!(set && set.size > 0);
}

function isPhoneWhitelisted(phone) {
  if (isWhitelistActive()) {
    return loadWhitelist().has(normalizePhone(phone));
  }
  if (isWhitelistRequired()) {
    return false;
  }
  return true;
}

function whitelistSize() {
  var set = loadWhitelist();
  return set ? set.size : 0;
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

loadWhitelist();

module.exports = {
  normalizePhone: normalizePhone,
  isWhitelistActive: isWhitelistActive,
  isWhitelistRequired: isWhitelistRequired,
  isPhoneWhitelisted: isPhoneWhitelisted,
  lookupByPhone: lookupByPhone,
  whitelistMetaForPhone: whitelistMetaForPhone,
  whitelistSize: whitelistSize,
  getWhitelistPath: function () {
    loadWhitelist();
    return loadedFrom;
  },
  getWhitelistMapPath: function () {
    loadWhitelist();
    return mapLoadedFrom;
  }
};
