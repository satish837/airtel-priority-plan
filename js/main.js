(function () {
  "use strict";

  var app = {
    game: null,
    ui: null,

    init: function () {
      var self = this;
      this.ui = new AirtelUI(this);
      var canvas = document.getElementById("game-canvas");
      this.game = new FastLaneGame(canvas, {
        onLetterCollected: function () {},
        onLetterMissed: function () {},
        onFastLane: function () {},
        onTick: function (state) {
          self.ui.updateHud(state);
        },
        onGameOver: function (result) {
          self.ui.showGameOver(result);
        }
      });

      window.addEventListener("resize", function () {
        if (self.game) self.game.resize();
      });

      setTimeout(function () {
        var splash = document.getElementById("splash");
        if (splash) splash.classList.add("hide");
      }, 2000);

      this.ui.showRegister();
    },

    startGame: function () {
      this.ui.showGame();
      this.game.resize();
      this.game.start();
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    app.init();
  });
})();
