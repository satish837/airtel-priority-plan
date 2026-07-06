"use strict";

const { applyCors, handleOptions } = require("../_cors");
const { withInstance } = require("../_instance");
const handlers = require("../../server/lib/handlers");

module.exports = async function handler(req, res) {
  return withInstance(req, async function () {
    applyCors(res);
    if (handleOptions(req, res)) return;
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    try {
      var phone = req.query && req.query.phone;
      if (!phone) {
        res.status(400).json({ ok: false, error: "phone query required" });
        return;
      }
      var status = await handlers.getLeadPlayStatus(phone, req.query.day);
      res.status(200).json({ ok: true, ...status });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });
};
