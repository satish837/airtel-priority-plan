"use strict";

const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { getUri } = require("./lib/db");
const handlers = require("./lib/handlers");
const whitelist = require("./lib/whitelist");
const whitelistAdmin = require("./lib/whitelistAdmin");
const adminAuth = require("./lib/adminAuth");

const PORT = Number(process.env.PORT) || 3001;
const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-admin-key"]
  })
);
app.use(express.json({ limit: "12mb" }));

app.get("/api/health", async function (_req, res) {
  try {
    await whitelist.initWhitelist();
    var stats = await whitelistAdmin.getWhitelistAdminStats();
    res.json({
      ok: true,
      mongoConfigured: !!getUri(),
      phoneWhitelistActive: whitelist.isWhitelistActive(),
      phoneWhitelistRequired: whitelist.isWhitelistRequired(),
      phoneWhitelistCount: whitelist.whitelistSize(),
      phoneWhitelistSource: stats.cacheSource,
      phoneWhitelistConfigured: stats.configuredSource,
      phoneWhitelistMongoCount: stats.mongoCount,
      phoneWhitelistPath: whitelist.getWhitelistPath()
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/leads/status", async function (req, res) {
  try {
    var phone = req.query.phone;
    if (!phone) {
      res.status(400).json({ ok: false, error: "phone query required" });
      return;
    }
    var status = await handlers.getLeadPlayStatus(phone, req.query.day);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/leads", async function (req, res) {
  try {
    var lead = await handlers.upsertLead(req.body || {});
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({
      ok: true,
      lead: lead,
      playStatus: lead.playStatus
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/plays", async function (req, res) {
  try {
    var phone = req.query.phone;
    if (!phone) {
      res.status(400).json({ ok: false, error: "phone query required" });
      return;
    }
    var status = await handlers.getPlaysStatus(phone, req.query.day);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/plays", async function (req, res) {
  try {
    var phone = (req.body && req.body.phone) || "";
    var result = await handlers.usePlay(phone, req.body && req.body.day);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: result.ok, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/leaderboard", async function (req, res) {
  try {
    if (req.query.phone) {
      var rank = await handlers.getUserRank(req.query.phone, req.query.day);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.json({
        ok: true,
        phone: handlers.normalizePhone(req.query.phone),
        rank: rank || 0
      });
      return;
    }
    var board = await handlers.getLeaderboard(req.query.day);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({
      ok: true,
      day: req.query.day || handlers.todayKey(),
      board: board
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/scores", async function (req, res) {
  try {
    var result = await handlers.submitScore(req.body || {});
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({
      ok: true,
      entry: result.entry,
      rank: result.rank,
      board: result.board
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/dashboard", async function (req, res) {
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    var data = await handlers.getDashboardData(req.query.day);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/verify", function (req, res) {
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  res.json({ ok: true });
});

app.get("/api/admin/whitelist/stats", async function (req, res) {
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    await whitelist.initWhitelist();
    var stats = await whitelistAdmin.getWhitelistAdminStats();
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, ...stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/whitelist", async function (req, res) {
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    var data = await whitelistAdmin.listWhitelist(req.query || {});
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/whitelist", async function (req, res) {
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    var doc = await whitelistAdmin.upsertWhitelistEntry(req.body || {});
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, entry: doc });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.delete("/api/admin/whitelist", async function (req, res) {
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    var phone = (req.query && req.query.phone) || (req.body && req.body.phone);
    var result = await whitelistAdmin.removeWhitelistEntry(phone);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/whitelist/import-files", async function (req, res) {
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    var result = await whitelistAdmin.importWhitelistFromJsonFiles();
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/admin/whitelist/import", async function (req, res) {
  if (!adminAuth.isAuthorized(req)) {
    adminAuth.unauthorizedResponse(res);
    return;
  }
  try {
    var result = await whitelistAdmin.importWhitelistFromBody(req.body || {});
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

async function startServer() {
  try {
    await whitelist.initWhitelist();
  } catch (err) {
    console.error("Whitelist init warning:", err.message);
  }
  var server = app.listen(PORT, function () {
    console.log("Airtel API listening on http://localhost:%s", PORT);
    if (!getUri()) {
      console.warn("Warning: MONGODB_URI is not set. Copy server/.env.example to server/.env");
    }
  });
  server.on("error", function (err) {
    if (err.code === "EADDRINUSE") {
      console.error(
        "Port %s is already in use. Stop the other API process:\n  lsof -ti :%s | xargs kill\nThen run: npm start",
        PORT,
        PORT
      );
      process.exit(1);
    }
    throw err;
  });
}

startServer();

