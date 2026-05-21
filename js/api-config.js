/**
 * API base URL for static/custom-domain hosts (S3) vs Vercel vs local dev.
 * Optional override: <meta name="airtel-api-base" content="https://your-api-host">
 */
(function (global) {
  "use strict";

  if (typeof global.AIRTEL_API_BASE !== "undefined") return;

  var meta =
    typeof document !== "undefined" &&
    document.querySelector('meta[name="airtel-api-base"]');
  if (meta && meta.getAttribute("content")) {
    global.AIRTEL_API_BASE = meta.getAttribute("content").trim();
    return;
  }

  var loc = global.location;
  if (!loc || !loc.hostname) {
    global.AIRTEL_API_BASE = "";
    return;
  }

  var host = loc.hostname;
  var port = loc.port;

  if (host === "localhost" || host === "127.0.0.1") {
    if (port === "8080" || port === "8000") {
      global.AIRTEL_API_BASE = "";
    } else {
      global.AIRTEL_API_BASE = "http://localhost:3001";
    }
    return;
  }

  if (/\.vercel\.app$/i.test(host)) {
    global.AIRTEL_API_BASE = "";
    return;
  }

  /* API subdomain — same origin */
  if (host === "api.airtrel-priority-plan.in") {
    global.AIRTEL_API_BASE = "";
    return;
  }

  /* Static site on airtrel-priority-plan.in → dedicated API host */
  global.AIRTEL_API_BASE = "https://api.airtrel-priority-plan.in";
})(typeof window !== "undefined" ? window : this);
