(function (global) {
  "use strict";

  var LETTERS = ["P", "R", "I", "O", "R", "I", "T", "Y"];
  var MAX_REPLAYS = 3;

  var apiReplaysLeft = null;
  var apiCanPlayToday = null;
  var apiPlayLimitReached = null;
  var apiBoardCache = null;
  var initPromise = null;

  function apiBase() {
    var base = global.AIRTEL_API_BASE;
    if (base === undefined || base === null) return "";
    return String(base).replace(/\/$/, "");
  }

  function useApi() {
    return !!apiBase();
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizePhone(phone) {
    return String(phone || "").replace(/\s/g, "");
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function apiFetch(path, options) {
    var url = apiBase() + path;
    var opts = options || {};
    opts.headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || (data && data.ok === false)) {
          var msg = (data && data.error) || res.statusText || "Request failed";
          throw new Error(msg);
        }
        return data;
      });
    });
  }

  function applyPlayStatus(data) {
    if (!data) return;
    if (typeof data.left === "number") apiReplaysLeft = data.left;
    if (typeof data.canPlayToday === "boolean") apiCanPlayToday = data.canPlayToday;
    if (typeof data.playLimitReached === "boolean") {
      apiPlayLimitReached = data.playLimitReached;
    }
  }

  function syncReplaysFromApi(phone) {
    if (!useApi() || !phone) return Promise.resolve();
    return apiFetch(
      "/api/leads/status?phone=" + encodeURIComponent(normalizePhone(phone))
    ).then(function (data) {
      applyPlayStatus(data);
    });
  }

  /** Check play limit in MongoDB (lead + daily_plays flags). */
  function checkPlayEligibility(phone) {
    phone = normalizePhone(phone);
    if (!phone) return Promise.resolve({ canPlayToday: false, left: 0 });
    if (!useApi()) {
      return Promise.resolve({
        canPlayToday: getReplaysLeft() > 0,
        left: getReplaysLeft(),
        used: getPlaysUsed(),
        playLimitReached: getReplaysLeft() <= 0
      });
    }
    return apiFetch(
      "/api/leads/status?phone=" + encodeURIComponent(phone)
    ).then(function (data) {
      applyPlayStatus(data);
      return {
        phone: data.phone,
        day: data.day,
        used: data.used,
        left: data.left,
        maxReplays: data.maxReplays || MAX_REPLAYS,
        canPlayToday: !!data.canPlayToday,
        playLimitReached: !!data.playLimitReached
      };
    });
  }

  function init() {
    if (!useApi()) return Promise.resolve();
    if (initPromise) return initPromise;
    var user = getUser();
    initPromise = Promise.all([
      syncReplaysFromApi(user && user.phone),
      refreshBoardFromApi()
    ]).catch(function () {
      /* keep cached values if offline */
    });
    return initPromise;
  }

  function refreshBoardFromApi() {
    if (!useApi()) return Promise.resolve(getBoard());
    return apiFetch("/api/leaderboard?day=" + encodeURIComponent(todayKey()))
      .then(function (data) {
        apiBoardCache = data.board || [];
        return apiBoardCache;
      })
      .catch(function () {
        return getBoard();
      });
  }

  function getUser() {
    return read("airtel_user", null);
  }

  function saveUser(user) {
    write("airtel_user", user);
    if (!useApi()) return Promise.resolve(user);
    return apiFetch("/api/leads", {
      method: "POST",
      body: JSON.stringify({
        name: user.name,
        phone: normalizePhone(user.phone),
        storeId: user.storeId,
        character: user.character || ""
      })
    }).then(function (data) {
      if (data.playStatus) applyPlayStatus(data.playStatus);
      return syncReplaysFromApi(user.phone).then(function () {
        return user;
      });
    });
  }

  function getPlaysUsed() {
    if (useApi() && apiReplaysLeft !== null) {
      return Math.max(0, MAX_REPLAYS - apiReplaysLeft);
    }
    var data = read("airtel_plays", {});
    if (data.day !== todayKey()) return 0;
    return data.used || 0;
  }

  function getReplaysLeft() {
    if (useApi()) {
      if (apiCanPlayToday === false) return 0;
      if (apiReplaysLeft !== null) return apiReplaysLeft;
    }
    return Math.max(0, MAX_REPLAYS - getPlaysUsed());
  }

  function canPlayToday() {
    if (useApi() && apiCanPlayToday !== null) return apiCanPlayToday;
    return getReplaysLeft() > 0;
  }

  function getReplaysLeftAsync() {
    if (!useApi()) return Promise.resolve(getReplaysLeft());
    var user = getUser();
    if (!user || !user.phone) return Promise.resolve(getReplaysLeft());
    return syncReplaysFromApi(user.phone).then(getReplaysLeft);
  }

  function usePlay() {
    var user = getUser();
    if (useApi() && user && user.phone) {
      return apiFetch("/api/plays", {
        method: "POST",
        body: JSON.stringify({ phone: normalizePhone(user.phone), day: todayKey() })
      })
        .then(function (data) {
          applyPlayStatus(data);
          return !!data.ok;
        });
    }
    return Promise.resolve(usePlayLocal());
  }

  function usePlayLocal() {
    var data = read("airtel_plays", {});
    var day = todayKey();
    if (data.day !== day) data = { day: day, used: 0 };
    if (data.used >= MAX_REPLAYS) return false;
    data.used += 1;
    write("airtel_plays", data);
    apiReplaysLeft = Math.max(0, MAX_REPLAYS - data.used);
    apiCanPlayToday = apiReplaysLeft > 0;
    apiPlayLimitReached = !apiCanPlayToday;
    return true;
  }

  function useReplay() {
    return usePlay();
  }

  function resetDailyPlays() {
    write("airtel_plays", { day: todayKey(), used: 0 });
    apiReplaysLeft = MAX_REPLAYS;
    apiCanPlayToday = true;
    apiPlayLimitReached = false;
    var user = getUser();
    if (!useApi() || !user || !user.phone) return Promise.resolve();
    return syncReplaysFromApi(user.phone);
  }

  function getBoard() {
    if (useApi() && apiBoardCache) return apiBoardCache.slice();
    var key = "airtel_board_" + todayKey();
    return read(key, []);
  }

  function getBoardAsync() {
    if (!useApi()) return Promise.resolve(getBoard());
    return refreshBoardFromApi();
  }

  function submitScoreLocal(user, coins, priorityPoints, fastLaneCoins) {
    if (!user) return { entry: null, rank: 0 };
    var board = getBoard();
    var phone = normalizePhone(user.phone);
    var entry = {
      name: user.name,
      phone: phone,
      storeId: user.storeId,
      coins: coins,
      priorityPoints: priorityPoints,
      fastLaneCoins: fastLaneCoins,
      total: coins + fastLaneCoins,
      ts: Date.now()
    };
    board.push(entry);
    board.sort(function (a, b) {
      return (
        (b.priorityPoints || 0) - (a.priorityPoints || 0) ||
        b.total - a.total ||
        b.coins - a.coins ||
        a.ts - b.ts
      );
    });
    var rank = board.indexOf(entry) + 1;
    if (rank < 1) {
      for (var i = 0; i < board.length; i++) {
        if (board[i].ts === entry.ts && board[i].phone === phone) {
          rank = i + 1;
          break;
        }
      }
    }
    write("airtel_board_" + todayKey(), board.slice(0, 50));
    apiBoardCache = board.slice(0, 50);
    return { entry: entry, rank: rank };
  }

  function submitScore(user, coins, priorityPoints, fastLaneCoins, extra) {
    if (!user) return Promise.resolve({ entry: null, rank: 0 });
    extra = extra || {};
    if (useApi()) {
      return apiFetch("/api/scores", {
        method: "POST",
        body: JSON.stringify({
          name: user.name,
          phone: normalizePhone(user.phone),
          storeId: user.storeId,
          coins: coins,
          priorityPoints: priorityPoints,
          fastLaneCoins: fastLaneCoins,
          lettersCollected: extra.lettersCollected,
          fastLaneUnlocked: extra.fastLaneUnlocked,
          reason: extra.reason,
          day: todayKey()
        })
      })
        .then(function (data) {
          apiBoardCache = data.board || [];
          return { entry: data.entry, rank: data.rank || 0 };
        })
        .catch(function () {
          return submitScoreLocal(user, coins, priorityPoints, fastLaneCoins);
        });
    }
    return Promise.resolve(
      submitScoreLocal(user, coins, priorityPoints, fastLaneCoins)
    );
  }

  function getUserRank(phone) {
    phone = normalizePhone(phone);
    if (!phone) return null;
    var board = getBoard();
    var best = null;
    for (var i = 0; i < board.length; i++) {
      if (normalizePhone(board[i].phone) === phone) {
        var r = i + 1;
        if (best === null || r < best) best = r;
      }
    }
    return best;
  }

  function getUserRankAsync(phone) {
    if (!useApi()) return Promise.resolve(getUserRank(phone));
    return apiFetch(
      "/api/leaderboard?phone=" +
        encodeURIComponent(normalizePhone(phone)) +
        "&day=" +
        encodeURIComponent(todayKey())
    )
      .then(function (data) {
        return data.rank || null;
      })
      .catch(function () {
        return getUserRank(phone);
      });
  }

  function getDailyWinner() {
    var board = getBoard();
    return board.length ? board[0] : null;
  }

  global.AirtelStorage = {
    LETTERS: LETTERS,
    MAX_REPLAYS: MAX_REPLAYS,
    useApi: useApi,
    init: init,
    getUser: getUser,
    saveUser: saveUser,
    checkPlayEligibility: checkPlayEligibility,
    canPlayToday: canPlayToday,
    getReplaysLeft: getReplaysLeft,
    getReplaysLeftAsync: getReplaysLeftAsync,
    getPlaysUsed: getPlaysUsed,
    usePlay: usePlay,
    useReplay: useReplay,
    resetDailyPlays: resetDailyPlays,
    getBoard: getBoard,
    getBoardAsync: getBoardAsync,
    submitScore: submitScore,
    getUserRank: getUserRank,
    getUserRankAsync: getUserRankAsync,
    getDailyWinner: getDailyWinner,
    todayKey: todayKey
  };
})(window);
