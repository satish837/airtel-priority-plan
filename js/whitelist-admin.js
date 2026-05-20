(function () {
  "use strict";

  var STORAGE_KEY = "airtel_admin_key";
  var currentPage = 1;

  function apiBase() {
    if (typeof window.AIRTEL_API_BASE !== "undefined") {
      return String(window.AIRTEL_API_BASE).replace(/\/$/, "");
    }
    var host = window.location && window.location.hostname;
    var port = window.location && window.location.port;
    if (host === "localhost" || host === "127.0.0.1") {
      if (port === "8080" || port === "8000") {
        return "";
      }
      return "http://localhost:3001";
    }
    return "";
  }

  function friendlyFetchError(err) {
    var msg = (err && err.message) || "Request failed";
    if (msg === "Failed to fetch") {
      return (
        "Cannot reach the API. Run in two terminals: npm run api (port 3001) and npm run serve (port 8080), then refresh."
      );
    }
    return msg;
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

  function escapeHtml(s) {
    var el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  function showStatus(msg, isError) {
    var bar = $("status-bar");
    if (!bar) return;
    bar.textContent = msg;
    bar.className = "status-bar" + (isError ? " error" : "");
    bar.classList.toggle("hidden", !msg);
  }

  function apiFetch(path, options) {
    var opts = options || {};
    opts.headers = Object.assign(
      { "Content-Type": "application/json", "x-admin-key": getAdminKey() },
      opts.headers || {}
    );
    return fetch(apiBase() + path, opts).then(function (res) {
      var ct = (res.headers.get("content-type") || "").toLowerCase();
      var body =
        ct.indexOf("application/json") >= 0
          ? res.json()
          : res.text().then(function (t) {
              if (res.status === 404 && t.indexOf("File not found") >= 0) {
                throw new Error(
                  "API route not found on port 8080. Restart the static server: lsof -ti :8080 | xargs kill && python3 serve.py"
                );
              }
              throw new Error(
                t && t.length < 200 ? t : "HTTP " + res.status + " (non-JSON response)"
              );
            });
      return body.then(function (data) {
        if (!res.ok || (data && data.ok === false)) {
          throw new Error((data && data.error) || res.statusText || "Request failed");
        }
        return data;
      });
    });
  }

  function loadStats() {
    return apiFetch("/api/admin/whitelist/stats").then(function (data) {
      $("stat-mongo").textContent =
        data.mongoCount >= 0 ? String(data.mongoCount) : "—";
      $("stat-cache").textContent = String(data.cacheCount || 0);
      $("stat-source").textContent = data.cacheSource || data.configuredSource || "—";
      $("stats-line").textContent =
        "Configured: " +
        (data.configuredSource || "auto") +
        " · serving from " +
        (data.cacheSource || "none");
    });
  }

  function loadList(page) {
    currentPage = page || 1;
    var q = ($("search") && $("search").value.trim()) || "";
    var path =
      "/api/admin/whitelist?page=" +
      currentPage +
      "&limit=50" +
      (q ? "&q=" + encodeURIComponent(q) : "");
    return apiFetch(path).then(function (data) {
      var tbody = $("whitelist-tbody");
      if (!tbody) return;
      if (!data.rows.length) {
        tbody.innerHTML =
          '<tr><td colspan="6">No entries. Add one above or import from JSON.</td></tr>';
      } else {
        tbody.innerHTML = data.rows
          .map(function (row) {
            var updated = row.updatedAt
              ? new Date(row.updatedAt).toLocaleString()
              : "—";
            return (
              "<tr>" +
              "<td>" +
              escapeHtml(row.phone) +
              "</td>" +
              "<td>" +
              escapeHtml(row.olmId || row.storeId) +
              "</td>" +
              "<td>" +
              escapeHtml(row.name || "—") +
              "</td>" +
              "<td>" +
              escapeHtml(row.circle || "—") +
              "</td>" +
              "<td>" +
              escapeHtml(updated) +
              '</td><td><button type="button" class="btn btn-ghost btn-sm" data-remove="' +
              escapeHtml(row.phone) +
              '">Remove</button></td></tr>'
            );
          })
          .join("");
      }
      var total = data.total || 0;
      var pages = Math.max(1, Math.ceil(total / (data.limit || 50)));
      $("pager").textContent =
        "Page " + data.page + " of " + pages + " · " + total + " entries";
      tbody.querySelectorAll("[data-remove]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!confirm("Remove " + btn.getAttribute("data-remove") + " from whitelist?")) {
            return;
          }
          showStatus("Removing…");
          apiFetch(
            "/api/admin/whitelist?phone=" +
              encodeURIComponent(btn.getAttribute("data-remove")),
            { method: "DELETE" }
          )
            .then(function () {
              showStatus("Removed.", false);
              return refreshAll();
            })
            .catch(function (err) {
              showStatus(friendlyFetchError(err), true);
            });
        });
      });
    });
  }

  function refreshAll() {
    showStatus("Loading…");
    return Promise.all([loadStats(), loadList(currentPage)])
      .then(function () {
        showStatus("", false);
      })
      .catch(function (err) {
        showStatus(friendlyFetchError(err), true);
      });
  }

  function showMain(show) {
    $("auth-panel").classList.toggle("hidden", show);
    $("admin-main").classList.toggle("hidden", !show);
  }

  $("btn-auth").addEventListener("click", function () {
    var key = $("admin-key").value.trim();
    if (!key) {
      $("auth-error").textContent = "Enter admin key.";
      return;
    }
    setAdminKey(key);
    $("auth-error").textContent = "";
    showMain(true);
    refreshAll();
  });

  $("btn-logout").addEventListener("click", function () {
    setAdminKey("");
    showMain(false);
  });

  $("btn-refresh").addEventListener("click", refreshAll);

  var searchTimer;
  $("search").addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      loadList(1);
    }, 350);
  });

  $("btn-import-files").addEventListener("click", function () {
    if (
      !confirm(
        "Import all rows from phone-whitelist-map.json into MongoDB? This may take a minute."
      )
    ) {
      return;
    }
    showStatus("Importing from JSON files…");
    apiFetch("/api/admin/whitelist/import-files", { method: "POST", body: "{}" })
      .then(function (data) {
        showStatus(
          "Imported " + (data.rows || 0) + " rows. Cache: " + (data.cacheCount || 0),
          false
        );
        return refreshAll();
      })
      .catch(function (err) {
        showStatus(friendlyFetchError(err), true);
      });
  });

  $("entry-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var phone = $("f-phone").value.trim().replace(/\s/g, "");
    var olm = $("f-olm").value.trim();
    if (!/^\d{10}$/.test(phone)) {
      showStatus("Enter a valid 10-digit phone.", true);
      return;
    }
    if (!olm) {
      showStatus("OLM ID is required.", true);
      return;
    }
    showStatus("Saving…");
    apiFetch("/api/admin/whitelist", {
      method: "POST",
      body: JSON.stringify({
        phone: phone,
        olmId: olm,
        storeId: olm,
        name: $("f-name").value.trim(),
        circle: $("f-circle").value.trim()
      })
    })
      .then(function () {
        showStatus("Saved.", false);
        $("f-phone").value = "";
        $("f-olm").value = "";
        $("f-name").value = "";
        $("f-circle").value = "";
        return refreshAll();
      })
      .catch(function (err) {
        showStatus(friendlyFetchError(err), true);
      });
  });

  if (getAdminKey()) {
    showMain(true);
    refreshAll();
  }
})();
