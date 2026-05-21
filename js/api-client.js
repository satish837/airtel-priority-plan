/**
 * Build full API URLs from window.AIRTEL_API_BASE (set in api-config.js).
 * Usage: fetch(airtelApiUrl("/api/admin/whitelist/stats"))
 */
(function (global) {
  "use strict";

  function airtelApiUrl(path) {
    var base =
      global.AIRTEL_API_BASE !== undefined && global.AIRTEL_API_BASE !== null
        ? String(global.AIRTEL_API_BASE).replace(/\/$/, "")
        : "";
    if (!path) return base;
    var p = path.charAt(0) === "/" ? path : "/" + path;
    return base + p;
  }

  global.airtelApiUrl = airtelApiUrl;
})(typeof window !== "undefined" ? window : this);
