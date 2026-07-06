"use strict";

const { applyCors, handleOptions } = require("./_cors");
const { withInstance } = require("./_instance");
const handlers = require("../server/lib/handlers");
const adminAuth = require("../server/lib/adminAuth");

module.exports = async function handler(req, res) {
  return withInstance(req, async function () {
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
      var day = req.query && req.query.day;
      var data = await handlers.getDashboardData(day);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.status(200).json({ ok: true, ...data });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });
};
