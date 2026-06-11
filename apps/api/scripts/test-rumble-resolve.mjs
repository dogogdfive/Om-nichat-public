#!/usr/bin/env node
/**
 * Usage: node apps/api/scripts/test-rumble-resolve.mjs <slug>
 * Resolves rumble.com/c/<slug> to a live stream id (if live).
 */
const slug = (process.argv[2] ?? "").replace(/^@/, "").replace(/^\/c\//, "").toLowerCase();
if (!slug) {
  console.error("Usage: node test-rumble-resolve.mjs <slug>");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  return res.text();
}

function parseVideoId(html) {
  const liveBlock =
    html.match(
      /videostream[^>]*thumbnail__grid--item[^>]*>[\s\S]{0,2000}?data-video-id="(\d+)"/i,
    ) ?? html.match(/data-video-id="(\d+)"/);
  return liveBlock?.[1] ? Number(liveBlock[1]) : null;
}

for (const url of [`https://rumble.com/c/${slug}`, `https://rumble.com/user/${slug}`]) {
  console.log("Fetching", url);
  const html = await fetchHtml(url);
  if (!html) {
    console.log("  -> no page");
    continue;
  }
  const id = parseVideoId(html);
  if (!id) {
    console.log("  -> no data-video-id (likely offline)");
    continue;
  }
  const embed = await fetch(`https://rumble.com/embedJS/u3/?request=video&ver=2&v=${id}`, {
    headers: { "User-Agent": UA },
  });
  const embedJson = embed.ok ? await embed.json().catch(() => ({})) : {};
  console.log("  -> streamIdB10 =", id, "embed =", embedJson);
  process.exit(0);
}

console.log("No live stream found for", slug);
process.exit(2);
