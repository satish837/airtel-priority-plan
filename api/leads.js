"use strict";

const { applyCors, handleOptions } = require("./_cors");
const handlers = require("../server/lib/handlers");

module.exports = async function handler(req, res) {
  applyCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    var lead = await handlers.upsertLead(req.body || {});
    res.status(200).json({ ok: true, lead: lead });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
};
