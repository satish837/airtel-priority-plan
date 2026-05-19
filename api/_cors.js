"use strict";

function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function handleOptions(req, res) {
  if (req.method === "OPTIONS") {
    applyCors(res);
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { applyCors, handleOptions };
