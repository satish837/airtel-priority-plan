"use strict";

const { applyCors, handleOptions } = require("./_cors");
const { getUri } = require("../server/lib/db");

module.exports = async function handler(req, res) {
  applyCors(res);
  if (handleOptions(req, res)) return;
  res.status(200).json({ ok: true, mongoConfigured: !!getUri() });
};
