/* Show loading progress before famobi / preloader.js run (fixes stuck 0% on file://) */
(function () {
  var progress = 0;
  var tick = setInterval(function () {
    if (typeof window.displayProgress === "function") {
      clearInterval(tick);
      return;
    }
    var bar = document.getElementById("loaderBar");
    var text = document.getElementById("loadingText");
    if (!bar && !text) return;
    progress = Math.min(0.55, progress + 0.015 + Math.random() * 0.01);
    var pct = Math.round(progress * 100) + "%";
    if (bar) bar.style.width = pct;
    if (text) text.textContent = pct;
  }, 120);
})();
