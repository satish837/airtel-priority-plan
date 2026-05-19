"use strict";

const { getDb, ensureIndexes } = require("./db");

const MAX_REPLAYS = 99;

/** Calendar day for daily limits / scores (India default). Override with AIRTEL_DAY_TIMEZONE=UTC */
function calendarDayInZone(d, zone) {
  d = d || new Date();
  zone = zone || process.env.AIRTEL_DAY_TIMEZONE || "Asia/Kolkata";
  if (zone === "UTC") {
    return d.toISOString().slice(0, 10);
  }
  try {
    return d.toLocaleDateString("en-CA", { timeZone: zone });
  } catch (e) {
    return d.toISOString().slice(0, 10);
  }
}

function todayKey(d) {
  return calendarDayInZone(d, process.env.AIRTEL_DAY_TIMEZONE);
}

/** YYYY-MM-DD plus/minus one calendar day (UTC anchor) for cross-midnight / legacy UTC rows */
function adjacentDayKeys(ymd) {
  if (!ymd || typeof ymd !== "string") {
    return [todayKey()];
  }
  var t = new Date(ymd + "T12:00:00.000Z").getTime();
  if (isNaN(t)) {
    return [todayKey()];
  }
  var DAY_MS = 86400000;
  return [
    new Date(t - DAY_MS).toISOString().slice(0, 10),
    new Date(t).toISOString().slice(0, 10),
    new Date(t + DAY_MS).toISOString().slice(0, 10)
  ];
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\s/g, "");
}

function sortBoard(board) {
  return board.slice().sort(function (a, b) {
    var ta = (a.total != null ? a.total : (a.coins || 0) + (a.fastLaneCoins || 0)) || 0;
    var tb = (b.total != null ? b.total : (b.coins || 0) + (b.fastLaneCoins || 0)) || 0;
    return (
      tb - ta ||
      (b.priorityPoints || 0) - (a.priorityPoints || 0) ||
      (b.coins || 0) - (a.coins || 0) ||
      (a.ts || 0) - (b.ts || 0)
    );
  });
}

/** One row per phone — best run of the day (for public leaderboard). */
function bestBoardPerPlayer(rows) {
  var byPhone = {};
  rows.forEach(function (row) {
    var phone = normalizePhone(row.phone);
    if (!phone) return;
    var cur = byPhone[phone];
    if (!cur) {
      byPhone[phone] = row;
      return;
    }
    var sorted = sortBoard([cur, row]);
    byPhone[phone] = sorted[0];
  });
  return sortBoard(
    Object.keys(byPhone).map(function (p) {
      return byPhone[p];
    })
  );
}

function rankForPhone(board, phone) {
  phone = normalizePhone(phone);
  var best = null;
  for (var i = 0; i < board.length; i++) {
    if (normalizePhone(board[i].phone) === phone) {
      var r = i + 1;
      if (best === null || r < best) best = r;
    }
  }
  return best;
}

function playFlagsFromStatus(status, day) {
  return {
    playsDay: day,
    playsUsedToday: status.used,
    playsLeftToday: status.left,
    canPlayToday: status.left > 0,
    playLimitReached: status.left <= 0 && status.used >= MAX_REPLAYS
  };
}

async function syncLeadPlayFlags(db, phone, day) {
  var status = await getPlaysStatus(phone, day);
  var flags = playFlagsFromStatus(status, day);
  await db.collection("leads").updateOne({ phone: phone }, { $set: flags });
  return Object.assign({}, status, flags);
}

/** Check daily play limit from DB and persist flags on the lead record. */
async function getLeadPlayStatus(phone, day) {
  phone = normalizePhone(phone);
  if (!phone) throw new Error("phone is required");
  day = day || todayKey();
  var db = await getDb();
  await ensureIndexes(db);
  return syncLeadPlayFlags(db, phone, day);
}

async function upsertLead(body) {
  var phone = normalizePhone(body.phone);
  if (!phone) throw new Error("phone is required");
  var db = await getDb();
  await ensureIndexes(db);
  var now = new Date();
  var day = body.day || todayKey(now);
  var doc = {
    name: String(body.name || "").trim(),
    storeId: String(body.storeId || "").trim(),
    character: String(body.character || "").trim(),
    updatedAt: now
  };
  await db.collection("leads").updateOne(
    { phone: phone },
    {
      $set: doc,
      $setOnInsert: { phone: phone, createdAt: now }
    },
    { upsert: true }
  );
  var playStatus = await syncLeadPlayFlags(db, phone, day);
  return {
    phone: phone,
    name: doc.name,
    storeId: doc.storeId,
    character: doc.character,
    playStatus: playStatus
  };
}

