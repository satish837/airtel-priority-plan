(function (global) {
  "use strict";

  var LETTERS = ["P", "R", "I", "O", "R", "I", "T", "Y"];
  var MAX_REPLAYS = 3;

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
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

  function getUser() {
    return read("airtel_user", null);
  }

  function saveUser(user) {
    write("airtel_user", user);
  }

  function getPlaysUsed() {
    var data = read("airtel_plays", {});
    if (data.day !== todayKey()) return 0;
    return data.used || 0;
  }

  function getReplaysLeft() {
    return Math.max(0, MAX_REPLAYS - getPlaysUsed());
  }

  function usePlay() {
    var data = read("airtel_plays", {});
    var day = todayKey();
    if (data.day !== day) data = { day: day, used: 0 };
    if (data.used >= MAX_REPLAYS) return false;
    data.used += 1;
    write("airtel_plays", data);
    return true;
  }

  function useReplay() {
    return usePlay();
  }

  function resetDailyPlays() {
    write("airtel_plays", { day: todayKey(), used: 0 });
  }

  function getBoard() {
    var key = "airtel_board_" + todayKey();
    return read(key, []);
  }

  function submitScore(user, coins, priorityPoints, fastLaneCoins) {
    if (!user) return { entry: null, rank: 0 };
    var board = getBoard();
    var phone = String(user.phone || "").replace(/\s/g, "");
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
    return { entry: entry, rank: rank };
  }

  function getUserRank(phone) {
    phone = String(phone || "").replace(/\s/g, "");
    if (!phone) return null;
    var board = getBoard();
    var best = null;
    for (var i = 0; i < board.length; i++) {
      var rowPhone = String(board[i].phone || "").replace(/\s/g, "");
      if (rowPhone === phone) {
        var r = i + 1;
        if (best === null || r < best) best = r;
      }
    }
    return best;
  }

  function getDailyWinner() {
    var board = getBoard();
    return board.length ? board[0] : null;
  }

  global.AirtelStorage = {
    LETTERS: LETTERS,
    MAX_REPLAYS: MAX_REPLAYS,
    getUser: getUser,
    saveUser: saveUser,
    getReplaysLeft: getReplaysLeft,
    getPlaysUsed: getPlaysUsed,
    usePlay: usePlay,
    useReplay: useReplay,
    resetDailyPlays: resetDailyPlays,
    getBoard: getBoard,
    submitScore: submitScore,
    getUserRank: getUserRank,
    getDailyWinner: getDailyWinner,
    todayKey: todayKey
  };
})(window);
