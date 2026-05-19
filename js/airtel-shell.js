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
  var countdownTimer = null;
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

  function setFastLaneBanner(active, message) {
    var banner = $("fastlane-banner");
    if (!banner) return;
    if (message) banner.textContent = message;
    banner.classList.toggle("hidden", !active);
    banner.setAttribute("aria-hidden", active ? "false" : "true");
  }

  function setFastLaneGlow(active) {
    setFastLaneBanner(active, "Fast Lane Unlocked!");
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
    hideRunCountdown();
    showShellTryAgain(false);
    setFastLaneBanner(false);
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

  function renderBoardWithRows(board) {
    var list = $("leaderboard-list");
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
    var w = board.length ? board[0] : null;
    $("daily-winner").textContent = w
      ? "Today's winner: " + w.name
      : "Today's winner: xx";
  }

  function renderBoard() {
    var list = $("leaderboard-list");
    if (list) {
      list.innerHTML =
        "<li>Loading leaderboard from database…</li>";
    }
    var chain = Promise.resolve();
    if (
      AirtelStorage.useApi &&
      AirtelStorage.useApi() &&
      AirtelStorage.flushPendingScores
    ) {
      chain = AirtelStorage.flushPendingScores();
    }
    chain
      .then(function () {
        return AirtelStorage.getBoardAsync();
      })
      .then(function (board) {
        renderBoardWithRows(board || []);
      })
      .catch(function () {
        if (list) {
          list.innerHTML =
            "<li>Could not load leaderboard. Check connection and try again.</li>";
        }
        $("daily-winner").textContent = "Today's winner: —";
      });
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function setStartButtonEnabled(enabled) {
    var btn = $("btn-start-register");
    if (btn) btn.disabled = !enabled;
  }

  function updateReplays(phone) {
    var el = $("replays-left");
    var check = phone
      ? AirtelStorage.checkPlayEligibility(phone.replace(/\s/g, ""))
      : AirtelStorage.getReplaysLeftAsync().then(function (left) {
          return { left: left, canPlayToday: left > 0 };
        });
    check.then(function (status) {
      var left = status.left != null ? status.left : 0;
      if (el) {
        if (left <= 0 || status.canPlayToday === false) {
          el.textContent = "No attempts left today";
        } else {
          el.textContent =
            left === 1 ? "1 attempt left today" : left + " attempts left today";
        }
        el.hidden = false;
      }
      setStartButtonEnabled(status.canPlayToday !== false && left > 0);
    });
  }

  function checkPhonePlayLimit() {
    var phone = ($("reg-phone") && $("reg-phone").value.trim()) || "";
    phone = phone.replace(/\s/g, "");
    if (!/^\d{10}$/.test(phone)) {
      $("register-error").textContent = "";
      setStartButtonEnabled(true);
      return;
    }
    if (!AirtelStorage.useApi()) {
      updateReplays();
      return;
    }
    AirtelStorage.checkPlayEligibility(phone)
      .then(function (status) {
        updateReplays(phone);
        if (!status.canPlayToday) {
          $("register-error").textContent =
            "This number has used all " +
            AirtelStorage.MAX_REPLAYS +
            " plays today. Try again tomorrow.";
        } else if (!$("register-error").textContent) {
          $("register-error").textContent = "";
        }
      })
      .catch(function () {
        $("register-error").textContent =
          "Could not verify play limit. Is the API running?";
        setStartButtonEnabled(false);
      });
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

  function hideRunCountdown() {
    var overlay = $("run-countdown");
    if (overlay) {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }
    if (countdownTimer) {
      clearTimeout(countdownTimer);
      countdownTimer = null;
    }
  }

  function runStartCountdown(done) {
    var overlay = $("run-countdown");
    var numEl = $("run-countdown-num");
    if (!overlay || !numEl) {
      if (done) done();
      return;
    }
    hideRunCountdown();
    showPanel(null);
    setGameFrameVisible(true);
    showShellTryAgain(false);
    var steps = [3, 2, 1];
    var step = 0;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");

    function tick() {
      if (step >= steps.length) {
        hideRunCountdown();
        if (done) done();
        return;
      }
      numEl.textContent = String(steps[step]);
      numEl.classList.remove("countdown-bump");
      void numEl.offsetWidth;
      numEl.classList.add("countdown-bump");
      step += 1;
      countdownTimer = setTimeout(tick, 1000);
    }

    tick();
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
    var user = {
      name: $("reg-name").value.trim(),
      phone: $("reg-phone").value.trim().replace(/\s/g, ""),
      storeId: $("reg-store").value.trim(),
      character: defaultCharacterKey()
    };
    $("btn-start-register").disabled = true;
    $("register-error").textContent = "";

    AirtelStorage.checkPlayEligibility(user.phone)
      .then(function (status) {
        if (!status.canPlayToday || status.left <= 0) {
          throw new Error("NO_PLAYS");
        }
        return AirtelStorage.saveUser(user);
      })
      .then(function () {
        return AirtelStorage.usePlay();
      })
      .then(function (ok) {
        if (!ok) throw new Error("NO_PLAYS");
        pendingSession = true;
        updateReplays();
        runStartCountdown(function () {
          $("btn-start-register").disabled = false;
          beginPlayUi();
          if (!gameLoaded) {
            $("register-error").textContent = "Game loading…";
          }
        });
      })
      .catch(function (err) {
        $("btn-start-register").disabled = false;
        if (err && err.message === "NO_PLAYS") {
          $("register-error").textContent =
            "No plays left today. Try again tomorrow!";
        } else if (AirtelStorage.useApi()) {
          $("register-error").textContent =
            "Could not connect to server. Check API and try again.";
        } else {
          $("register-error").textContent =
            "No plays left today. Try again tomorrow!";
        }
        updateReplays();
      });
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
    var rankPromise;
    if (user && !scoreSubmittedThisRun) {
      scoreSubmittedThisRun = true;
      rankPromise = AirtelStorage.submitScore(
        user,
        data.coins || 0,
        data.priorityPoints || 0,
        data.fastLaneCoins || 0,
        {
          lettersCollected: data.lettersCollected,
          fastLaneUnlocked: data.fastLaneUnlocked,
          reason: data.reason
        }
      ).then(function (submitted) {
        return resolveRank(submitted, user);
      });
    } else if (user) {
      rankPromise = AirtelStorage.getUserRankAsync(user.phone).then(function (r) {
        return r || 0;
      });
    } else {
      rankPromise = Promise.resolve(0);
    }

    Promise.all([rankPromise, AirtelStorage.getReplaysLeftAsync()])
      .then(function (results) {
        var rank = results[0];
        var left = results[1];
        renderBoard();
        updateReplays();
        $("go-title").textContent =
          data.reason === "complete" ? "Challenge Complete!" : "Game Over";
        $("go-priority-score").textContent = data.priorityPoints || 0;
        var totalCoins = (data.coins || 0) + (data.fastLaneCoins || 0);
        var coinsDetail = $("go-coins-detail");
        if (coinsDetail) {
          if (totalCoins > 0) {
            coinsDetail.textContent =
              "Includes " + totalCoins + " coins collected";
            coinsDetail.hidden = false;
          } else {
            coinsDetail.textContent = "";
            coinsDetail.hidden = true;
          }
        }
        $("go-rank-msg").textContent =
          "You rank #" +
          (rank > 0 ? rank : "—") +
          " on the leaderboard. " +
          chancesLeftText(left);
        var allPriority =
          (data.lettersCollected || 0) >= LETTERS.length ||
          !!data.fastLaneUnlocked;
        var unlockEl = $("go-unlock-msg");
        if (unlockEl) {
          unlockEl.classList.toggle("hidden", !allPriority);
          unlockEl.setAttribute("aria-hidden", allPriority ? "false" : "true");
        }
        var playAgain = $("btn-play-again");
        if (playAgain) playAgain.disabled = left <= 0;
        showPanel("panel-gameover");
        if (AirtelStorage.useApi && AirtelStorage.useApi() && AirtelStorage.flushPendingScores) {
          AirtelStorage.flushPendingScores().then(function () {
            renderBoard();
          });
        }
      });
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
          setFastLaneBanner(true, "Fast Lane Unlocked!");
          $("hud-timer").classList.remove("hidden");
          $("hud-timer").textContent = Math.ceil(e.data.fastLaneRemain || 0) + "s";
        } else {
          setFastLaneGlow(false);
          setFastLaneBanner(false);
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
          setFastLaneBanner(true, e.data.message || "Fast Lane Unlocked!");
        }
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
    window.location.reload();
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
    startSession();
  });

  var regPhone = $("reg-phone");
  if (regPhone) {
    regPhone.addEventListener("blur", checkPhonePlayLimit);
    regPhone.addEventListener("input", function () {
      var p = regPhone.value.replace(/\s/g, "");
      if (p.length === 10) checkPhonePlayLimit();
    });
  }

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
    var user = AirtelStorage.getUser();
    var check = user && user.phone
      ? AirtelStorage.checkPlayEligibility(user.phone)
      : AirtelStorage.getReplaysLeftAsync().then(function (left) {
          return { left: left, canPlayToday: left > 0 };
        });
    check.then(function (status) {
      if (!status.canPlayToday || status.left <= 0) return;
      return AirtelStorage.usePlay().then(function (ok) {
        if (!ok) {
          updateReplays();
          return;
        }
        updateReplays();
        reloadGameFrame(function () {
          runStartCountdown(function () {
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
        });
      });
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
  AirtelStorage.init().then(function () {
    if (user && user.phone) {
      checkPhonePlayLimit();
    } else {
      updateReplays();
    }
    showPanel("panel-register");
  });

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
