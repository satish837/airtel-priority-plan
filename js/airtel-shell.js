(function () {
  "use strict";

  var LETTERS = AirtelStorage.LETTERS;
  var frame = document.getElementById("game-frame");
  var runHud = document.getElementById("run-hud");
  var fastlaneGlow = document.getElementById("fastlane-glow");
  var gameReady = false;
  var gameLoaded = false;
  var sessionStarted = false;
  var pendingSession = false;
  var runEnded = false;
  var scoreSubmittedThisRun = false;
  var gameFrameBase = frame
    ? frame.getAttribute("src").split("#")[0].split("?")[0] +
      "?origin=https%3A%2F%2Fgamesnacks.com&gameCenterId=gamesnacks"
    : "game/index.html?origin=https%3A%2F%2Fgamesnacks.com&gameCenterId=gamesnacks";

  function $(id) {
    return document.getElementById(id);
  }

  function defaultCharacterKey() {
    return window.AIRTEL_CHARACTER || "SuperNom";
  }

  function sessionPayload() {
    var user = AirtelStorage.getUser() || {};
    return {
      type: "airtel:start-session",
      user: user,
      character: defaultCharacterKey()
    };
  }

  function resetRunHud() {
    if (!$("hud-phase") || !$("hud-timer") || !$("hud-coins")) return;
    $("hud-phase").textContent = "Collect PRIORITY";
    $("hud-timer").textContent = "";
    $("hud-timer").classList.add("hidden");
    $("hud-coins").textContent = "0";
  }

  function setFastLaneGlow(active) {
    var shell = document.getElementById("shell");
    if (fastlaneGlow) {
      if (active) {
        fastlaneGlow.classList.add("active");
        fastlaneGlow.classList.remove("hidden");
        fastlaneGlow.setAttribute("aria-hidden", "false");
      } else {
        fastlaneGlow.classList.remove("active");
        fastlaneGlow.classList.add("hidden");
        fastlaneGlow.setAttribute("aria-hidden", "true");
      }
    }
    if (shell) {
      shell.classList.toggle("fastlane-active", !!active);
    }
    try {
      document.documentElement.classList.toggle("airtel-fastlane-active", !!active);
    } catch (e) {}
  }

  function showShellTryAgain(show) {
    var btn = $("shell-try-again");
    if (!btn) return;
    btn.classList.toggle("hidden", !show);
    btn.setAttribute("aria-hidden", show ? "false" : "true");
  }

  function hideRunHud() {
    runEnded = true;
    showShellTryAgain(false);
    setFastLaneGlow(false);
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
        (row.priorityPoints != null ? row.priorityPoints : row.total) +
        " pts</span>";
      list.appendChild(li);
    });
    var w = AirtelStorage.getDailyWinner();
    $("daily-winner").textContent = w
      ? "Today's winner: " + w.name
      : "Today's winner: xx";
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function updateReplays() {
    var el = $("replays-left");
    if (!el) return;
    var left = AirtelStorage.getReplaysLeft();
    if (left <= 0) {
      el.textContent = "No attempts left today";
      el.hidden = false;
    } else {
      el.textContent =
        left === 1 ? "1 attempt left today" : left + " attempts left today";
      el.hidden = false;
    }
  }

  function chancesLeftText(n) {
    if (n <= 0) return "You have no more chances left.";
    if (n === 1) return "You have 1 more chance left.";
    return "You have " + n + " more chances left.";
  }

  function setGameFrameVisible(visible) {
    if (!frame) return;
    frame.classList.toggle("game-over-hidden", !visible);
  }

  function beginPlayUi() {
    runEnded = false;
    scoreSubmittedThisRun = false;
    showShellTryAgain(false);
    sessionStarted = true;
    pendingSession = false;
    setFastLaneGlow(false);
    setGameFrameVisible(true);
    showPanel(null);
    renderLetters([]);
    resetRunHud();
    postToGame(sessionPayload());
    /* One retry if the iframe was not ready on first post */
    setTimeout(function () {
      postToGame(sessionPayload());
    }, 600);
  }

  function startSession() {
    if (AirtelStorage.getReplaysLeft() <= 0) {
      $("register-error").textContent =
        "No plays left today. Try again tomorrow!";
      return;
    }
    if (!AirtelStorage.usePlay()) {
      $("register-error").textContent =
        "No plays left today. Try again tomorrow!";
      updateReplays();
      return;
    }
    pendingSession = true;
    $("register-error").textContent = "";
    $("btn-start-register").disabled = false;
    updateReplays();
    AirtelStorage.saveUser({
      name: $("reg-name").value.trim(),
      phone: $("reg-phone").value.trim().replace(/\s/g, ""),
      storeId: $("reg-store").value.trim(),
      character: defaultCharacterKey()
    });
    beginPlayUi();
    if (!gameLoaded) {
      $("register-error").textContent = "Game loading…";
    }
  }

  function resolveRank(submitted, user) {
    if (submitted && typeof submitted.rank === "number" && submitted.rank > 0) {
      return submitted.rank;
    }
    if (user && user.phone) {
      return AirtelStorage.getUserRank(user.phone) || 0;
    }
    return 0;
  }

  function showGameOver(data) {
    if (!data) return;
    hideRunHud();
    postToGame({ type: "airtel:stop-letters" });
    sessionStarted = false;
    setGameFrameVisible(false);
    var user = AirtelStorage.getUser();
    var rank = 0;
    if (user && !scoreSubmittedThisRun) {
      scoreSubmittedThisRun = true;
      var submitted = AirtelStorage.submitScore(
        user,
        data.coins || 0,
        data.priorityPoints || 0,
        data.fastLaneCoins || 0
      );
      rank = resolveRank(submitted, user);
    } else if (user) {
      rank = AirtelStorage.getUserRank(user.phone) || 0;
    }
    renderBoard();
    updateReplays();
    $("go-title").textContent =
      data.reason === "complete" ? "Challenge Complete!" : "Game Over";
    $("go-priority-score").textContent = data.priorityPoints || 0;
    var left = AirtelStorage.getReplaysLeft();
    $("go-rank-msg").textContent =
      "You rank #" +
      (rank > 0 ? rank : "—") +
      " on the leaderboard. " +
      chancesLeftText(left);
    var allPriority =
      (data.lettersCollected || 0) >= LETTERS.length || !!data.fastLaneUnlocked;
    var unlockEl = $("go-unlock-msg");
    if (unlockEl) {
      unlockEl.classList.toggle("hidden", !allPriority);
      unlockEl.setAttribute("aria-hidden", allPriority ? "false" : "true");
    }
    var playAgain = $("btn-play-again");
    if (playAgain) playAgain.disabled = left <= 0;
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
        if (runEnded || !sessionStarted || e.data.phase === "ended") {
          hideRunHud();
          break;
        }
        refreshRunHud();
        renderLetters(e.data.collected);
        $("hud-coins").textContent = String(e.data.coins || 0);
        if (e.data.phase === "fastlane") {
          setFastLaneGlow(true);
          $("hud-phase").textContent = "FAST LANE";
          $("hud-timer").classList.remove("hidden");
          $("hud-timer").textContent = Math.ceil(e.data.fastLaneRemain || 0) + "s";
        } else {
          setFastLaneGlow(false);
          $("hud-phase").textContent = "Collect PRIORITY";
          var sessionLeft = Math.ceil(e.data.sessionRemain || 0);
          if (sessionLeft > 0) {
            $("hud-timer").classList.remove("hidden");
            $("hud-timer").textContent = sessionLeft + "s";
          } else {
            $("hud-timer").classList.add("hidden");
          }
        }
        break;
      case "airtel:flash":
        if ((e.data.message || "").indexOf("Fast Lane") >= 0) {
          setFastLaneGlow(true);
        }
        $("hud-phase").textContent = e.data.message || "Fast Lane Unlocked!";
        setTimeout(function () {
          if (sessionStarted && !runEnded) {
            $("hud-phase").textContent = "FAST LANE";
            setFastLaneGlow(true);
          }
        }, 2500);
        break;
      case "airtel:mission-fail":
        runEnded = false;
        sessionStarted = true;
        setGameFrameVisible(true);
        showPanel(null);
        showShellTryAgain(true);
        if (runHud) {
          runHud.classList.remove("hidden");
          runHud.setAttribute("aria-hidden", "false");
        }
        refreshRunHud();
        break;
      case "airtel:request-retry":
        retryCurrentRun();
        break;
      case "airtel:try-again":
        runEnded = false;
        sessionStarted = true;
        showShellTryAgain(false);
        refreshRunHud();
        break;
      case "airtel:gameover":
        runEnded = true;
        showGameOver(e.data);
        break;
    }
  });

  function retryCurrentRun() {
    showShellTryAgain(false);
    runEnded = false;
    sessionStarted = true;
    setGameFrameVisible(true);
    showPanel(null);
    reloadGameFrame(function () {
      beginPlayUi();
      setTimeout(function () {
        postToGame(sessionPayload());
      }, 1200);
      setTimeout(function () {
        postToGame(sessionPayload());
      }, 2800);
      setTimeout(function () {
        postToGame(sessionPayload());
      }, 5000);
    });
  }

  var shellTryAgain = $("shell-try-again");
  if (shellTryAgain) {
    shellTryAgain.addEventListener("click", retryCurrentRun);
  }

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
    if (AirtelStorage.getReplaysLeft() <= 0) return;
    if (!AirtelStorage.usePlay()) {
      updateReplays();
      return;
    }
    updateReplays();
    reloadGameFrame(function () {
      beginPlayUi();
      /* Extra start-session posts after iframe boot (Play Again) */
      setTimeout(function () {
        postToGame(sessionPayload());
      }, 1200);
      setTimeout(function () {
        postToGame(sessionPayload());
      }, 2800);
      setTimeout(function () {
        postToGame(sessionPayload());
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
