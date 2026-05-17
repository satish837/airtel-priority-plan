(function (global) {
  "use strict";

  var LETTERS = ["P", "R", "I", "O", "R", "I", "T", "Y"];
  var UNLIMITED_PLAYS = true;
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
    if (UNLIMITED_PLAYS) return 9999;
    return Math.max(0, MAX_REPLAYS - getPlaysUsed());
  }

  function usePlay() {
    if (UNLIMITED_PLAYS) return true;
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

  function getBoard() {
    var key = "airtel_board_" + todayKey();
    return read(key, []);
  }

  function submitScore(user, coins, priorityPoints, fastLaneCoins) {
    var board = getBoard();
    var entry = {
      name: user.name,
      phone: user.phone,
      storeId: user.storeId,
      coins: coins,
      priorityPoints: priorityPoints,
      fastLaneCoins: fastLaneCoins,
      total: coins + fastLaneCoins,
      ts: Date.now()
    };
    board.push(entry);
    board.sort(function (a, b) {
      return b.total - a.total || b.coins - a.coins || a.ts - b.ts;
    });
    write("airtel_board_" + todayKey(), board.slice(0, 50));
    return entry;
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
    usePlay: usePlay,
    useReplay: useReplay,
    getBoard: getBoard,
    submitScore: submitScore,
    getDailyWinner: getDailyWinner,
    todayKey: todayKey
  };
})(window);
