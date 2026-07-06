"use strict";

const { applyCors, handleOptions } = require("../../_cors");
const { withInstance } = require("../../_instance");
const whitelist = require("../../../server/lib/whitelist");
const whitelistAdmin = require("../../../server/lib/whitelistAdmin");
const adminAuth = require("../../../server/lib/adminAuth");

module.exports = async function handler(req, res) {
  return withInstance(req, async function () {
    applyCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    await whitelist.initWhitelist();
    var result = await whitelistAdmin.importWhitelistFromJsonFiles();
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.status(200).json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
  });
};
