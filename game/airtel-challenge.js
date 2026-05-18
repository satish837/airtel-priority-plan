/**
 * Airtel Fast Lane Challenge — hooks into Om Nom Run (PlayCanvas).
 * Tracks PRIORITY letters, fast-lane mode, and reports to parent shell.
 */
(function () {
  "use strict";

  var LETTERS = ["P", "R", "I", "O", "R", "I", "T", "Y"];
  var FAST_LANE_SEC = 60;
  var PRIORITY_KEY = "airtel_priority_v1";
  var sessionCharacterKey =
    (typeof window !== "undefined" && window.AIRTEL_CHARACTER) || "SuperNom";

  var state = {
    active: false,
    collected: {},
    missed: [],
    nextIndex: 0,
    fastLane: false,
    fastLaneEnd: 0,
    didFastLane: false,
    coins: 0,
    fastLaneCoins: 0,
    lastScore: 0,
    hooked: false,
    _savedTossDistance: undefined
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
    state.didFastLane = false;
    state.coins = 0;
    state.fastLaneCoins = 0;
    for (var i = 0; i < LETTERS.length; i++) {
      state.collected[LETTERS[i] + i] = false;
    }
    saveProgress();
  }

  function getCharactersManager() {
    try {
      if (typeof CharactersManager !== "undefined" && CharactersManager.getInstance) {
        return CharactersManager.getInstance();
      }
      var app = getApp();
      if (app && app.root && app.root.script && app.root.script.charactersManager) {
        return app.root.script.charactersManager;
      }
    } catch (e) {}
    return null;
  }

  function persistCharacterKey(key) {
    try {
      if (typeof Constants !== "undefined" && Constants.ACTIVE_CHARACTER) {
        if (typeof LocalStorageController !== "undefined" && LocalStorageController.setItem) {
          LocalStorageController.setItem(Constants.ACTIVE_CHARACTER, key);
        }
        if (window.famobi && window.famobi.localStorage) {
          window.famobi.localStorage.setItem(Constants.ACTIVE_CHARACTER, key);
        }
      }
      window.AIRTEL_CHARACTER = key;
      return true;
    } catch (e) {
      return false;
    }
  }

  function unlockCharacter(cm, key) {
    try {
      if (typeof cm.initCharactersData === "function") {
        cm.initCharactersData();
      }
      var data = typeof cm.getCharactersData === "function" ? cm.getCharactersData() : null;
      if (data) {
        if (!data[key]) {
          data[key] = { levels: [0, 0, 0], purchased: true };
        } else {
          data[key].purchased = true;
        }
        if (typeof Constants !== "undefined" && Constants.CHARACTERS_DATA && LocalStorageController) {
          LocalStorageController.setItem(Constants.CHARACTERS_DATA, JSON.stringify(data));
        }
      }
      var name;
      for (name in cm) {
        if (typeof cm[name] !== "function" || cm[name].length !== 1) continue;
        var src = Function.prototype.toString.call(cm[name]);
        if (src.indexOf("purchased") !== -1 && src.indexOf("Apicontroller") !== -1) {
          try {
            cm[name](key);
          } catch (e1) {}
          break;
        }
      }
    } catch (e) {}
  }

  function invokeCharacterSelect(cm, key) {
    var name;
    var proto = cm;
    var depth = 0;
    while (proto && depth < 3) {
      for (name in proto) {
        if (!Object.prototype.hasOwnProperty.call(proto, name)) continue;
        if (typeof proto[name] !== "function" || proto[name].length !== 1) continue;
        if (/^(on|update|initialize|postInitialize|swap|get|set)/i.test(name)) continue;
        var src = Function.prototype.toString.call(proto[name]);
        if (src.indexOf("CharactersManager") === -1) continue;
        try {
          proto[name].call(cm, key);
          return true;
        } catch (e1) {}
      }
      proto = Object.getPrototypeOf(proto);
      depth++;
    }
    return false;
  }

  function applyAirtelCharacter(characterKey) {
    characterKey = characterKey || sessionCharacterKey || window.AIRTEL_CHARACTER || "SuperNom";
    sessionCharacterKey = characterKey;
    persistCharacterKey(characterKey);

    var cm = getCharactersManager();
    if (!cm) return false;

    unlockCharacter(cm, characterKey);
    if (invokeCharacterSelect(cm, characterKey)) {
      return true;
    }
    return persistCharacterKey(characterKey);
  }

  function waitForCharactersManager(cb, attempts) {
    attempts = attempts || 0;
    var cm = getCharactersManager();
    if (cm && typeof Constants !== "undefined") {
      cb(cm);
      return;
    }
    if (attempts > 80) return;
    setTimeout(function () {
      waitForCharactersManager(cb, attempts + 1);
    }, 200);
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
    return collectedCount() * 10 + (state.didFastLane || state.fastLane ? 50 : 0);
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
    if (gameOverSent || !state.active) {
      post("airtel:hud", {
        collected: collectedSnapshot(),
        coins: state.coins + state.fastLaneCoins,
        phase: "ended",
        fastLaneRemain: 0
      });
      return;
    }
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

  function notifyRunEnded() {
    state.fastLane = false;
    state.fastLaneEnd = 0;
    clearFastLaneInterval();
    stopPriorityCollection();
    post("airtel:hud", {
      collected: collectedSnapshot(),
      coins: state.coins + state.fastLaneCoins,
      phase: "ended",
      fastLaneRemain: 0
    });
    post("airtel:session-end", {});
  }

  /** Death or native level/mission end while Fast Lane nitro is active. */
  function checkRunEndDuringFastLane(app) {
    if (!state.active || gameOverSent || !state.fastLane) return false;
    if (typeof GameState === "undefined") return false;
    var gs = readGameState(findGameStateController(app));
    if (!gs) return false;

    if (gs === GameState.DEAD) {
      endSession("crash", app);
      return true;
    }
    if (gs === GameState.FINISHED) {
      endSession("complete", app);
      return true;
    }
    return false;
  }

  function findTossObstacleEventNames() {
    var events = [];
    if (typeof EventTypes === "undefined") return events;
    try {
      for (var key in EventTypes) {
        if (!Object.prototype.hasOwnProperty.call(EventTypes, key)) continue;
        var bucket = EventTypes[key];
        if (!bucket || typeof bucket !== "object") continue;
        if (bucket.TOSS_NEARBY_OBSTACLES) events.push(bucket.TOSS_NEARBY_OBSTACLES);
        if (bucket.TOSS_OBSTACLES_WITHIN_RANGE) {
          events.push(bucket.TOSS_OBSTACLES_WITHIN_RANGE);
        }
      }
    } catch (e) {}
    return events;
  }

  function isObstacleEntityName(name) {
    if (!name) return false;
    if (/coin|letter|collectable|collectible|powerup|magnet|player|character|nom|camera|ui|hud|shadow|ground|road|lane|sky|bg_|splash/i.test(name)) {
      return false;
    }
    return /obstacle|truck|fence|log_|barrier|train|bus|trafficsign|ropefence|portal|melon|harvest|wall_entrance|prop-(?!generic_shadow)/i.test(
      name
    );
  }

  function disableObstacleEntity(ent) {
    if (!ent) return;
    try {
      ent.enabled = false;
      if (ent.collision) ent.collision.enabled = false;
      if (ent.rigidbody) ent.rigidbody.enabled = false;
      if (ent.model) ent.model.enabled = false;
    } catch (e) {}
  }

  function clearBlocksContainerObstacles(app) {
    if (!app || !app.root) return;
    try {
      var level = app.root.findByName("Level");
      if (!level) return;
      level.find(function (ent) {
        if (ent.name !== "BlocksContainer") return;
        ent.find(function (child) {
          if (isObstacleEntityName(child.name)) {
            disableObstacleEntity(child);
            return;
          }
          child.find(function (deep) {
            if (isObstacleEntityName(deep.name)) disableObstacleEntity(deep);
          });
        });
      });
    } catch (e) {}
  }

  function callTossObstaclesOnCharacter(app) {
    if (!app || !app.root) return;
    try {
      var level = app.root.findByName("Level");
      var player = level && level.findByName("PlayerContainer");
      if (!player || !player.script) return;
      var names = [
        "characterController",
        "characterCollisionController",
        "characterMovementController"
      ];
      names.forEach(function (scriptName) {
        var sc = player.script[scriptName];
        if (sc && typeof sc.tossObstacles === "function") {
          sc.tossObstacles();
        }
      });
    } catch (e) {}
  }

  function clearFastLaneObstacles(app) {
    if (!app) return;
    var tossEvents = findTossObstacleEventNames();
    tossEvents.forEach(function (evt) {
      try {
        app.fire(evt);
      } catch (e) {}
    });
    callTossObstaclesOnCharacter(app);
    clearBlocksContainerObstacles(app);
    try {
      var gc = app.root.script && app.root.script.gameConfig;
      if (gc) {
        if (state._savedTossDistance === undefined) {
          state._savedTossDistance = gc.obstaclesTossMaxDistance;
        }
        gc.obstaclesTossMaxDistance = 500;
      }
    } catch (e) {}
  }

  function restoreObstacleSettings(app) {
    try {
      var gc = app.root && app.root.script && app.root.script.gameConfig;
      if (gc && state._savedTossDistance !== undefined) {
        gc.obstaclesTossMaxDistance = state._savedTossDistance;
        state._savedTossDistance = undefined;
      }
    } catch (e) {}
  }

  function enterFastLane(app) {
    if (state.fastLane) return;
    stopPriorityCollection();
    state.fastLane = true;
    state.didFastLane = true;
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
        clearFastLaneObstacles(app);
      } catch (e) {}
    }

    clearFastLaneInterval();
    fastLaneInterval = setInterval(function () {
      if (!state.active || gameOverSent) {
        clearFastLaneInterval();
        return;
      }
      if (checkRunEndDuringFastLane(app)) {
        return;
      }
      if (!state.fastLane) {
        clearFastLaneInterval();
        return;
      }
      var remain = (state.fastLaneEnd - Date.now()) / 1000;
      if (app) {
        try {
          app.timeScale = Math.min(1.25 + (FAST_LANE_SEC - remain) * 0.02, 1.85);
          clearFastLaneObstacles(app);
        } catch (e) {}
      }
      pushHud();
      if (remain <= 0) {
        clearFastLaneInterval();
        endSession("complete", app);
      }
    }, 500);
  }

  function onLetterCollected(letterChar) {
    if (!state.active || state.fastLane || gameOverSent) return;
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
    letterSpawnCd = 0;
    stopLetterSpawner();
  }

  function stopPriorityCollection() {
    haltLetters();
    clearWorldLetters();
  }

  function pauseGame(app) {
    app = app || getApp();
    if (!app) return;
    try {
      app.timeScale = 0;
    } catch (e) {}
  }

  var deathEndTimer = null;
  var fastLaneInterval = null;

  function setMissionResultTint(on) {
    try {
      if (document.documentElement) {
        document.documentElement.classList.toggle("airtel-mission-result-tint", !!on);
      }
    } catch (e) {}
    var el = document.getElementById("airtel-mission-tint-overlay");
    if (!on) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if (el) return;
    el = document.createElement("div");
    el.id = "airtel-mission-tint-overlay";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }

  function clearFastLaneInterval() {
    if (fastLaneInterval) {
      clearInterval(fastLaneInterval);
      fastLaneInterval = null;
    }
  }

  function clearEndTimers() {
    clearFastLaneInterval();
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
      fastLaneUnlocked: state.didFastLane
    };
  }

  function endSession(reason, app) {
    stopPriorityCollection();
    clearEndTimers();
    restoreObstacleSettings(app);
    var payload = buildGameOverPayload(reason);
    state.fastLane = false;
    state.fastLaneEnd = 0;
    notifyRunEnded();

    if (!gameOverSent) {
      if (!state.active) {
        postGameOver(payload);
        return;
      }
      gameOverSent = true;
      state.active = false;
      pauseGame(app);
      try {
        localStorage.removeItem(PRIORITY_KEY);
      } catch (e) {}
    }

    if (reason === "crash") {
      setMissionResultTint(true);
    } else {
      setMissionResultTint(false);
    }

    postGameOver(payload);
  }

  /**
   * Native mission/level complete — only show Airtel summary after Fast Lane,
   * or unlock Fast Lane once all PRIORITY letters are collected.
   */
  function onNativeMissionComplete(app) {
    app = app || getApp();
    if (!state.active || gameOverSent) return;

    if (state.fastLane || state.didFastLane) {
      endSession("complete", app);
      return;
    }

    if (allCollected()) {
      enterFastLane(app);
    }
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
      onNativeMissionComplete(getApp());
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
        onNativeMissionComplete(app);
      });
    }

    app.on("update", function () {
      try {
        if (document.documentElement.classList.contains("airtel-mission-result-tint")) {
          if (typeof GameState !== "undefined") {
            var gsTint = readGameState(findGameStateController(app));
            if (gsTint === GameState.RUNNING && (app.timeScale || 0) > 0.01) {
              setMissionResultTint(false);
            }
          }
        }
      } catch (eTint) {}
      if (!state.active || gameOverSent) return;
      if (state.fastLane) {
        if (checkRunEndDuringFastLane(app)) return;
        if (Date.now() >= state.fastLaneEnd) {
          endSession("complete", app);
        }
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
    if (!state.active || gameOverSent || !lettersEnabled) return;
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
    if (gameOverSent || !state.active) {
      stopPriorityCollection();
      return;
    }
    if (state.fastLane) {
      checkRunEndDuringFastLane(app);
      return;
    }
    syncLettersToGameplay(app);
    if (!lettersEnabled) {
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
    if (gameOverSent || !state.active) {
      if (lettersEnabled) stopPriorityCollection();
      return;
    }
    if (state.fastLane) {
      checkRunEndDuringFastLane(app);
      return;
    }
    if (allCollected()) {
      if (lettersEnabled) stopPriorityCollection();
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

    if (gameplayWasRunning && gs === GameState.DEAD && state.active) {
      setMissionResultTint(true);
      stopPriorityCollection();
      if (state.fastLane) {
        endSession("crash", app);
        return;
      }
      if (!deathEndTimer) {
        deathEndTimer = setTimeout(function () {
          deathEndTimer = null;
          if (!state.active || gameOverSent) return;
          var now = readGameState(findGameStateController(app));
          if (now === GameState.DEAD) {
            endSession("crash", app);
          }
        }, 2200);
      }
      return;
    }

    if (gameplayWasRunning && gs === GameState.FINISHED && state.active) {
      endSession("complete", app);
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
      stopPriorityCollection();
      return;
    }
    if (e.data.type !== "airtel:start-session") return;
    sessionStarted = true;
    if (e.data.character) {
      sessionCharacterKey = e.data.character;
    } else if (e.data.user && e.data.user.character) {
      sessionCharacterKey = e.data.user.character;
    }
    resetAirtelSession();
    hookAnalytics();
    waitForGame(function (app) {
      hookApp(app);
      waitForCharactersManager(function () {
        applyAirtelCharacter(sessionCharacterKey);
        restartAirtelGameplay(app);
      });
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

    setMissionResultTint(false);
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

    applyAirtelCharacter(sessionCharacterKey);
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
    setMissionResultTint(false);
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
    state.didFastLane = false;
    state._savedTossDistance = undefined;
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
