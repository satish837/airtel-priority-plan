"use strict";

function getAdminKey() {
  return process.env.ADMIN_KEY || "";
}

function isAuthorized(req) {
  var expected = getAdminKey();
  if (!expected) return true;
  var header = req.headers && req.headers["x-admin-key"];
  var query = req.query && req.query.key;
  return header === expected || query === expected;
}

function unauthorizedResponse(res) {
  res.status(401).json({ ok: false, error: "Unauthorized. Set x-admin-key or ?key= with ADMIN_KEY." });
}

module.exports = { getAdminKey, isAuthorized, unauthorizedResponse };