async function getPlaysStatus(phone, day) {
  phone = normalizePhone(phone);
  day = day || todayKey();
  var db = await getDb();
  await ensureIndexes(db);
  var doc = await db.collection("daily_plays").findOne({ phone: phone, day: day });
  var used = doc && doc.used ? doc.used : 0;
  return {
    phone: phone,
    day: day,
    used: used,
    left: Math.max(0, MAX_REPLAYS - used),
    maxReplays: MAX_REPLAYS
  };
}

async function usePlay(phone, day) {
  phone = normalizePhone(phone);
  day = day || todayKey();
  var db = await getDb();
  await ensureIndexes(db);
  var coll = db.collection("daily_plays");
  var result = await coll.findOneAndUpdate(
    {
      phone: phone,
      day: day,
      $or: [{ used: { $exists: false } }, { used: { $lt: MAX_REPLAYS } }]
    },
    {
      $inc: { used: 1 },
      $set: { updatedAt: new Date() },
      $setOnInsert: { phone: phone, day: day, createdAt: new Date() }
    },
    { upsert: true, returnDocument: "after" }
  );
  if (!result) {
    var status = await getPlaysStatus(phone, day);
    await syncLeadPlayFlags(db, phone, day);
    return {
      ok: false,
      used: status.used,
      left: status.left,
      day: day,
      canPlayToday: false,
      playLimitReached: status.used >= MAX_REPLAYS
    };
  }
  var used = result.used || 0;
  if (used > MAX_REPLAYS) {
    await coll.updateOne({ phone: phone, day: day }, { $set: { used: MAX_REPLAYS } });
    await syncLeadPlayFlags(db, phone, day);
    return {
      ok: false,
      used: MAX_REPLAYS,
      left: 0,
      day: day,
      canPlayToday: false,
      playLimitReached: true
    };
  }
  var left = Math.max(0, MAX_REPLAYS - used);
  await syncLeadPlayFlags(db, phone, day);
  return {
    ok: true,
    used: used,
    left: left,
    day: day,
    canPlayToday: left > 0,
    playLimitReached: left <= 0
  };
}

async function submitScore(body) {
  var phone = normalizePhone(body.phone);
  if (!phone) throw new Error("phone is required");
  var day = body.day || todayKey();
  var coins = Number(body.coins) || 0;
  var priorityPoints = Number(body.priorityPoints) || 0;
  var fastLaneCoins = Number(body.fastLaneCoins) || 0;
  var entry = {
    phone: phone,
    name: String(body.name || "").trim(),
    storeId: String(body.storeId || "").trim(),
    coins: coins,
    priorityPoints: priorityPoints,
    fastLaneCoins: fastLaneCoins,
    total: coins + fastLaneCoins,
    lettersCollected: Number(body.lettersCollected) || 0,
    fastLaneUnlocked: !!body.fastLaneUnlocked,
    reason: body.reason || "complete",
    day: day,
    ts: Date.now(),
    createdAt: new Date()
  };
  var db = await getDb();
  await ensureIndexes(db);
  await db.collection("scores").insertOne(entry);
  var board = await getLeaderboard(day);
  var rank = rankForPhone(board, phone);
  return { entry: entry, rank: rank || 0, board: board };
}

async function getLeaderboard(day) {
  day = day || todayKey();
  var db = await getDb();
  await ensureIndexes(db);
  var keys = adjacentDayKeys(day);
  var rows = await db
    .collection("scores")
    .find({ day: { $in: keys } })
    .sort({ total: -1, priorityPoints: -1, coins: -1, ts: 1 })
    .limit(800)
    .toArray();
  return bestBoardPerPlayer(rows).slice(0, 50);
}

async function getUserRank(phone, day) {
  var board = await getLeaderboard(day);
  return rankForPhone(board, phone);
}

