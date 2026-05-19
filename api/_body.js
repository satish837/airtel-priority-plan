"use strict";

/** Normalize Vercel/Express request body (may be object or JSON string). */
function parseJsonBody(req) {
  var body = req.body;
  if (body == null) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (e) {
      return {};
    }
  }
  if (typeof body === "object") return body;
  return {};
}

module.exports = { parseJsonBody };
