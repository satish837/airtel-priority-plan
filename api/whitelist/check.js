"use strict";

const { applyCors, handleOptions } = require("../_cors");
const handlers = require("../../server/lib/handlers");

module.exports = async function handler(req, res) {
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
    phone = handlers.normalizePhone(phone);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.status(200).json({
      ok: true,
      phone: phone,
      allowed: true,
      whitelisted: true
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