async function getDashboardData(day) {
  day = day || todayKey();
  var db = await getDb();
  await ensureIndexes(db);

  var leads = await db
    .collection("leads")
    .find({})
    .sort({ updatedAt: -1 })
    .limit(5000)
    .toArray();

  var dayKeys = adjacentDayKeys(day);
  var playsToday = await db
    .collection("daily_plays")
    .find({ day: { $in: dayKeys } })
    .toArray();
  var scoreDayKeys = dayKeys;
  var scoresToday = await db
    .collection("scores")
    .find({ day: { $in: scoreDayKeys } })
    .sort({ ts: -1 })
    .limit(5000)
    .toArray();

  var playsMap = {};
  playsToday.forEach(function (p) {
    var phone = normalizePhone(p.phone);
    var existing = playsMap[phone];
    if (!existing) {
      playsMap[phone] = p;
      return;
    }
    if (p.day === day) {
      playsMap[phone] = p;
      return;
    }
    if (existing.day !== day && (p.used || 0) > (existing.used || 0)) {
      playsMap[phone] = p;
    }
  });

  var scoreStats = {};
  scoresToday.forEach(function (s) {
    var phone = normalizePhone(s.phone);
    if (!scoreStats[phone]) {
      scoreStats[phone] = {
        runs: 0,
        bestPriority: 0,
        bestCoins: 0,
        totalCoins: 0,
        fastLaneRuns: 0,
        lastRunAt: null
      };
    }
    var st = scoreStats[phone];
    st.runs += 1;
    st.bestPriority = Math.max(st.bestPriority, s.priorityPoints || 0);
    st.bestCoins = Math.max(st.bestCoins, s.coins || 0);
    st.totalCoins += s.coins || 0;
    if (s.fastLaneUnlocked) st.fastLaneRuns += 1;
    if (!st.lastRunAt || s.ts > st.lastRunAt) st.lastRunAt = s.ts;
  });

  var players = leads.map(function (lead) {
    var phone = normalizePhone(lead.phone);
    var play = playsMap[phone];
    var st = scoreStats[phone] || {
      runs: 0,
      bestPriority: 0,
      bestCoins: 0,
      totalCoins: 0,
      fastLaneRuns: 0,
      lastRunAt: null
    };
    var used = play && play.used ? play.used : 0;
    var left = Math.max(0, MAX_REPLAYS - used);
    return {
      phone: phone,
      name: lead.name || "",
      storeId: lead.storeId || "",
      character: lead.character || "",
      registeredAt: lead.createdAt || null,
      updatedAt: lead.updatedAt || null,
      playsUsed: used,
      playsLeft: left,
      canPlayToday: left > 0,
      playLimitReached: left <= 0,
      runsToday: st.runs,
      bestPriority: st.bestPriority,
      bestCoins: st.bestCoins,
      totalCoins: st.totalCoins,
      fastLaneRuns: st.fastLaneRuns,
      lastRunAt: st.lastRunAt
    };
  });

  var leadPhones = {};
  leads.forEach(function (l) {
    leadPhones[normalizePhone(l.phone)] = true;
  });

  Object.keys(scoreStats).forEach(function (phone) {
    if (leadPhones[phone]) return;
    var play = playsMap[phone];
    var st = scoreStats[phone];
    var used = play && play.used ? play.used : 0;
    var leftOrphan = Math.max(0, MAX_REPLAYS - used);
    players.push({
      phone: phone,
      name: "",
      storeId: "",
      character: "",
      registeredAt: null,
      updatedAt: null,
      playsUsed: used,
      playsLeft: leftOrphan,
      canPlayToday: leftOrphan > 0,
      playLimitReached: leftOrphan <= 0,
      runsToday: st.runs,
      bestPriority: st.bestPriority,
      bestCoins: st.bestCoins,
      totalCoins: st.totalCoins,
      fastLaneRuns: st.fastLaneRuns,
      lastRunAt: st.lastRunAt
    });
  });

  players.sort(function (a, b) {
    return (
      (b.lastRunAt || 0) - (a.lastRunAt || 0) ||
      (b.bestCoins || 0) - (a.bestCoins || 0) ||
      (b.bestPriority || 0) - (a.bestPriority || 0)
    );
  });

  var uniquePlayersToday = Object.keys(scoreStats).length;
  var topScore = 0;
  scoresToday.forEach(function (s) {
    var t = (s.total != null ? s.total : (s.coins || 0) + (s.fastLaneCoins || 0)) || 0;
    topScore = Math.max(topScore, t);
  });

  var recentRuns = scoresToday.slice(0, 100).map(function (s) {
    return {
      phone: normalizePhone(s.phone),
      name: s.name || "",
      storeId: s.storeId || "",
      priorityPoints: s.priorityPoints || 0,
      coins: s.coins || 0,
      fastLaneCoins: s.fastLaneCoins || 0,
      fastLaneUnlocked: !!s.fastLaneUnlocked,
      reason: s.reason || "",
      ts: s.ts,
      createdAt: s.createdAt
    };
  });

  return {
    day: day,
    stats: {
      totalRegistered: leads.length,
      runsToday: scoresToday.length,
      uniquePlayersToday: uniquePlayersToday,
      topCoinScore: topScore,
      topPriorityScore: topScore
    },
    players: players,
    recentRuns: recentRuns
  };
}

module.exports = {
  MAX_REPLAYS: MAX_REPLAYS,
  todayKey: todayKey,
  normalizePhone: normalizePhone,
  upsertLead: upsertLead,
  getLeadPlayStatus: getLeadPlayStatus,
  getPlaysStatus: getPlaysStatus,
  usePlay: usePlay,
  submitScore: submitScore,
  getLeaderboard: getLeaderboard,
  getUserRank: getUserRank,
  getDashboardData: getDashboardData
};
