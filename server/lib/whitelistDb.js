"use strict";

const { getDb, ensureIndexes } = require("./db");

const COLLECTION = "phone_whitelist";

function normalizePhone(phone) {
  var digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function rowToMeta(doc) {
  if (!doc) return null;
  var olmId = String(doc.olmId || doc.storeId || "").trim();
  return {
    olmId: olmId,
    storeId: olmId,
    circle: String(doc.circle || "").trim(),
    name: String(doc.name || "").trim()
  };
}

async function ensureWhitelistIndexes(db) {
  await ensureIndexes(db);
  await db
    .collection(COLLECTION)
    .createIndex({ phone: 1 }, { unique: true });
  await db.collection(COLLECTION).createIndex({ active: 1, phone: 1 });
  await db.collection(COLLECTION).createIndex({ olmId: 1 });
}

async function countActive() {
  var db = await getDb();
  await ensureWhitelistIndexes(db);
  return db.collection(COLLECTION).countDocuments({
    $or: [{ active: { $exists: false } }, { active: true }]
  });
}

/** Load all active whitelist rows into phone -> meta map. */
async function loadActiveMap() {
  var db = await getDb();
  await ensureWhitelistIndexes(db);
  var cursor = db.collection(COLLECTION).find({
    $or: [{ active: { $exists: false } }, { active: true }]
  });
  var phoneMap = {};
  var phoneSet = new Set();
  await cursor.forEach(function (doc) {
    var phone = normalizePhone(doc.phone);
    if (phone.length !== 10) return;
    var meta = rowToMeta(doc);
    phoneMap[phone] = meta;
    phoneSet.add(phone);
  });
  return { phoneMap: phoneMap, phoneSet: phoneSet, count: phoneSet.size };
}

async function listEntries(opts) {
  opts = opts || {};
  var db = await getDb();
  await ensureWhitelistIndexes(db);
  var q = String(opts.q || "").trim().toLowerCase();
  var page = Math.max(1, parseInt(opts.page, 10) || 1);
  var limit = Math.min(200, Math.max(1, parseInt(opts.limit, 10) || 50));
  var skip = (page - 1) * limit;

  var activeClause = {
    $or: [{ active: { $exists: false } }, { active: true }]
  };
  var filter = activeClause;
  if (q) {
    filter = {
      $and: [
        activeClause,
        {
          $or: [
            { phone: { $regex: q, $options: "i" } },
            { name: { $regex: q, $options: "i" } },
            { olmId: { $regex: q, $options: "i" } },
            { storeId: { $regex: q, $options: "i" } },
            { circle: { $regex: q, $options: "i" } }
          ]
        }
      ]
    };
  }

  var coll = db.collection(COLLECTION);
  var total = await coll.countDocuments(filter);
  var rows = await coll
    .find(filter)
    .sort({ updatedAt: -1, phone: 1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  return {
    rows: rows.map(function (doc) {
      return {
        phone: doc.phone,
        olmId: doc.olmId || doc.storeId || "",
        storeId: doc.storeId || doc.olmId || "",
        circle: doc.circle || "",
        name: doc.name || "",
        active: doc.active !== false,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt
      };
    }),
    total: total,
    page: page,
    limit: limit
  };
}

async function upsertEntry(body) {
  var phone = normalizePhone(body.phone);
  if (phone.length !== 10) {
    throw new Error("Valid 10-digit phone is required.");
  }
  var olmId = String(body.olmId || body.storeId || "").trim();
  var now = new Date();
  var db = await getDb();
  await ensureWhitelistIndexes(db);
  var doc = {
    phone: phone,
    olmId: olmId,
    storeId: olmId,
    circle: String(body.circle || "").trim(),
    name: String(body.name || "").trim(),
    active: body.active !== false,
    updatedAt: now
  };
  await db.collection(COLLECTION).updateOne(
    { phone: phone },
    {
      $set: doc,
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  );
  return doc;
}

async function deactivateEntry(phone) {
  phone = normalizePhone(phone);
  if (!phone) throw new Error("phone is required");
  var db = await getDb();
  await ensureWhitelistIndexes(db);
  var result = await db.collection(COLLECTION).updateOne(
    { phone: phone },
    { $set: { active: false, updatedAt: new Date() } }
  );
  if (result.matchedCount === 0) {
    throw new Error("Phone not found in whitelist.");
  }
  return { phone: phone, active: false };
}

/** Bulk upsert from { phone: { olmId, circle, name } } map. */
async function bulkUpsertFromMap(rawMap) {
  if (!rawMap || typeof rawMap !== "object" || Array.isArray(rawMap)) {
    throw new Error("Expected object map of phone -> row");
  }
  var db = await getDb();
  await ensureWhitelistIndexes(db);
  var coll = db.collection(COLLECTION);
  var now = new Date();
  var ops = [];
  Object.keys(rawMap).forEach(function (key) {
    var phone = normalizePhone(key);
    if (phone.length !== 10) return;
    var row = rawMap[key] || {};
    var olmId = String(row.olmId || row.storeId || "").trim();
    ops.push({
      updateOne: {
        filter: { phone: phone },
        update: {
          $set: {
            phone: phone,
            olmId: olmId,
            storeId: olmId,
            circle: String(row.circle || "").trim(),
            name: String(row.name || "").trim(),
            active: true,
            updatedAt: now
          },
          $setOnInsert: { createdAt: now }
        },
        upsert: true
      }
    });
  });
  if (!ops.length) return { upserted: 0 };
  var BATCH = 500;
  var total = 0;
  for (var i = 0; i < ops.length; i += BATCH) {
    var chunk = ops.slice(i, i + BATCH);
    var res = await coll.bulkWrite(chunk, { ordered: false });
    total += (res.upsertedCount || 0) + (res.modifiedCount || 0) + (res.matchedCount || 0);
  }
  return { upserted: ops.length, batches: Math.ceil(ops.length / BATCH) };
}

module.exports = {
  COLLECTION: COLLECTION,
  normalizePhone: normalizePhone,
  countActive: countActive,
  loadActiveMap: loadActiveMap,
  listEntries: listEntries,
  upsertEntry: upsertEntry,
  deactivateEntry: deactivateEntry,
  bulkUpsertFromMap: bulkUpsertFromMap
};
