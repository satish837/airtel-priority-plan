"use strict";

const { runWithHost, hostFromRequest } = require("../server/lib/instance");

async function withInstance(req, fn) {
  return runWithHost(hostFromRequest(req), fn);
}

module.exports = { withInstance };
