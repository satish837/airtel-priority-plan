"use strict";

const { applyCors, handleOptions } = require("./_cors");
const { parseJsonBody } = require("./_body");
const { withInstance } = require("./_instance");
const handlers = require("../server/lib/handlers");

module.exports = async function handler(req, res) {
  return withInstance(req, async function () {
    applyCors(res);
    if (handleOptions(req, res)) return;

    if (req.method === "GET") {
      var phone = req.query && req.query.phone;
      if (!phone) {
        res.status(400).json({ ok: false, error: "phone query required" });
        return;
      }
      try {
        var status = await handlers.getPlaysStatus(phone, req.query.day);
        res.status(200).json({ ok: true, ...status });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
      return;
    }

    if (req.method === "POST") {
      try {
        var body = parseJsonBody(req);
        var result = await handlers.usePlay(body.phone, body.day);
        res.status(200).json({ ok: result.ok, ...result });
      } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
      }
      return;
    }

    res.status(405).json({ ok: false, error: "Method not allowed" });
  });
};
