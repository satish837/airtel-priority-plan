/**
 * Airtel challenge — default runner character (Om Nom Run character key).
 * Keys must match game-data/.../CharactersConfig.json
 */
(function () {
  "use strict";

  window.AIRTEL_CHARACTERS = [
    { key: "SuperNom", name: "Super Nom" },
    { key: "OmNelle", name: "Om Nelle" },
    { key: "SwordKid", name: "Sword Kid" },
    { key: "RoboKid", name: "Robo Kid" },
    { key: "TechKid", name: "Tech Kid" },
    { key: "SpaceCowgirl", name: "Space Cowgirl" },
    { key: "FireNom", name: "Fire Nom" },
    { key: "IceNom", name: "Ice Nom" },
    { key: "EarthNom", name: "Earth Nom" },
    { key: "WindNom", name: "Wind Nom" },
    { key: "NomOfSteel", name: "Nom of Steel" },
    { key: "OmNom", name: "Om Nom Classic" },
    { key: "OmNomX", name: "Om Nom X" }
  ];

  window.AIRTEL_CHARACTER = "OmNelle";

  /** Mission 1 play time (seconds). Replaces the default 800m Reach Distance goal. */
  window.AIRTEL_PLAY_SESSION_SEC = 180;

  /** Calendar day for plays, scores, leaderboard (IST). Set "UTC" for UTC-only keys. */
  window.AIRTEL_DAY_TIMEZONE = "Asia/Kolkata";

  /**
   * MongoDB API base URL.
   * - "" = same-origin /api/* (Vercel production)
   * - "http://localhost:3001" = local API (npm run api)
   * - "local" = localStorage only (no MongoDB)
   */
  if (typeof window.AIRTEL_API_BASE === "undefined") {
    var host = window.location && window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      window.AIRTEL_API_BASE = "http://localhost:3001";
    } else {
      window.AIRTEL_API_BASE = "";
    }
  }
})();
