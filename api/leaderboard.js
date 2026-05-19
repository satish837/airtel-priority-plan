"use strict";

const { applyCors, handleOptions } = require("./_cors");
const handlers = require("../server/lib/handlers");

module.exports = async function handler(req, res) {
  applyCors(res);
  if (handleOptions(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    var phone = req.query && req.query.phone;
    var day = req.query && req.query.day;
    if (phone) {
      var rank = await handlers.getUserRank(phone, day);
      res.status(200).json({
        ok: true,
        phone: handlers.normalizePhone(phone),
        rank: rank || 0
      });
      return;
    }
    var board = await handlers.getLeaderboard(day);
    res.status(200).json({
      ok: true,
      day: day || handlers.todayKey(),
      board: board
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};
