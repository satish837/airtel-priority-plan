"use strict";

const { AsyncLocalStorage } = require("async_hooks");

const instanceStore = new AsyncLocalStorage();
const DEFAULT_DB_NAME = process.env.MONGODB_DB_NAME || "airtel_challenge";

var instanceMapCache = null;

function parseInstanceMap() {
  if (instanceMapCache) return instanceMapCache;

  var raw = String(process.env.AIRTEL_INSTANCE_MAP || "").trim();
  var map = Object.create(null);
  if (!raw) {
    instanceMapCache = map;
    return map;
  }

  try {
    if (raw.charAt(0) === "{") {
      var parsed = JSON.parse(raw);
      Object.keys(parsed).forEach(function (host) {
        var dbName = String(parsed[host] || "").trim();
        if (dbName) map[normalizeHost(host)] = dbName;
      });
    } else {
      raw.split(",").forEach(function (pair) {
        var parts = pair.split("=");
        if (parts.length < 2) return;
        var host = normalizeHost(parts[0]);
        var dbName = String(parts.slice(1).join("=") || "").trim();
        if (host && dbName) map[host] = dbName;
      });
    }
  } catch (e) {
    console.error("Invalid AIRTEL_INSTANCE_MAP:", e.message);
  }

  instanceMapCache = map;
  return map;
}

function normalizeHost(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .split(":")[0]
    .replace(/^www\./, "");
}

function resolveDbName(host) {
  var key = normalizeHost(host);
  if (key) {
    var mapped = parseInstanceMap()[key];
    if (mapped) return mapped;
  }
  return DEFAULT_DB_NAME;
}

function hostFromRequest(req) {
  if (!req || !req.headers) return "";
  var forwarded = req.headers["x-forwarded-host"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return String(req.headers.host || "").trim();
}

function getInstanceContext() {
  return instanceStore.getStore() || null;
}

function getActiveDbName() {
  var ctx = getInstanceContext();
  return (ctx && ctx.dbName) || DEFAULT_DB_NAME;
}

function runWithHost(host, fn) {
  var dbName = resolveDbName(host);
  return instanceStore.run({ host: normalizeHost(host), dbName: dbName }, fn);
}

module.exports = {
  parseInstanceMap,
  normalizeHost,
  resolveDbName,
  hostFromRequest,
  getInstanceContext,
  getActiveDbName,
  runWithHost,
  DEFAULT_DB_NAME
};
