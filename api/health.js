"use strict";

const { applyCors, handleOptions } = require("./_cors");
const { withInstance } = require("./_instance");
const { getUri } = require("../server/lib/db");
const { getActiveDbName, hostFromRequest } = require("../server/lib/instance");

module.exports = async function handler(req, res) {
  return withInstance(req, async function () {
    applyCors(res);
    if (handleOptions(req, res)) return;
    try {
      res.status(200).json({
        ok: true,
        mongoConfigured: !!getUri(),
        dbName: getActiveDbName(),
        host: hostFromRequest(req),
        whitelistDisabled: process.env.PHONE_WHITELIST === "off"
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
};
