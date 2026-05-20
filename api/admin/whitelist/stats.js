"use strict";

const { applyCors, handleOptions } = require("../../_cors");
const whitelist = require("../../../server/lib/whitelist");
const whitelistAdmin = require("../../../server/lib/whitelistAdmin");
const adminAuth = require("../../../server/lib/adminAuth");

module.exports = async function handler(req, res) {
  applyCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    await whitelist.initWhitelist();
    var stats = await whitelistAdmin.getWhitelistAdminStats();
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.status(200).json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
