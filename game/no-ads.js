(function () {
  "use strict";

  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.push = function (config) {
    if (config && typeof config === "object") {
      if (typeof config.onReady === "function") {
        try { config.onReady(); } catch (e) {}
      }
      if (typeof config.adBreakDone === "function") {
        setTimeout(function () {
          try {
            config.adBreakDone({
              breakType: config.type || "interstitial",
              breakName: config.name || "",
              dismissed: false
            });
          } catch (e) {}
        }, 0);
      }
    }
    return 1;
  };

  var noop = function () {};
  var done = function (cb, value) {
    if (typeof cb === "function") {
      setTimeout(function () { cb(value); }, 0);
    }
  };

  window.GAMESNACKS = {
    subscribeToAudioUpdates: function (cb) {
      if (typeof cb === "function") cb(true);
    },
    adBreak: function (opts) {
      opts = opts || {};
      if (typeof opts.beforeAd === "function") opts.beforeAd();
      if (typeof opts.afterAd === "function") opts.afterAd();
      if (typeof opts.beforeReward === "function") opts.beforeReward(function () {});
      if (typeof opts.adViewed === "function") opts.adViewed();
      if (typeof opts.adDismissed === "function") opts.adDismissed();
      done(opts.adBreakDone, {
        breakType: opts.type || "interstitial",
        breakName: opts.name || "",
        dismissed: false
      });
    },
    gameOver: noop,
    gameReady: noop,
    sendScore: noop,
    levelComplete: noop,
    isAudioEnabled: function () { return true; },
    rewardedAdOpportunity: function (obj) {
      if (!obj) return;
      if (typeof obj.beforeReward === "function") {
        obj.beforeReward(function () {
          if (typeof obj.beforeAd === "function") obj.beforeAd();
          if (typeof obj.adViewed === "function") obj.adViewed();
          if (typeof obj.afterAd === "function") obj.afterAd();
        });
      }
    },
    showAd: noop,
    showRewardedAd: function (cb) {
      done(cb, { rewardGranted: true });
    }
  };

  function hidePromo() {
    ["huawei-promo-banner", "huawei-promo-badge-holder", "huawei-promo-badge"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
  }
  hidePromo();
  document.addEventListener("DOMContentLoaded", hidePromo);

  function patchFamobi() {
    if (!window.famobi) return;
    window.famobi.showAd = function (cb) { done(cb); };
    window.famobi.showInterstitialAd = function () { return Promise.resolve(); };
    window.famobi.forceAd = function (cb) { done(cb); };
    window.famobi.rewardedAd = function (cb) {
      done(cb, { rewardGranted: true, adDidShow: false, adDidLoad: true });
    };
    if (window.famobi.ads) {
      window.famobi.ads.off = true;
      window.famobi.ads.show = function () { return Promise.resolve(); };
    }
  }
  patchFamobi();
  setInterval(patchFamobi, 500);
})();
