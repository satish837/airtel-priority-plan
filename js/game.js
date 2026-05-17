(function (global) {
  "use strict";

  var LETTERS = AirtelStorage.LETTERS;
  var LANES = 3;
  var FAST_LANE_SEC = 60;

  function FastLaneGame(canvas, callbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cb = callbacks || {};
    this.reset();
    this.bindInput();
  }

  FastLaneGame.prototype.reset = function () {
    this.running = false;
    this.paused = false;
    this.lane = 1;
    this.targetLane = 1;
    this.laneT = 0;
    this.speed = 6;
    this.baseSpeed = 6;
    this.distance = 0;
    this.coins = 0;
    this.fastLaneCoins = 0;
    this.lives = 3;
    this.phase = "collect";
    this.collected = {};
    this.missedQueue = [];
    this.nextLetterIdx = 0;
    this.entities = [];
    this.particles = [];
    this.spawnTimer = 0;
    this.letterSpawnTimer = 0;
    this.fastLaneTime = FAST_LANE_SEC;
    this.fastLaneElapsed = 0;
    this.nitro = false;
    this.upgraded = false;
    this.flashMsg = null;
    this.flashUntil = 0;
    this.hitCooldown = 0;
    this.shake = 0;
    this.anim = 0;
    for (var i = 0; i < LETTERS.length; i++) {
      this.collected[LETTERS[i] + i] = false;
    }
    this.resize();
  };

  FastLaneGame.prototype.resize = function () {
    var rect = this.canvas.parentElement.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.laneW = this.w / LANES;
    this.groundY = this.h * 0.72;
    this.playerY = this.groundY - 48;
  };

  FastLaneGame.prototype.bindInput = function () {
    var self = this;
    function laneLeft() {
      if (self.targetLane > 0) self.targetLane--;
    }
    function laneRight() {
      if (self.targetLane < LANES - 1) self.targetLane++;
    }
    function jump() {
      if (!self.jumping && !self.sliding) {
        self.jumping = true;
        self.jumpVy = -14;
        self.jumpY = 0;
      }
    }
    function slide() {
      if (!self.jumping && !self.sliding) {
        self.sliding = true;
        self.slideT = 0;
      }
    }
    this._keys = {};
    window.addEventListener("keydown", function (e) {
      if (!self.running) return;
      if (e.key === "ArrowLeft" || e.key === "a") laneLeft();
      if (e.key === "ArrowRight" || e.key === "d") laneRight();
      if (e.key === "ArrowUp" || e.key === "w" || e.key === " ") {
        e.preventDefault();
        jump();
      }
      if (e.key === "ArrowDown" || e.key === "s") slide();
    });
    var touchStartX = 0;
    var touchStartY = 0;
    this.canvas.addEventListener(
      "touchstart",
      function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );
    this.canvas.addEventListener(
      "touchend",
      function (e) {
        if (!self.running) return;
        var t = e.changedTouches[0];
        var dx = t.clientX - touchStartX;
        var dy = t.clientY - touchStartY;
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx < -30) laneLeft();
          else if (dx > 30) laneRight();
        } else {
          if (dy < -30) jump();
          else if (dy > 30) slide();
        }
      },
      { passive: true }
    );
    this._laneLeft = laneLeft;
    this._laneRight = laneRight;
    this._jump = jump;
    this._slide = slide;
  };

  FastLaneGame.prototype.start = function () {
    this.reset();
    this.running = true;
    this.lastTs = 0;
    this.loop();
  };

  FastLaneGame.prototype.stop = function () {
    this.running = false;
  };

  FastLaneGame.prototype.showFlash = function (text, ms) {
    this.flashMsg = text;
    this.flashUntil = performance.now() + (ms || 2000);
  };

  FastLaneGame.prototype.allLettersCollected = function () {
    for (var i = 0; i < LETTERS.length; i++) {
      if (!this.collected[LETTERS[i] + i]) return false;
    }
    return true;
  };

  FastLaneGame.prototype.nextNeededLetter = function () {
    for (var i = 0; i < LETTERS.length; i++) {
      if (!this.collected[LETTERS[i] + i]) return { letter: LETTERS[i], index: i };
    }
    return null;
  };

  FastLaneGame.prototype.spawnLetter = function () {
    var need = this.nextNeededLetter();
    if (!need && this.missedQueue.length) {
      need = this.missedQueue.shift();
    }
    if (!need) return;
    var lane = Math.floor(Math.random() * LANES);
    this.entities.push({
      type: "letter",
      lane: lane,
      y: -40,
      letter: need.letter,
      letterIndex: need.index,
      id: need.letter + need.index + "_" + Date.now()
    });
  };

  FastLaneGame.prototype.spawnObstacle = function () {
    var kind = Math.random() < 0.35 ? "barrier" : Math.random() < 0.5 ? "hurdle" : "train";
    var lane = Math.floor(Math.random() * LANES);
    if (kind === "train" && Math.random() < 0.4) {
      lane = -1;
    }
    this.entities.push({
      type: "obstacle",
      kind: kind,
      lane: lane,
      y: -80,
      h: kind === "train" ? 120 : kind === "hurdle" ? 50 : 70
    });
  };

  FastLaneGame.prototype.spawnCoin = function () {
    var lane = Math.floor(Math.random() * LANES);
    this.entities.push({ type: "coin", lane: lane, y: -30 });
  };

  FastLaneGame.prototype.enterFastLane = function () {
    this.phase = "fastlane";
    this.nitro = true;
    this.upgraded = true;
    this.fastLaneElapsed = 0;
    this.speed = this.baseSpeed * 1.8;
    this.entities = this.entities.filter(function (e) {
      return e.type === "coin";
    });
    this.showFlash("Fast Lane Unlocked!", 2500);
    if (this.cb.onFastLane) this.cb.onFastLane();
  };

  FastLaneGame.prototype.loop = function () {
    var self = this;
    if (!this.running) return;
    requestAnimationFrame(function (ts) {
      if (!self.lastTs) self.lastTs = ts;
      var dt = Math.min((ts - self.lastTs) / 16.67, 3);
      self.lastTs = ts;
      if (!self.paused) self.update(dt, ts);
      self.draw(ts);
      self.loop();
    });
  };

  FastLaneGame.prototype.update = function (dt, ts) {
    this.anim += dt * 0.05;
    if (this.hitCooldown > 0) this.hitCooldown -= dt;
    if (this.shake > 0) this.shake -= dt * 0.15;

    if (this.lane !== this.targetLane) {
      this.laneT += dt * 0.22;
      if (this.laneT >= 1) {
        this.lane = this.targetLane;
        this.laneT = 0;
      }
    }

    if (this.jumping) {
      this.jumpVy += 0.9 * dt;
      this.jumpY += this.jumpVy * dt;
      if (this.jumpY >= 0) {
        this.jumpY = 0;
        this.jumping = false;
        this.jumpVy = 0;
      }
    }
    if (this.sliding) {
      this.slideT += dt * 0.12;
      if (this.slideT >= 1) this.sliding = false;
    }

    var mult = this.nitro ? 1.35 : 1;
    this.distance += this.speed * mult * dt * 0.1;

    if (this.phase === "fastlane") {
      this.fastLaneElapsed += dt / 60;
      var remain = FAST_LANE_SEC - this.fastLaneElapsed;
      if (remain <= 0) {
        this.endGame("complete");
        return;
      }
      this.speed = this.baseSpeed * 1.8 + this.fastLaneElapsed * 0.12;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnCoin();
        if (Math.random() < 0.5) this.spawnCoin();
        this.spawnTimer = 18 - Math.min(this.fastLaneElapsed * 0.15, 10);
      }
    } else {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        if (Math.random() < 0.55) this.spawnObstacle();
        else this.spawnCoin();
        this.spawnTimer = 28 - Math.min(this.distance * 0.002, 12);
      }
      this.letterSpawnTimer -= dt;
      if (this.letterSpawnTimer <= 0 && !this.allLettersCollected()) {
        this.spawnLetter();
        this.letterSpawnTimer = 90;
      }
      this.speed = this.baseSpeed + Math.min(this.distance * 0.008, 8);
    }

    var scroll = this.speed * mult * dt;
    var playerLaneX = this.laneX();
    var py = this.playerY + (this.jumping ? this.jumpY : 0);
    var ph = this.sliding ? 28 : 52;
    var pyTop = py - ph;

    for (var i = this.entities.length - 1; i >= 0; i--) {
      var e = this.entities[i];
      e.y += scroll;
      if (e.y > this.h + 100) {
        if (e.type === "letter" && !this.collected[e.letter + e.letterIndex]) {
          this.missedQueue.push({ letter: e.letter, index: e.letterIndex });
          if (this.cb.onLetterMissed) this.cb.onLetterMissed(e.letter);
        }
        this.entities.splice(i, 1);
        continue;
      }

      var ex = this.entityX(e);
      var hitX = Math.abs(ex - playerLaneX) < this.laneW * 0.35;
      var hitY = e.y > pyTop - 20 && e.y < py + 10;

      if (e.type === "letter" && hitX && hitY && !this.collected[e.letter + e.letterIndex]) {
        this.collected[e.letter + e.letterIndex] = true;
        this.coins += 5;
        this.particles.push({ x: ex, y: e.y, life: 1, color: "#fff" });
        this.entities.splice(i, 1);
        if (this.cb.onLetterCollected) this.cb.onLetterCollected(e.letter, this.collectedCount());
        if (this.allLettersCollected()) this.enterFastLane();
        continue;
      }

      if (e.type === "coin" && hitX && hitY) {
        if (this.phase === "fastlane") this.fastLaneCoins += 1;
        else this.coins += 1;
        this.particles.push({ x: ex, y: e.y, life: 0.8, color: "#ffd54f" });
        this.entities.splice(i, 1);
        continue;
      }

      if (e.type === "obstacle" && this.hitCooldown <= 0) {
        var obsHit = false;
        if (e.kind === "train" && e.lane === -1) {
          obsHit = e.y > pyTop && e.y < py + 20;
        } else if (e.lane === this.lane || e.lane === -1) {
          if (e.kind === "hurdle") {
            obsHit = hitX && e.y > py - 15 && e.y < py + 5 && !this.jumping;
          } else if (e.kind === "barrier") {
            obsHit = hitX && e.y > pyTop && e.y < py && !this.jumping;
          } else {
            obsHit = hitX && e.y > pyTop - 10 && e.y < py + 30;
          }
        }
        if (obsHit) {
          this.lives -= 1;
          this.hitCooldown = 45;
          this.shake = 1;
          this.entities.splice(i, 1);
          if (this.lives <= 0) {
            this.endGame("crash");
            return;
          }
        }
      }
    }

    for (var j = this.particles.length - 1; j >= 0; j--) {
      this.particles[j].life -= dt * 0.04;
      this.particles[j].y -= dt * 2;
      if (this.particles[j].life <= 0) this.particles.splice(j, 1);
    }

    if (this.cb.onTick) {
      this.cb.onTick({
        phase: this.phase,
        coins: this.coins,
        fastLaneCoins: this.fastLaneCoins,
        lives: this.lives,
        collected: this.collectedSnapshot(),
        fastLaneRemain: Math.max(0, FAST_LANE_SEC - this.fastLaneElapsed)
      });
    }
  };

  FastLaneGame.prototype.collectedCount = function () {
    var n = 0;
    for (var i = 0; i < LETTERS.length; i++) {
      if (this.collected[LETTERS[i] + i]) n++;
    }
    return n;
  };

  FastLaneGame.prototype.collectedSnapshot = function () {
    var arr = [];
    for (var i = 0; i < LETTERS.length; i++) {
      arr.push(!!this.collected[LETTERS[i] + i]);
    }
    return arr;
  };

  FastLaneGame.prototype.priorityPoints = function () {
    return this.collectedCount() * 10 + (this.allLettersCollected() ? 50 : 0);
  };

  FastLaneGame.prototype.endGame = function (reason) {
    this.running = false;
    if (this.cb.onGameOver) {
      this.cb.onGameOver({
        reason: reason,
        coins: this.coins,
        fastLaneCoins: this.fastLaneCoins,
        priorityPoints: this.priorityPoints(),
        collected: this.collectedSnapshot(),
        fastLaneUnlocked: this.upgraded
      });
    }
  };

  FastLaneGame.prototype.laneX = function (lane) {
    var l = lane !== undefined ? lane : this.lane;
    if (this.lane !== this.targetLane && lane === undefined) {
      var from = this.lane;
      var to = this.targetLane;
      l = from + (to - from) * this.ease(this.laneT);
    }
    return this.laneW * (l + 0.5);
  };

  FastLaneGame.prototype.entityX = function (e) {
    if (e.lane === -1) return this.w / 2;
    return this.laneW * (e.lane + 0.5);
  };

  FastLaneGame.prototype.ease = function (t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  };

  FastLaneGame.prototype.draw = function (ts) {
    var ctx = this.ctx;
    var w = this.w;
    var h = this.h;
    var shakeX = this.shake > 0 ? (Math.random() - 0.5) * 8 * this.shake : 0;

    ctx.save();
    ctx.translate(shakeX, 0);

    var grad = ctx.createLinearGradient(0, 0, 0, h);
    if (this.phase === "fastlane") {
      grad.addColorStop(0, "#ff6b00");
      grad.addColorStop(0.5, "#ff3d00");
      grad.addColorStop(1, "#e60000");
    } else {
      grad.addColorStop(0, "#ff9a3c");
      grad.addColorStop(0.4, "#ff6b00");
      grad.addColorStop(1, "#c62828");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i <= LANES; i++) {
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(i * this.laneW, this.groundY - 20);
      ctx.lineTo(i * this.laneW, h);
      ctx.stroke();
    }

    ctx.fillStyle = "#333";
    ctx.fillRect(0, this.groundY, w, h - this.groundY);
    ctx.fillStyle = "#444";
    for (var stripe = 0; stripe < 8; stripe++) {
      var sy = this.groundY + ((stripe * 60 + this.distance * 8) % (h - this.groundY));
      ctx.fillRect(w * 0.1, sy, w * 0.8, 8);
    }

    var entities = this.entities.slice().sort(function (a, b) {
      return a.y - b.y;
    });
    for (var e = 0; e < entities.length; e++) {
      this.drawEntity(entities[e]);
    }

    this.drawPlayer();

    for (var p = 0; p < this.particles.length; p++) {
      var pt = this.particles[p];
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 6 * pt.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (this.flashMsg && ts < this.flashUntil) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, h * 0.35, w, 56);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 22px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(this.flashMsg, w / 2, h * 0.38 + 8);
    }

    ctx.restore();
  };

  FastLaneGame.prototype.drawEntity = function (e) {
    var ctx = this.ctx;
    var x = this.entityX(e);
    if (e.type === "letter") {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#e60000";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, e.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e60000";
      ctx.font = "bold 20px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.letter, x, e.y + 1);
    } else if (e.type === "coin") {
      ctx.fillStyle = "#ffd54f";
      ctx.beginPath();
      ctx.arc(x, e.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f9a825";
      ctx.stroke();
    } else if (e.type === "obstacle") {
      if (e.kind === "train") {
        ctx.fillStyle = "#263238";
        ctx.fillRect(0, e.y - 20, this.w, e.h);
        ctx.fillStyle = "#ff6b00";
        ctx.fillRect(0, e.y, this.w, 12);
      } else if (e.kind === "hurdle") {
        ctx.fillStyle = "#5d4037";
        ctx.fillRect(x - 35, e.y - 8, 70, 16);
        ctx.fillStyle = "#8d6e63";
        ctx.fillRect(x - 30, e.y - 20, 60, 12);
      } else {
        ctx.fillStyle = "#b71c1c";
        ctx.fillRect(x - 28, e.y - 35, 56, 70);
        ctx.fillStyle = "#fff";
        ctx.fillRect(x - 20, e.y - 28, 40, 12);
      }
    }
  };

  FastLaneGame.prototype.drawPlayer = function () {
    var ctx = this.ctx;
    var x = this.laneX();
    var y = this.playerY + (this.jumping ? this.jumpY : 0);
    var h = this.sliding ? 28 : 52;
    var w = 36;

    if (this.upgraded) {
      ctx.shadowColor = "#ffeb3b";
      ctx.shadowBlur = 20 + Math.sin(this.anim * 4) * 8;
    }
    if (this.nitro) {
      ctx.fillStyle = "rgba(255,235,59,0.5)";
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 5);
      ctx.lineTo(x - 28, y + h);
      ctx.lineTo(x + 28, y + h);
      ctx.lineTo(x + 8, y + 5);
      ctx.fill();
    }

    ctx.fillStyle = this.upgraded ? "#fff176" : "#fff";
    ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = this.upgraded ? "#e60000" : "#ff6b00";
    ctx.fillRect(x - w / 2 + 4, y - h + 8, w - 8, h - 16);
    ctx.fillStyle = "#333";
    ctx.fillRect(x - 8, y - h + 4, 16, 12);
    ctx.shadowBlur = 0;
  };

  global.FastLaneGame = FastLaneGame;
})(window);
