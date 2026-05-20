"use strict";

const { applyCors, handleOptions } = require("./_cors");
const { getUri } = require("../server/lib/db");
const whitelist = require("../server/lib/whitelist");
const whitelistAdmin = require("../server/lib/whitelistAdmin");

module.exports = async function handler(req, res) {
  applyCors(res);
  if (handleOptions(req, res)) return;
  try {
    await whitelist.initWhitelist();
    var stats = await whitelistAdmin.getWhitelistAdminStats();
    res.status(200).json({
      ok: true,
      mongoConfigured: !!getUri(),
      phoneWhitelistActive: whitelist.isWhitelistActive(),
      phoneWhitelistRequired: whitelist.isWhitelistRequired(),
      phoneWhitelistCount: whitelist.whitelistSize(),
      phoneWhitelistSource: stats.cacheSource,
      phoneWhitelistMongoCount: stats.mongoCount
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
