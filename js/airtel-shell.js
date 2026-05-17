(function () {
  "use strict";

  var PROMO = [
    "Priority Postpaid — skip the queue with exclusive benefits.",
    "Upgrade to Airtel Priority Postpaid for faster data & VIP support.",
    "Priority members get premium OTT, roaming packs & more.",
    "Your lane just got faster — imagine that with Priority Postpaid!"
  ];

  var LETTERS = AirtelStorage.LETTERS;
  var frame = document.getElementById("game-frame");
  var runHud = document.getElementById("run-hud");
  var gameReady = false;
  var gameLoaded = false;
  var sessionStarted = false;
  var pendingSession = false;
  var runEnded = false;
  var gameFrameBase = frame
    ? frame.getAttribute("src").split("#")[0].split("?")[0] +
      "?origin=https%3A%2F%2Fgamesnacks.com&gameCenterId=gamesnacks"
    : "game/index.html?origin=https%3A%2F%2Fgamesnacks.com&gameCenterId=gamesnacks";

  function $(id) {
    return document.getElementById(id);
  }

  function resetRunHud() {
    if (!$("hud-phase") || !$("hud-timer") || !$("hud-coins")) return;
    $("hud-phase").textContent = "Collect PRIORITY";
    $("hud-timer").textContent = "";
    $("hud-timer").classList.add("hidden");
    $("hud-coins").textContent = "0";
  }

  function hideRunHud() {
    runEnded = true;
    if (!runHud) return;
    resetRunHud();
    renderLetters([]);
    runHud.classList.add("hidden");
    runHud.setAttribute("aria-hidden", "true");
  }

  function refreshRunHud() {
    if (!runHud) return;
    if (runEnded) {
      runHud.classList.add("hidden");
      runHud.setAttribute("aria-hidden", "true");
      return;
    }
    var panelActive = document.querySelector(".panel.panel-active");
    var onOverlay =
      panelActive &&
      panelActive.id !== undefined &&
      panelActive.id !== "";
    var playing = sessionStarted && !onOverlay;
    runHud.classList.toggle("hidden", !playing);
    runHud.setAttribute("aria-hidden", playing ? "false" : "true");
  }

  function showPanel(id) {
    document.querySelectorAll(".panel").forEach(function (p) {
      p.classList.toggle("panel-active", p.id === id);
    });
    refreshRunHud();
  }

  function postToGame(msg) {
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage(msg, "*");
    }
  }

  function renderLetters(collected) {
    var track = $("letter-track");
    if (!track) return;
    track.innerHTML = "";
    LETTERS.forEach(function (ch, i) {
      var el = document.createElement("span");
      el.className = "letter-slot" + (collected && collected[i] ? " done" : "");
      el.textContent = ch;
      track.appendChild(el);
    });
  }

  function renderBoard() {
    var list = $("leaderboard-list");
    var board = AirtelStorage.getBoard();
    list.innerHTML = "";
    if (!board.length) {
      list.innerHTML = "<li>No scores yet today. Be the first!</li>";
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
    var w = AirtelStorage.getDailyWinner();
    $("daily-winner").textContent = w
      ? "Today's leader: " + w.name + " (" + w.total + " coins)"
      : "";
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function updateReplays() {
    var el = $("replays-left");
    if (el) el.style.display = "none";
  }

  function setGameFrameVisible(visible) {
    if (!frame) return;
    frame.classList.toggle("game-over-hidden", !visible);
  }

  function beginPlayUi() {
    runEnded = false;
    sessionStarted = true;
    pendingSession = false;
    setGameFrameVisible(true);
    showPanel(null);
    renderLetters([]);
    resetRunHud();
    postToGame({ type: "airtel:start-session", user: AirtelStorage.getUser() });
    /* One retry if the iframe was not ready on first post */
    setTimeout(function () {
      postToGame({ type: "airtel:start-session", user: AirtelStorage.getUser() });
    }, 600);
  }

  function startSession() {
    pendingSession = true;
    $("register-error").textContent = "";
    $("btn-start-register").disabled = false;
    AirtelStorage.saveUser({
      name: $("reg-name").value.trim(),
      phone: $("reg-phone").value.trim(),
      storeId: $("reg-store").value.trim()
    });
    beginPlayUi();
    if (!gameLoaded) {
      $("register-error").textContent = "Game loading…";
    }
  }

  function showGameOver(data) {
    if (!data) return;
    hideRunHud();
    postToGame({ type: "airtel:stop-letters" });
    sessionStarted = false;
    setGameFrameVisible(false);
    var user = AirtelStorage.getUser();
    if (user) {
      AirtelStorage.submitScore(
        user,
        data.coins || 0,
        data.priorityPoints || 0,
        data.fastLaneCoins || 0
      );
    }
    renderBoard();
    $("go-title").textContent =
      data.reason === "complete" ? "Challenge Complete!" : "Game Over";
    $("go-coins").textContent = (data.coins || 0) + (data.fastLaneCoins || 0);
    $("go-priority").textContent = data.priorityPoints || 0;
    $("go-letters").textContent = (data.lettersCollected || 0) + " / 8";
    $("go-fastlane").textContent = data.fastLaneUnlocked
      ? "Yes — Nitro unlocked!"
      : "Not yet";
    $("promo-nugget").textContent = PROMO[Math.floor(Math.random() * PROMO.length)];
    $("replay-msg").textContent = "";
    showPanel("panel-gameover");
  }

  window.addEventListener("message", function (e) {
    if (!e.data || typeof e.data.type !== "string") return;
    if (e.data.type.indexOf("airtel:") !== 0) return;
    if (frame && frame.contentWindow && e.source && e.source !== frame.contentWindow) {
      return;
    }

    switch (e.data.type) {
      case "airtel:ready":
        gameReady = true;
        if (sessionStarted) {
          gameLoaded = true;
          refreshRunHud();
        }
        break;
      case "airtel:loaded":
        gameLoaded = true;
        $("btn-start-register").disabled = false;
        if (sessionStarted) {
          $("register-error").textContent = "";
          refreshRunHud();
          renderLetters(e.data.collected || []);
        }
        break;
      case "airtel:session-end":
        hideRunHud();
        break;
      case "airtel:hud":
        if (runEnded || e.data.phase === "ended") {
          hideRunHud();
          break;
        }
        refreshRunHud();
        renderLetters(e.data.collected);
        $("hud-coins").textContent = String(e.data.coins || 0);
        if (e.data.phase === "fastlane") {
          $("hud-phase").textContent = "FAST LANE";
          $("hud-timer").classList.remove("hidden");
          $("hud-timer").textContent = Math.ceil(e.data.fastLaneRemain || 0) + "s";
        } else {
          $("hud-phase").textContent = "Collect PRIORITY";
          $("hud-timer").classList.add("hidden");
        }
        break;
      case "airtel:flash":
        $("hud-phase").textContent = e.data.message || "Fast Lane Unlocked!";
        setTimeout(function () {
          if (sessionStarted) $("hud-phase").textContent = "FAST LANE";
        }, 2500);
        break;
      case "airtel:gameover":
        showGameOver(e.data);
        break;
    }
  });

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
    updateReplays();
    startSession();
  });

  function reloadGameFrame(done) {
    if (!frame) {
      if (done) done();
      return;
    }
    gameLoaded = false;
    gameReady = false;
    function onLoad() {
      frame.removeEventListener("load", onLoad);
      if (done) done();
    }
    frame.addEventListener("load", onLoad);
    frame.src = "about:blank";
    setTimeout(function () {
      frame.src = gameFrameBase + "&_=" + Date.now();
    }, 60);
  }

  $("btn-play-again").addEventListener("click", function () {
    updateReplays();
    reloadGameFrame(function () {
      beginPlayUi();
      /* Extra start-session posts after iframe boot (Play Again) */
      setTimeout(function () {
        postToGame({ type: "airtel:start-session", user: AirtelStorage.getUser() });
      }, 1200);
      setTimeout(function () {
        postToGame({ type: "airtel:start-session", user: AirtelStorage.getUser() });
      }, 2800);
      setTimeout(function () {
        postToGame({ type: "airtel:start-session", user: AirtelStorage.getUser() });
      }, 5000);
    });
  });

  $("btn-show-leaderboard").addEventListener("click", function () {
    renderBoard();
    showPanel("panel-leaderboard");
  });
  $("btn-go-leaderboard").addEventListener("click", function () {
    renderBoard();
    showPanel("panel-leaderboard");
  });
  $("btn-back-home").addEventListener("click", function () {
    showPanel("panel-register");
  });
  $("btn-back-register").addEventListener("click", function () {
    sessionStarted = false;
    showPanel("panel-register");
  });

  var user = AirtelStorage.getUser();
  if (user) {
    $("reg-name").value = user.name;
    $("reg-phone").value = user.phone;
    $("reg-store").value = user.storeId;
  }
  updateReplays();
  showPanel("panel-register");

  /* Fallback if iframe never posts airtel:loaded */
  setTimeout(function () {
    if (!gameLoaded) {
      gameLoaded = true;
      if (sessionStarted) $("register-error").textContent = "";
    }
  }, 12000);

  setTimeout(function () {
    $("airtel-splash").classList.add("hide");
  }, 2000);
})();
