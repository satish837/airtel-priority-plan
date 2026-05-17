(function () {
  "use strict";

  var AD_CSS =
    ".PpakCe,.feIaof,.oxxYMc,ins.adsbygoogle,.adsbygoogle," +
    "[id*='google_ads'],[id*='ad_container'],[id*='ad_iframe']," +
    "iframe[src*='googleads'],iframe[src*='doubleclick']," +
    "iframe[src*='googlesyndication'],iframe[src*='ad.']," +
    "iframe[name*='google_ads']{display:none!important;visibility:hidden!important;" +
    "pointer-events:none!important;height:0!important;width:0!important;opacity:0!important}";

  var style = document.createElement("style");
  style.id = "block-ads-style";
  style.textContent = AD_CSS;
  (document.head || document.documentElement).appendChild(style);

  var AD_URL = /googleads|doubleclick|googlesyndication|adservice|adsystem|adnxs|pagead|ads\.google/i;

  function isAdNode(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.matches && el.matches(".PpakCe,.feIaof,.oxxYMc,ins.adsbygoogle,.adsbygoogle")) return true;
    if (el.tagName === "IFRAME" && el.src && AD_URL.test(el.src)) return true;
    if (el.id && /google_ads|ad_iframe|ad_container/i.test(el.id)) return true;
    return false;
  }

  function killAds() {
    document.querySelectorAll(".PpakCe,.feIaof,.oxxYMc,ins.adsbygoogle,.adsbygoogle").forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll("iframe").forEach(function (el) {
      if (el.src && AD_URL.test(el.src)) el.remove();
    });
    document.querySelectorAll("span,label,div").forEach(function (el) {
      if (el.childNodes.length === 1 && el.textContent && /^advertisement$/i.test(el.textContent.trim())) {
        var root = el.closest(".PpakCe") || el.parentElement;
        for (var i = 0; i < 12 && root; i++) {
          if (root.querySelector && root.querySelector("iframe")) {
            root.remove();
            break;
          }
          root = root.parentElement;
        }
      }
    });
  }

  killAds();
  new MutationObserver(killAds).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(killAds, 250);

  window.adsbygoogle = window.adsbygoogle || [];
  window.adsbygoogle.push = function (config) {
    if (config && typeof config === "object") {
      if (typeof config.onReady === "function") try { config.onReady(); } catch (e) {}
      if (typeof config.adBreakDone === "function") {
        setTimeout(function () {
          try { config.adBreakDone({ breakType: config.type || "interstitial", dismissed: false }); } catch (e) {}
        }, 0);
      }
    }
    return 1;
  };

  function stubGs() {
    var g = window.GAMESNACKS || {};
    g.subscribeToAudioUpdates = g.subscribeToAudioUpdates || function (cb) { if (cb) cb(true); };
    g.adBreak = function (opts) {
      opts = opts || {};
      if (opts.beforeAd) opts.beforeAd();
      if (opts.afterAd) opts.afterAd();
      if (opts.adBreakDone) setTimeout(function () { opts.adBreakDone({ dismissed: false }); }, 0);
    };
    g.gameOver = function () {};
    g.gameReady = function () {};
    g.sendScore = function () {};
    g.levelComplete = function () {};
    g.rewardedAdOpportunity = function (obj) {
      if (obj && obj.beforeReward) {
        obj.beforeReward(function () {
          if (obj.beforeAd) obj.beforeAd();
          if (obj.adViewed) obj.adViewed();
          if (obj.afterAd) obj.afterAd();
        });
      }
    };
    window.GAMESNACKS = g;
  }
  stubGs();
  setInterval(stubGs, 500);

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (AD_URL.test(url)) return Promise.reject(new Error("ads blocked"));
      return origFetch.apply(this, arguments);
    };
  }

  var XO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (typeof url === "string" && AD_URL.test(url)) {
      this._adBlocked = true;
    }
    return XO.apply(this, arguments);
  };
  var XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this._adBlocked) return;
    return XS.apply(this, arguments);
  };

  window.addEventListener(
    "message",
    function (e) {
      try {
        var d = e.data;
        var s = typeof d === "string" ? d : JSON.stringify(d || {});
        if (/adbreak|showad|interstitial|preroll|rewarded.*ad|pagead/i.test(s)) {
          e.stopImmediatePropagation();
        }
      } catch (err) {}
    },
    true
  );

  document.getElementById("base-js")?.addEventListener("load", function () {
    stubGs();
    killAds();
  });
})();
