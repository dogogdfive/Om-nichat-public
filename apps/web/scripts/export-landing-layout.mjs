/**
 * Run in Brave on http://localhost:3000 (or your deployed URL):
 *
 * 1. Open DevTools → Console
 * 2. Paste the snippet printed by: node apps/web/scripts/export-landing-layout.mjs
 * 3. Save the downloaded file as apps/web/landing-layout.export.json
 * 4. Run: node apps/web/scripts/bake-landing-layout.mjs
 */

const SNIPPET = `(function () {
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith("omnichat-landing-")) keys.push(k);
  }
  keys.sort();
  var out = {};
  keys.forEach(function (k) {
    out[k] = localStorage.getItem(k);
  });
  var blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "landing-layout.export.json";
  a.click();
  console.log("Exported " + keys.length + " landing keys:", keys);
})();`;

console.log("Paste this in Brave DevTools console on your landing page:\n");
console.log(SNIPPET);
