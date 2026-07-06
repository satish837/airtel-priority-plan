"use strict";

const { applyCors, handleOptions } = require("./_cors");
const { parseJsonBody } = require("./_body");
const { withInstance } = require("./_instance");
const handlers = require("../server/lib/handlers");

module.exports = async function handler(req, res) {
  return withInstance(req, async function () {
    applyCors(res);
    if (handleOptions(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }
    try {
      var result = await handlers.submitScore(parseJsonBody(req));
      res.status(200).json({
        ok: true,
        entry: result.entry,
        rank: result.rank,
        board: result.board
      });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });
};
