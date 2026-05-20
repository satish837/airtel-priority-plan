"use strict";

const { applyCors, handleOptions } = require("../_cors");
const { parseJsonBody } = require("../_body");
const whitelist = require("../../server/lib/whitelist");
const whitelistAdmin = require("../../server/lib/whitelistAdmin");
const adminAuth = require("../../server/lib/adminAuth");

module.exports = async function handler(req, res) {
  applyCors(res);
  if (handleOptions(req, res)) return;
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    await whitelist.initWhitelist();
    if (req.method === "GET") {
      var data = await whitelistAdmin.listWhitelist(req.query || {});
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.status(200).json({ ok: true, ...data });
      return;
    }
    if (req.method === "POST") {
      var doc = await whitelistAdmin.upsertWhitelistEntry(parseJsonBody(req));
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.status(200).json({ ok: true, entry: doc });
      return;
    }
    if (req.method === "DELETE") {
      var body = parseJsonBody(req);
      var phone = (req.query && req.query.phone) || body.phone;
      var result = await whitelistAdmin.removeWhitelistEntry(phone);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.status(200).json({ ok: true, ...result });
      return;
    }
    res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
};
