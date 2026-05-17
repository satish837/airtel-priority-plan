/**
 * Airtel Fast Lane Challenge — hooks into Om Nom Run (PlayCanvas).
 * Tracks PRIORITY letters, fast-lane mode, and reports to parent shell.
 */
(function () {
  "use strict";

  var LETTERS = ["P", "R", "I", "O", "R", "I", "T", "Y"];
  var FAST_LANE_SEC = 60;
  var PRIORITY_KEY = "airtel_priority_v1";

  var state = {
    active: false,
    collected: {},
    missed: [],
    nextIndex: 0,
    fastLane: false,
    fastLaneEnd: 0,
    coins: 0,
    fastLaneCoins: 0,
    lastScore: 0,
    hooked: false
  };

  function saveProgress() {
    try {
      localStorage.setItem(
        PRIORITY_KEY,
        JSON.stringify({
          collected: state.collected,
          missed: state.missed,
          nextIndex: state.nextIndex,
          fastLane: state.fastLane
        })
      );
    } catch (e) {}
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(PRIORITY_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      state.collected = d.collected || {};
      state.missed = d.missed || [];
      state.nextIndex = d.nextIndex || 0;
    } catch (e) {}
  }

  function resetProgress() {
    state.collected = {};
    state.missed = [];
    state.nextIndex = 0;
    state.fastLane = false;
    state.fastLaneEnd = 0;
    state.coins = 0;
    state.fastLaneCoins = 0;
    for (var i = 0; i < LETTERS.length; i++) {
      state.collected[LETTERS[i] + i] = false;
    }
    saveProgress();
  }

  function post(type, data) {
    data = data || {};
    data.type = type;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(data, "*");
      }
    } catch (e) {}
  }

  function postGameOver(payload) {
    var n = 0;
    function send() {
      post("airtel:gameover", payload);
      n++;
      if (n < 6) setTimeout(send, 350);
    }
    send();
  }

  function collectedSnapshot() {
    return LETTERS.map(function (ch, i) {
      return !!state.collected[ch + i];
    });
  }

  function collectedCount() {
    var n = 0;
    for (var i = 0; i < LETTERS.length; i++) {
      if (state.collected[LETTERS[i] + i]) n++;
    }
    return n;
  }

  function priorityPoints() {
    return collectedCount() * 10 + (state.fastLane ? 50 : 0);
  }

  function nextNeeded() {
    for (var i = 0; i < LETTERS.length; i++) {
      if (!state.collected[LETTERS[i] + i]) {
        return { letter: LETTERS[i], index: i };
      }
    }
    return null;
  }

  function allCollected() {
    return collectedCount() >= LETTERS.length;
  }

  function pushHud() {
    var remain = 0;
    if (state.fastLane) {
      remain = Math.max(0, (state.fastLaneEnd - Date.now()) / 1000);
    }
    post("airtel:hud", {
      collected: collectedSnapshot(),
      coins: state.coins + state.fastLaneCoins,
      phase: state.fastLane ? "fastlane" : "collect",
      fastLaneRemain: remain
    });
  }

  function enterFastLane(app) {
    if (state.fastLane) return;
    haltLetters();
    state.fastLane = true;
    state.fastLaneEnd = Date.now() + FAST_LANE_SEC * 1000;
    saveProgress();
    post("airtel:flash", { message: "Fast Lane Unlocked!" });

    if (app) {
      try {
        app.timeScale = 1.25;
        if (typeof EventTypes !== "undefined") {
          app.fire(EventTypes.POWERUP_ROCKET);
          app.fire(EventTypes.POWERUP_DOUBLE_COIN);
          app.fire(EventTypes.POWERUP_MAGNET);
        }
      } catch (e) {}
    }

    var tick = setInterval(function () {
      if (!state.active) {
        clearInterval(tick);
        return;
      }
      var remain = (state.fastLaneEnd - Date.now()) / 1000;
      if (app) {
        try {
          app.timeScale = Math.min(1.25 + (FAST_LANE_SEC - remain) * 0.02, 1.85);
        } catch (e) {}
      }
      pushHud();
      if (remain <= 0) {
        clearInterval(tick);
        endSession("complete", app);
      }
    }, 500);
  }

  function onLetterCollected(letterChar) {
    if (!state.active || state.fastLane) return;
    var ch = (letterChar || "").toString().toUpperCase().charAt(0);
    if (!ch) return;

    var need = nextNeeded();
    if (!need && state.missed.length) {
      need = state.missed.shift();
    }
    if (!need) return;

    if (ch === need.letter) {
      state.collected[need.letter + need.index] = true;
      saveProgress();
      if (allCollected()) {
        var app = getApp();
        enterFastLane(app);
      }
    } else {
      state.missed.push(need);
      saveProgress();
    }
    pushHud();
  }

  function haltLetters() {
    lettersEnabled = false;
    stopLetterSpawner();
  }

  function pauseGame(app) {
    app = app || getApp();
    if (!app) return;
    try {
      app.timeScale = 0;
    } catch (e) {}
  }

  var deathEndTimer = null;

  function clearEndTimers() {
    if (deathEndTimer) {
      clearTimeout(deathEndTimer);
      deathEndTimer = null;
    }
  }

  function buildGameOverPayload(reason) {
    return {
      reason: reason,
      coins: state.coins,
      fastLaneCoins: state.fastLaneCoins,
      priorityPoints: priorityPoints(),
      lettersCollected: collectedCount(),
      fastLaneUnlocked: state.fastLane
    };
  }

  function endSession(reason, app) {
    haltLetters();
    clearEndTimers();
    if (gameOverSent) return;
    if (!state.active) return;
    gameOverSent = true;
    state.active = false;
    pauseGame(app);
    postGameOver(buildGameOverPayload(reason));
    try {
      localStorage.removeItem(PRIORITY_KEY);
    } catch (e) {}
  }

  /** Mission distance reached or level success — show Airtel summary (not native mission UI). */
  function onRunCompleted(app) {
    app = app || getApp();
    if (!state.active || gameOverSent) return;
    if (state.fastLane) return;

    if (allCollected()) {
      enterFastLane(app);
      return;
    }

    endSession("complete", app);
  }

  function getApp() {
    try {
      if (window.pc && pc.Application && pc.Application.getApplication) {
        return pc.Application.getApplication();
      }
    } catch (e) {}
    return null;
  }

  function handleAnalyticsEvent(event, params) {
    params = params || {};
    if (!state.active || gameOverSent) return;
    if (event === "EVENT_LIVESCORE" || event === "EVENT_TOTALSCORE") {
      var score = params.liveScore || params.totalScore || 0;
      if (score > state.lastScore) {
        var delta = score - state.lastScore;
        state.lastScore = score;
        if (state.fastLane) state.fastLaneCoins += delta;
        else state.coins = score;
        pushHud();
      }
    }
    if (event === "EVENT_LEVELFAIL") {
      endSession("crash", getApp());
    }
    if (event === "EVENT_LEVELSUCCESS") {
      onRunCompleted(getApp());
    }
  }

  function installAnalyticsHook() {
    if (!window.famobi_analytics) return false;
    var current = window.famobi_analytics.trackEvent;
    if (current && current._airtelWrapped) return true;
    var orig = current;
    window.famobi_analytics.trackEvent = function (event, params) {
      handleAnalyticsEvent(event, params);
      return orig.apply(this, arguments);
    };
    window.famobi_analytics.trackEvent._airtelWrapped = true;
    return true;
  }

  function hookApp(app) {
    if (!app || state.hooked) return;
    state.hooked = true;

    if (typeof EventTypes !== "undefined") {
      app.on(EventTypes.COLLECT_LETTER, function (letter) {
        onLetterCollected(letter);
      });
      app.on(EventTypes.MISSION_COMPLETED, function () {
        onRunCompleted(app);
      });
    }

    app.on("update", function () {
      if (!state.active) return;
      if (state.fastLane && Date.now() >= state.fastLaneEnd) {
        endSession("complete", app);
      }
    });
  }

  function hookAnalytics() {
    installAnalyticsHook();
  }

  function waitForGame(cb) {
    var n = 0;
    var t = setInterval(function () {
      n++;
      var app = getApp();
      if (app && typeof EventTypes !== "undefined") {
        clearInterval(t);
        cb(app);
      } else if (n > 300) {
        clearInterval(t);
      }
    }, 200);
  }

  var sessionStarted = false;
  var gameplayPrimed = false;
  var runBegun = false;
  var gameOverSent = false;

  /* In-world PRIORITY letters (mission 1 is Reach Distance — game never spawns them) */
  var letterLayer = null;
  var worldLetters = [];
  var letterSpawnCd = 0;
  var lettersEnabled = false;
  var gameplayWasRunning = false;
  var LETTER_SPAWN_MIN = 2.8;
  var LETTER_SPAWN_MAX = 4.8;
  var LETTER_FALL_SEC = 3.4;
  var LANE_X = [0.22, 0.5, 0.78];

  function ensureLetterLayer() {
    if (letterLayer && letterLayer.parentNode) return letterLayer;
    letterLayer = document.getElementById("airtel-letter-layer");
    if (!letterLayer) {
      letterLayer = document.createElement("div");
      letterLayer.id = "airtel-letter-layer";
      document.body.appendChild(letterLayer);
    }
    return letterLayer;
  }

  function removeWorldLetter(entry) {
    if (!entry) return;
    if (entry.el && entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    worldLetters = worldLetters.filter(function (w) {
      return w !== entry;
    });
  }

  function clearWorldLetters() {
    worldLetters.slice().forEach(removeWorldLetter);
    worldLetters = [];
    letterSpawnCd = 0;
  }

  function spawnWorldLetter() {
    if (!lettersEnabled || !state.active || state.fastLane || allCollected()) return;
    var need = nextNeeded();
    if (!need && !state.missed.length) return;
    if (!need && state.missed.length) need = state.missed[0];

    var layer = ensureLetterLayer();
    var lane = Math.floor(Math.random() * 3);
    var showCorrect = Math.random() < 0.72;
    var ch = showCorrect && need ? need.letter : LETTERS[Math.floor(Math.random() * LETTERS.length)];

    var el = document.createElement("div");
    el.className = "airtel-world-letter";
    el.textContent = ch;
    el.style.left = LANE_X[lane] * 100 + "%";
    layer.appendChild(el);

    var entry = {
      el: el,
      lane: lane,
      char: ch,
      t0: performance.now(),
      duration: LETTER_FALL_SEC * 1000
    };
    worldLetters.push(entry);
  }

  function tryPickupLetter(entry) {
    var need = nextNeeded();
    if (!need && state.missed.length) need = state.missed[0];
    if (!need) return;

    if (entry.char === need.letter) {
      entry.el.classList.add("airtel-letter-pulse");
      onLetterCollected(entry.char);
      setTimeout(function () {
        removeWorldLetter(entry);
      }, 200);
    } else {
      removeWorldLetter(entry);
    }
  }

  function updateWorldLetters(dt, app) {
    syncLettersToGameplay(app);
    if (!lettersEnabled || !state.active || state.fastLane) {
      clearWorldLetters();
      return;
    }

    letterSpawnCd -= dt;
    if (letterSpawnCd <= 0) {
      spawnWorldLetter();
      letterSpawnCd =
        LETTER_SPAWN_MIN + Math.random() * (LETTER_SPAWN_MAX - LETTER_SPAWN_MIN);
    }

    var collectY = window.innerHeight * 0.68;
    var now = performance.now();

    worldLetters.slice().forEach(function (entry) {
      var t = Math.min(1, (now - entry.t0) / entry.duration);
      var y = -12 + t * 115;
      entry.el.style.top = y + "%";

      var rect = entry.el.getBoundingClientRect();
      if (rect.top >= collectY && rect.top < collectY + 80) {
        tryPickupLetter(entry);
      } else if (t >= 1) {
        if (entry.char === (nextNeeded() || {}).letter) {
          var need = nextNeeded();
          if (need) state.missed.push(need);
          saveProgress();
        }
        removeWorldLetter(entry);
      }
    });
  }

  function startLetterSpawner(app) {
    lettersEnabled = true;
    gameplayWasRunning = false;
    ensureLetterLayer();
    if (letterLayer) letterLayer.style.display = "";
    letterSpawnCd = 0.5;
    if (app && !app._airtelLetterTick) {
      app._airtelLetterTick = true;
      app.on("update", function () {
        var dt = (app.dt || 0.016) * (app.timeScale || 1);
        updateWorldLetters(dt, app);
      });
    }
  }

  function stopLetterSpawner() {
    clearWorldLetters();
    if (letterLayer) {
      letterLayer.innerHTML = "";
      letterLayer.style.display = "none";
    }
  }

  function findGameStateController(app) {
    if (!app || !app.root) return null;
    try {
      var level = app.root.findByName("Level");
      if (level && level.script && level.script.gameStateController) {
        return level.script.gameStateController;
      }
      var found = null;
      app.root.find(function (node) {
        if (found) return;
        if (node.script && node.script.gameStateController) {
          found = node.script.gameStateController;
        }
      });
      return found;
    } catch (e) {
      return null;
    }
  }

  function readGameState(ctrl) {
    if (!ctrl || typeof GameState === "undefined") return null;
    var direct =
      ctrl.gameState || ctrl.state || ctrl._gameState || ctrl.currentState;
    if (direct) return direct;
    try {
      for (var key in ctrl) {
        if (!Object.prototype.hasOwnProperty.call(ctrl, key)) continue;
        var val = ctrl[key];
        if (typeof val !== "string") continue;
        for (var name in GameState) {
          if (GameState[name] === val) return val;
        }
      }
    } catch (e) {}
    return null;
  }

  function syncLettersToGameplay(app) {
    if (!state.active || state.fastLane || allCollected()) {
      if (lettersEnabled) haltLetters();
      return;
    }
    if (typeof GameState === "undefined") return;

    var gs = readGameState(findGameStateController(app));
    if (gs === GameState.RUNNING) {
      gameplayWasRunning = true;
      if (!lettersEnabled) {
        lettersEnabled = true;
        ensureLetterLayer();
        if (letterLayer) letterLayer.style.display = "";
        letterSpawnCd = 0.5;
      }
      return;
    }

    if (gameplayWasRunning && gs === GameState.RUNNING && deathEndTimer) {
      clearTimeout(deathEndTimer);
      deathEndTimer = null;
    }

    if (gameplayWasRunning && gs === GameState.DEAD && state.active && !deathEndTimer) {
      deathEndTimer = setTimeout(function () {
        deathEndTimer = null;
        if (!state.active || gameOverSent) return;
        var now = readGameState(findGameStateController(app));
        if (now === GameState.DEAD) {
          endSession("crash", app);
        }
      }, 2200);
    }
  }

  function primeGameplay(app) {
    if (gameplayPrimed || sessionStarted) return;
    if (typeof MissionsManager === "undefined" || !MissionsManager.getInstance) {
      setTimeout(function () {
        primeGameplay(app);
      }, 400);
      return;
    }
    try {
      var endless =
        typeof isEndlessMode === "function" ? isEndlessMode() : false;
      /* Load mission/level assets while the lead form is still visible */
      MissionsManager.getInstance().launchSelectedMode(endless, true, 0);
      gameplayPrimed = true;
      app.timeScale = 0;
    } catch (e) {
      console.warn("Airtel: primeGameplay failed", e);
    }
  }

  function beginRunUnstick(app) {
    var ticks = 0;
    var id = setInterval(function () {
      if (gameOverSent) {
        clearInterval(id);
        return;
      }
      ticks++;
      try {
        app.timeScale = 1;
      } catch (e) {}
      kickStartGame();
      try {
        if (typeof EventTypes !== "undefined") {
          app.fire(EventTypes.HIDE_TRANSITION_SCREEN, 0, function () {});
        }
      } catch (e) {}
      if (ticks >= 40) clearInterval(id);
    }, 350);
  }

  window.addEventListener("message", function (e) {
    if (!e.data || !e.data.type) return;
    if (e.data.type === "airtel:stop-letters") {
      haltLetters();
      return;
    }
    if (e.data.type !== "airtel:start-session") return;
    sessionStarted = true;
    resetAirtelSession();
    hookAnalytics();
    waitForGame(function (app) {
      hookApp(app);
      restartAirtelGameplay(app);
    });
  });

  function isAirtelEmbed() {
    try {
      return window.parent && window.parent !== window;
    } catch (e) {
      return false;
    }
  }

  function kickStartGame() {
    try {
      if (typeof famobi !== "undefined" && typeof famobi.requestAction === "function") {
        famobi.requestAction("startGame");
      }
    } catch (e) {}
  }

  /** Unpause and jump into a run (shell calls this after lead form). */
  function launchFreshMission(app) {
    if (typeof MissionsManager === "undefined" || !MissionsManager.getInstance) {
      return false;
    }
    try {
      var endless =
        typeof isEndlessMode === "function" ? isEndlessMode() : false;
      MissionsManager.getInstance().launchSelectedMode(endless, true, 0);
      gameplayPrimed = true;
      return true;
    } catch (e) {
      console.warn("Airtel: launchSelectedMode failed", e);
      return false;
    }
  }

  function restartAirtelGameplay(app) {
    app = app || getApp();
    if (!app) return false;

    runBegun = true;
    gameOverSent = false;
    gameplayPrimed = false;
    gameplayWasRunning = false;

    if (app._airtelLetterTick) {
      app._airtelLetterTick = false;
    }

    try {
      app.timeScale = 1;
    } catch (e) {}

    launchFreshMission(app);
    beginRunUnstick(app);

    try {
      if (typeof EventTypes !== "undefined") {
        app.fire(EventTypes.HIDE_TRANSITION_SCREEN, 0, function () {});
        app.fire(EventTypes.START_GAMEPLAY_MUSIC);
      }
    } catch (e) {}

    kickStartGame();
    startLetterSpawner(app);
    pushHud();
    return true;
  }

  function startAirtelGameplay(app) {
    app = app || getApp();
    if (!app) return false;
    if (!gameplayPrimed) {
      launchFreshMission(app);
    }
    return restartAirtelGameplay(app);
  }

  function startAirtelGameplayWithRetry() {
    if (runBegun && state.active) return;
    var attempts = 0;
    var tryStart = function () {
      attempts++;
      var app = getApp();
      if (app && typeof EventTypes !== "undefined") {
        restartAirtelGameplay(app);
        return;
      }
      if (attempts < 40) {
        setTimeout(tryStart, 250);
      }
    };
    tryStart();
  }

  function resetAirtelSession() {
    clearEndTimers();
    gameOverSent = false;
    runBegun = false;
    gameplayPrimed = false;
    gameplayWasRunning = false;
    lettersEnabled = false;
    resetProgress();
    state.active = true;
    state.lastScore = 0;
    state.fastLane = false;
    state.fastLaneEnd = 0;
    haltLetters();
  }

  function signalLoaded() {
    post("airtel:loaded");
  }

  installAnalyticsHook();
  setInterval(installAnalyticsHook, 1500);

  waitForGame(function (app) {
    hookApp(app);
    hookAnalytics();
    post("airtel:ready");
    if (!isAirtelEmbed()) {
      kickStartGame();
    } else {
      try {
        app.timeScale = 0;
      } catch (e) {}
      /* Preload mission 1 assets during registration to avoid freeze on briefing */
      setTimeout(function () {
        primeGameplay(app);
      }, 1500);
    }
    signalLoaded();
    if (!isAirtelEmbed()) {
      setInterval(function () {
        if (app && app.timeScale === 0) kickStartGame();
      }, 3000);
    }
  });

  setTimeout(signalLoaded, 5000);

  if (!document.getElementById("application-splash-wrapper")) {
    post("airtel:loaded");
  } else {
    var splashObs = new MutationObserver(function () {
      if (!document.getElementById("application-splash-wrapper")) {
        post("airtel:loaded");
        splashObs.disconnect();
      }
    });
    splashObs.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
