(function () {
  "use strict";
  window.famobi_analytics = window.famobi_analytics || {};
  if (!window.famobi_analytics.trackEvent) {
    window.famobi_analytics.trackEvent = function () {
      return Promise.resolve();
    };
  }
  if (!window.famobi_analytics.trackStats) {
    window.famobi_analytics.trackStats = function () {};
  }
})();
