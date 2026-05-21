(function () {
  "use strict";

  var STORAGE_KEY = "airtel_admin_key";
  var currentPage = 1;

  function friendlyFetchError(err) {
    var msg = (err && err.message) || "Request failed";
    if (msg === "Failed to fetch") {
      return (
        "Cannot reach the API. On localhost run: npm run api and python3 serve.py. On a custom domain, API must be deployed (e.g. Vercel)."
      );
    }
    if (
      msg.indexOf("AccessDenied") >= 0 ||
      msg.indexOf("Access Denied") >= 0
    ) {
      return (
        "This site is serving static files only. API calls must go to api.airtrel-priority-plan.in — reload after deploying js/api-config.js."
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

  /** Append admin key query param (header is also sent). */
  function withAdminKeyQuery(path) {
    var key = getAdminKey();
    if (!key) return path;
    var sep = path.indexOf("?") >= 0 ? "&" : "?";
    return path + sep + "key=" + encodeURIComponent(key);
  }

  function handleUnauthorized() {
    setAdminKey("");
    showMain(false);
    $("auth-error").textContent =
      "Invalid or missing admin key. Enter the same value as ADMIN_KEY in server/.env, then sign in again.";
  }

  function apiFetch(path, options) {
    var opts = options || {};
    var key = getAdminKey();
    if (!key) {
      return Promise.reject(
        new Error("Not signed in. Enter your admin key below.")
      );
    }
    opts.headers = Object.assign(
      { "Content-Type": "application/json", "x-admin-key": key },
      opts.headers || {}
    );
    var url = airtelApiUrl(withAdminKeyQuery(path));
    return fetch(url, opts).then(function (res) {
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
              if (
                t.indexOf("AccessDenied") >= 0 ||
                t.indexOf("Access Denied") >= 0
              ) {
                throw new Error("Access Denied (static host has no /api — use Vercel API URL)");
              }
              throw new Error(
                t && t.length < 200 ? t : "HTTP " + res.status + " (non-JSON response)"
              );
            });
      return body.then(function (data) {
        if (res.status === 401) {
          var onMain =
            $("admin-main") && !$("admin-main").classList.contains("hidden");
          if (onMain) handleUnauthorized();
          throw new Error(
            (data && data.error) ||
              "Invalid admin key. It must match ADMIN_KEY in server/.env (restart API after changing it)."
          );
        }
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

  function attemptSignIn() {
    var key = $("admin-key").value.trim();
    var btn = $("btn-auth");
    if (!key) {
      $("auth-error").textContent = "Enter admin key.";
      return;
    }
    setAdminKey(key);
    $("auth-error").textContent = "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Signing in…";
    }
    apiFetch("/api/admin/verify")
      .then(function () {
        showMain(true);
        return refreshAll();
      })
      .then(function () {
        $("auth-error").textContent = "";
      })
      .catch(function (err) {
        setAdminKey("");
        showMain(false);
        $("auth-error").textContent = friendlyFetchError(err);
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Sign in";
        }
      });
  }

  $("btn-auth").addEventListener("click", attemptSignIn);

  var adminKeyInput = $("admin-key");
  if (adminKeyInput) {
    adminKeyInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        attemptSignIn();
      }
    });
  }

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

  function normalizePhone(phone) {
    var digits = String(phone || "").replace(/\D/g, "");
    if (digits.indexOf("91") === 0 && digits.length === 12) {
      digits = digits.slice(2);
    }
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
  }

  /** Parse phone-whitelist-map.json or phone-whitelist.json into { phone: row }. */
  function parseWhitelistJson(data) {
    var map = {};
    if (!data) throw new Error("Empty JSON file.");

    if (Array.isArray(data)) {
      data.forEach(function (item) {
        if (item && typeof item === "object" && item.phone != null) {
          var p = normalizePhone(item.phone);
          if (p.length === 10) map[p] = item;
          return;
        }
        var pOnly = normalizePhone(item);
        if (pOnly.length === 10) {
          map[pOnly] = map[pOnly] || { olmId: "", storeId: "", name: "", circle: "" };
        }
      });
      return map;
    }

    if (data.entries && Array.isArray(data.entries)) {
      return parseWhitelistJson(data.entries);
    }

    if (data.map && typeof data.map === "object") {
      return parseWhitelistJson(data.map);
    }

    if (typeof data === "object") {
      Object.keys(data).forEach(function (key) {
        var phone = normalizePhone(key);
        if (phone.length !== 10) return;
        var row = data[key];
        if (row && typeof row === "object") {
          map[phone] = row;
        } else {
          map[phone] = { olmId: "", storeId: "", name: "", circle: "" };
        }
      });
      return map;
    }

    throw new Error("Unrecognized JSON format. Use phone-whitelist-map.json or a phone list.");
  }

  function readJsonFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        try {
          resolve(parseWhitelistJson(JSON.parse(reader.result)));
        } catch (e) {
          reject(new Error(file.name + ": " + (e.message || "Invalid JSON")));
        }
      };
      reader.onerror = function () {
        reject(new Error("Could not read " + file.name));
      };
      reader.readAsText(file);
    });
  }

  function importMapInChunks(map) {
    var keys = Object.keys(map);
    if (!keys.length) {
      return Promise.reject(new Error("No valid phone numbers found in file(s)."));
    }
    var CHUNK = 1200;
    var batches = [];
    var i;
    for (i = 0; i < keys.length; i += CHUNK) {
      var batch = {};
      keys.slice(i, i + CHUNK).forEach(function (k) {
        batch[k] = map[k];
      });
      batches.push(batch);
    }
    var totalRows = 0;
    var chain = Promise.resolve();
    batches.forEach(function (batch, idx) {
      chain = chain.then(function () {
        showStatus(
          "Importing… batch " + (idx + 1) + " of " + batches.length + " (" + keys.length + " phones)",
          false
        );
        return apiFetch("/api/admin/whitelist/import", {
          method: "POST",
          body: JSON.stringify({ map: batch })
        }).then(function (data) {
          totalRows += data.rows || Object.keys(batch).length;
        });
      });
    });
    return chain.then(function () {
      return { rows: totalRows, cacheCount: keys.length };
    });
  }

  function importFromSelectedFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return Promise.resolve();

    var btn = $("btn-import-files");
    if (btn) btn.disabled = true;
    showStatus("Reading " + files.length + " file(s)…", false);

    return files
      .reduce(function (acc, file) {
        return acc.then(function (merged) {
          return readJsonFile(file).then(function (map) {
            Object.keys(map).forEach(function (phone) {
              merged[phone] = map[phone];
            });
            return merged;
          });
        });
      }, Promise.resolve({}))
      .then(function (merged) {
        return importMapInChunks(merged);
      })
      .then(function (result) {
        showStatus(
          "Imported " + result.rows + " rows into MongoDB. Refreshing list…",
          false
        );
        return refreshAll();
      })
      .then(function () {
        showStatus("Import complete. Data loaded.", false);
        setTimeout(function () {
          showStatus("", false);
        }, 4000);
      })
      .catch(function (err) {
        showStatus(friendlyFetchError(err), true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  var jsonFileInput = $("json-file-input");
  if (jsonFileInput) {
    jsonFileInput.addEventListener("change", function () {
      var files = jsonFileInput.files;
      jsonFileInput.value = "";
      importFromSelectedFiles(files);
    });
  }

  $("btn-import-files").addEventListener("click", function () {
    if (jsonFileInput) {
      jsonFileInput.click();
      return;
    }
    showStatus("Importing from server JSON files…", false);
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
