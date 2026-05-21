"use strict";

function getAdminKey() {
  return String(process.env.ADMIN_KEY || "").trim();
}

function readRequestKey(req) {
  if (!req) return "";
  var h = req.headers || {};
  var fromHeader =
    h["x-admin-key"] ||
    h["X-Admin-Key"] ||
    h["X-ADMIN-KEY"] ||
    "";
  var fromQuery = (req.query && req.query.key) || "";
  return String(fromHeader || fromQuery).trim();
}

function isAuthorized(req) {
  var expected = getAdminKey();
  if (!expected) return true;
  var provided = readRequestKey(req);
  return provided.length > 0 && provided === expected;
}

function unauthorizedResponse(res) {
  res.status(401).json({ ok: false, error: "Unauthorized. Set x-admin-key or ?key= with ADMIN_KEY." });
}

module.exports = { getAdminKey, isAuthorized, unauthorizedResponse };
