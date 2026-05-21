(function () {
  "use strict";

  var STORAGE_KEY = "airtel_admin_key";

  function parseJsonResponse(res) {
    var ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.indexOf("application/json") >= 0) {
      return res.json();
    }
    return res.text().then(function (text) {
      if (res.status === 404) {
        throw new Error("API not found. Redeploy with /api routes and set MONGODB_URI on Vercel.");
      }
      throw new Error(
        text && text.length < 120 ? text : "Server returned non-JSON (HTTP " + res.status + ")"
      );
    });
  }

  function todayKey() {
    var d = new Date();
    var tz =
      (typeof window.AIRTEL_DAY_TIMEZONE !== "undefined" &&
        window.AIRTEL_DAY_TIMEZONE) ||
      "Asia/Kolkata";
    if (tz === "UTC") {
      return d.toISOString().slice(0, 10);
    }
    try {
      return d.toLocaleDateString("en-CA", { timeZone: tz });
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function getAdminKey() {
    return sessionStorage.getItem(STORAGE_KEY) || "";
  }

  function setAdminKey(key) {
    if (key) sessionStorage.setItem(STORAGE_KEY, key);
    else sessionStorage.removeItem(STORAGE_KEY);
  }

  function formatTime(ts) {
    if (!ts) return "—";
    var d = new Date(ts);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  function escapeHtml(s) {
    var el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  function showStatus(msg, isError) {
    var bar = $("status-bar");
    if (!bar) return;
    bar.textContent = msg;
    bar.className = "status-bar" + (isError ? " error" : isError === false ? "" : " loading");
    bar.classList.toggle("hidden", !msg);
  }

  function fetchDashboard(day) {
    var key = getAdminKey();
    var url =
      airtelApiUrl("/api/dashboard") +
      "?day=" +
      encodeURIComponent(day) +
      "&_cb=" +
      Date.now() +
      (key ? "&key=" + encodeURIComponent(key) : "");
    return fetch(url, {
      cache: "no-store",
      headers: key ? { "x-admin-key": key } : {}
    }).then(function (res) {
      return parseJsonResponse(res).then(function (data) {
        if (!res.ok || !data.ok) {
          throw new Error((data && data.error) || res.statusText || "Failed to load");
        }
        return data;
      });
    });
  }

  function renderStats(stats) {
    $("stat-registered").textContent = stats.totalRegistered || 0;
    $("stat-runs").textContent = stats.runsToday || 0;
    $("stat-active").textContent = stats.uniquePlayersToday || 0;
    $("stat-top").textContent = stats.topCoinScore != null ? stats.topCoinScore : stats.topPriorityScore || 0;
  }

  function renderPlayers(players, filter) {
    var tbody = $("players-tbody");
    var q = (filter || "").toLowerCase().trim();
    var rows = players.filter(function (p) {
      if (!q) return true;
      return (
        (p.name || "").toLowerCase().indexOf(q) >= 0 ||
        (p.phone || "").indexOf(q) >= 0 ||
        (p.storeId || "").toLowerCase().indexOf(q) >= 0
      );
    });
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="10" class="empty-msg">No players found</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (p) {
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(p.name || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(p.phone) +
          "</td>" +
          "<td>" +
          escapeHtml(p.storeId || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(p.character || "—") +
          "</td>" +
          "<td>" +
          p.playsUsed +
          " / " +
          (p.playsUsed + p.playsLeft) +
          (p.canPlayToday === false
            ? ' <span class="badge badge-no">blocked</span>'
            : ' <span class="badge badge-yes">can play</span>') +
          "</td>" +
          "<td>" +
          p.runsToday +
          "</td>" +
          "<td><strong>" +
          p.bestPriority +
          "</strong></td>" +
          "<td>" +
          p.bestCoins +
          "</td>" +
          "<td>" +
          (p.fastLaneRuns > 0
            ? '<span class="badge badge-yes">' + p.fastLaneRuns + "</span>"
            : '<span class="badge badge-no">0</span>') +
          "</td>" +
          "<td>" +
          (p.lastRunAt
            ? formatTime(p.lastRunAt)
            : p.playsUsed > 0 && (!p.runsToday || p.runsToday === 0)
              ? '<span class="badge badge-no" title="Plays counted in DB but no score document for this day — score POST may have failed (retry on next visit).">no DB score</span>'
              : "—") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderRuns(runs, filter) {
    var tbody = $("runs-tbody");
    var q = (filter || "").toLowerCase().trim();
    var rows = runs.filter(function (r) {
      if (!q) return true;
      return (
        (r.name || "").toLowerCase().indexOf(q) >= 0 ||
        (r.phone || "").indexOf(q) >= 0 ||
        (r.storeId || "").toLowerCase().indexOf(q) >= 0
      );
    });
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="8" class="empty-msg">No runs for this day</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (r) {
        return (
          "<tr>" +
          "<td>" +
          formatTime(r.ts) +
          "</td>" +
          "<td>" +
          escapeHtml(r.name || "—") +
          "</td>" +
          "<td>" +
          escapeHtml(r.phone) +
          "</td>" +
          "<td>" +
          escapeHtml(r.storeId || "—") +
          "</td>" +
          "<td><strong>" +
          r.priorityPoints +
          "</strong></td>" +
          "<td>" +
          r.coins +
          "</td>" +
          "<td>" +
          r.fastLaneCoins +
          "</td>" +
          "<td>" +
          (r.fastLaneUnlocked
            ? '<span class="badge badge-yes">Yes</span>'
            : '<span class="badge badge-no">No</span>') +
          " · " +
          escapeHtml(r.reason || "") +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  var cachedData = null;

  function load() {
    var day = $("filter-day").value || todayKey();
    showStatus("Loading data for " + day + "…", null);
    fetchDashboard(day)
      .then(function (data) {
        cachedData = data;
        var updated = new Date().toLocaleTimeString();
        showStatus("Updated " + updated + " · auto-refresh every 30s", false);
        renderStats(data.stats || {});
        renderPlayers(data.players || [], $("search").value);
        renderRuns(data.recentRuns || [], $("search").value);
        $("day-label").textContent = data.day || day;
      })
      .catch(function (err) {
        showStatus(err.message || "Failed to load dashboard", true);
        if ((err.message || "").indexOf("Unauthorized") >= 0) {
          setAdminKey("");
          showAuth();
        }
      });
  }

  function showAuth() {
    $("auth-panel").classList.remove("hidden");
    $("dashboard-main").classList.add("hidden");
  }

  function showDashboard() {
    $("auth-panel").classList.add("hidden");
    $("dashboard-main").classList.remove("hidden");
    load();
    startAutoRefresh();
  }

  function exportCsv() {
    if (!cachedData || !cachedData.players) return;
    var headers = [
      "Name",
      "Phone",
      "Store ID",
      "Character",
      "Plays Used",
      "Plays Left",
      "Runs Today",
      "Best Priority",
      "Best Coins",
      "Fast Lane Runs",
      "Last Run"
    ];
    var lines = [headers.join(",")];
    cachedData.players.forEach(function (p) {
      lines.push(
        [
          p.name,
          p.phone,
          p.storeId,
          p.character,
          p.playsUsed,
          p.playsLeft,
          p.runsToday,
          p.bestPriority,
          p.bestCoins,
          p.fastLaneRuns,
          p.lastRunAt ? new Date(p.lastRunAt).toISOString() : ""
        ]
          .map(function (v) {
            return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
          })
          .join(",")
      );
    });
    var blob = new Blob([lines.join("\n")], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "airtel-players-" + (cachedData.day || todayKey()) + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function initTabs() {
    document.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".tab").forEach(function (t) {
          t.classList.remove("active");
        });
        document.querySelectorAll(".panel-section").forEach(function (p) {
          p.classList.remove("active");
        });
        tab.classList.add("active");
        var id = tab.getAttribute("data-panel");
        if (id) $(id).classList.add("active");
      });
    });
  }

  var refreshTimer = null;

  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if ($("dashboard-main").classList.contains("hidden")) return;
      load();
    }, 30000);
  }

  $("filter-day").value = todayKey();
  initTabs();

  $("btn-auth").addEventListener("click", function () {
    var key = $("admin-key").value.trim();
    $("auth-error").textContent = "";
    setAdminKey(key);
    fetchDashboard($("filter-day").value)
      .then(function () {
        showDashboard();
      })
      .catch(function (err) {
        setAdminKey("");
        $("auth-error").textContent = err.message || "Invalid key or API error";
      });
  });

  $("btn-refresh").addEventListener("click", load);
  $("filter-day").addEventListener("change", load);
  $("search").addEventListener("input", function () {
    if (!cachedData) return;
    renderPlayers(cachedData.players || [], $("search").value);
    renderRuns(cachedData.recentRuns || [], $("search").value);
  });
  $("btn-export").addEventListener("click", exportCsv);
  $("btn-logout").addEventListener("click", function () {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    setAdminKey("");
    showAuth();
  });

  if (getAdminKey()) {
    showDashboard();
  } else {
    showAuth();
  }
})();
