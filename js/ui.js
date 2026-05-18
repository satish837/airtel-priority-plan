(function (global) {
  "use strict";

  var PROMO_NUGGETS = [
    "Priority Postpaid — skip the queue with exclusive benefits.",
    "Upgrade to Airtel Priority Postpaid for faster data & VIP support.",
    "Priority members get premium OTT, roaming packs & more.",
    "Your lane just got faster — imagine that with Priority Postpaid!",
    "Collect coins, collect perks — Priority Postpaid awaits."
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.dataset.screen === name);
    });
  }

  function renderLetterTrack(collected) {
    var track = $("letter-track");
    if (!track) return;
    track.innerHTML = "";
    AirtelStorage.LETTERS.forEach(function (ch, i) {
      var span = document.createElement("span");
      span.className = "letter-slot" + (collected[i] ? " done" : "");
      span.textContent = ch;
      track.appendChild(span);
    });
  }

  function renderBoard() {
    var list = $("leaderboard-list");
    var board = AirtelStorage.getBoard();
    list.innerHTML = "";
    if (!board.length) {
      list.innerHTML = '<li class="empty">No scores yet today. Be the first!</li>';
      return;
    }
    board.forEach(function (row, i) {
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="rank">' +
        (i + 1) +
        '</span><span class="name">' +
        escapeHtml(row.name) +
        '</span><span class="score">' +
        row.total +
        " coins</span>";
      list.appendChild(li);
    });
    var winner = AirtelStorage.getDailyWinner();
    if (winner) {
      $("daily-winner").textContent = "Today's winner: " + winner.name;
    }
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function randomPromo() {
    return PROMO_NUGGETS[Math.floor(Math.random() * PROMO_NUGGETS.length)];
  }

  function AirtelUI(app) {
    this.app = app;
    this.bindForms();
    renderBoard();
    var user = AirtelStorage.getUser();
    if (user) {
      $("reg-name").value = user.name;
      $("reg-phone").value = user.phone;
      $("reg-store").value = user.storeId;
    }
    updateReplays();
  }

  AirtelUI.prototype.bindForms = function () {
    var self = this;

    $("btn-start-register").addEventListener("click", function () {
      var name = $("reg-name").value.trim();
      var phone = $("reg-phone").value.trim();
      var storeId = $("reg-store").value.trim();
      if (!name || !phone || !storeId) {
        $("register-error").textContent = "Please fill in all fields.";
        return;
      }
      if (!/^\d{10}$/.test(phone.replace(/\s/g, ""))) {
        $("register-error").textContent = "Enter a valid 10-digit phone number.";
        return;
      }
      $("register-error").textContent = "";
      if (AirtelStorage.getReplaysLeft() <= 0) {
        $("register-error").textContent = "No plays left today. Come back tomorrow!";
        return;
      }
      var consumePlay = AirtelStorage.usePlay || AirtelStorage.useReplay;
      if (!consumePlay || !consumePlay()) return;
      AirtelStorage.saveUser({ name: name, phone: phone, storeId: storeId });
      updateReplays();
      self.app.startGame();
    });

    $("btn-play-again").addEventListener("click", function () {
      if (AirtelStorage.getReplaysLeft() <= 0) {
        $("replay-msg").textContent = "No plays left today. Try again tomorrow!";
        return;
      }
      var consumePlay = AirtelStorage.usePlay || AirtelStorage.useReplay;
      if (!consumePlay || !consumePlay()) return;
      updateReplays();
      self.app.startGame();
    });

    $("btn-leaderboard").addEventListener("click", function () {
      renderBoard();
      showScreen("leaderboard");
    });

    $("btn-back-home").addEventListener("click", function () {
      showScreen("register");
    });

    $("btn-back-gameover").addEventListener("click", function () {
      showScreen("register");
    });

    document.querySelectorAll("[data-goto]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showScreen(btn.dataset.goto);
      });
    });

    $("btn-controls-left").addEventListener("click", function () {
      if (self.app.game) self.app.game._laneLeft();
    });
    $("btn-controls-right").addEventListener("click", function () {
      if (self.app.game) self.app.game._laneRight();
    });
    $("btn-controls-jump").addEventListener("click", function () {
      if (self.app.game) self.app.game._jump();
    });
    $("btn-controls-slide").addEventListener("click", function () {
      if (self.app.game) self.app.game._slide();
    });
  };

  AirtelUI.prototype.showRegister = function () {
    showScreen("register");
    updateReplays();
  };

  AirtelUI.prototype.showGame = function () {
    showScreen("game");
    renderLetterTrack([]);
    $("hud-coins").textContent = "0";
    $("hud-lives").textContent = "♥♥♥";
    $("hud-phase").textContent = "Collect PRIORITY";
    $("hud-timer").classList.add("hidden");
  };

  AirtelUI.prototype.updateHud = function (state) {
    renderLetterTrack(state.collected);
    $("hud-coins").textContent = String(state.coins + state.fastLaneCoins);
    var hearts = "";
    for (var i = 0; i < state.lives; i++) hearts += "♥";
    $("hud-lives").textContent = hearts || "—";
    if (state.phase === "fastlane") {
      $("hud-phase").textContent = "FAST LANE";
      $("hud-timer").classList.remove("hidden");
      $("hud-timer").textContent = Math.ceil(state.fastLaneRemain) + "s";
    } else {
      $("hud-phase").textContent = "Collect PRIORITY";
      $("hud-timer").classList.add("hidden");
    }
  };

  AirtelUI.prototype.showGameOver = function (result) {
    var user = AirtelStorage.getUser();
    AirtelStorage.submitScore(
      user,
      result.coins,
      result.priorityPoints,
      result.fastLaneCoins
    );
    renderBoard();

    $("go-title").textContent =
      result.reason === "complete" ? "Challenge Complete!" : "Game Over";
    $("go-coins").textContent = result.coins + result.fastLaneCoins;
    $("go-priority").textContent = result.priorityPoints;
    $("go-fastlane").textContent = result.fastLaneUnlocked ? "Yes — Nitro unlocked!" : "Not yet";
    $("promo-nugget").textContent = randomPromo();
    $("replay-msg").textContent =
      AirtelStorage.getReplaysLeft() > 0
        ? AirtelStorage.getReplaysLeft() + " replay(s) left today"
        : "No replays remaining today";

    var collected = result.collected.filter(Boolean).length;
    $("go-letters").textContent = collected + " / 8";

    showScreen("gameover");
  };

  function updateReplays() {
    var el = $("replays-left");
    if (el) el.textContent = AirtelStorage.getReplaysLeft() + " plays left today";
  }

  global.AirtelUI = AirtelUI;
  global.showScreen = showScreen;
})(window);
