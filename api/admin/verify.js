"use strict";

const { applyCors, handleOptions } = require("../_cors");
const { withInstance } = require("../_instance");
const adminAuth = require("../../server/lib/adminAuth");

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
    res.status(200).json({ ok: true });
  });
};
