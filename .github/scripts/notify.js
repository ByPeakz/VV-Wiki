/**
 * .github/scripts/notify.js
 *
 * Polls the VV: Ultimatum wiki Recent Changes RSS feed.
 * Keeps track of already-posted entries using a local cache file
 * (last-seen.json) committed back to the repo so state persists
 * between workflow runs.
 *
 * New entries since the last run are posted to Discord as embeds.
 */

const fs = require("fs");
const path = require("path");
const Parser = require("rss-parser");

// ── CONFIG ────────────────────────────────────────────────────────────────────

const RSS_URL =
  "https://vv-ultimatum.fandom.com/wiki/Special:RecentChanges?feed=rss";

// How many entries to fetch from the feed each run
const MAX_ENTRIES = 20;

// Path to the cache file (committed in the repo root)
const CACHE_FILE = path.join(process.cwd(), ".github/scripts/last-seen.json");

// Discord embed colours
const COLOR_EDIT = 0x5865f2; // blurple
const COLOR_NEW  = 0x57f287; // green

// ─────────────────────────────────────────────────────────────────────────────

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("DISCORD_WEBHOOK_URL secret is not set.");
  process.exit(1);
}

// Load the set of GUIDs we've already posted
function loadSeen() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

// Save updated set back to disk (GitHub Actions will commit it)
function saveSeen(seen) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify([...seen]), "utf8");
}

// POST a single embed to Discord
async function postToDiscord(item) {
  const isNew = (item.title || "").toLowerCase().includes("created");

  // RSS titles from Fandom look like:  "PageName - Summary text"
  // or just "PageName" with the summary in the content
  const titleParts = (item.title || "Untitled").split(" - ");
  const pageName = titleParts[0].trim();
  const summary  = titleParts.slice(1).join(" - ").trim() || "*(no summary)*";

  // Creator / editor is in item.author or item.creator
  const editor = item.creator || item.author || "Unknown";

  const embed = {
    title: isNew ? `📄 New page: ${pageName}` : `✏️ Edited: ${pageName}`,
    url: item.link || RSS_URL,
    color: isNew ? COLOR_NEW : COLOR_EDIT,
    fields: [
      { name: "Editor",      value: editor,  inline: true },
      { name: "Edit Summary", value: summary, inline: true },
    ],
    footer: { text: "VV: Ultimatum Wiki" },
    timestamp: item.isoDate || new Date().toISOString(),
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Discord error ${res.status}:`, text);
  }

  // Discord rate-limits webhooks to 30 req/min — add a small delay between posts
  await new Promise((r) => setTimeout(r, 1000));
}

async function main() {
  const parser = new Parser();
  let feed;

  try {
    feed = await parser.parseURL(RSS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VVWikiNotifier/1.0)"
      }
    });
  } catch (err) {
    console.error("Failed to fetch RSS feed:", err.message);
    process.exit(1);
  }

  const seen = loadSeen();
  const entries = (feed.items || []).slice(0, MAX_ENTRIES);

  // Process oldest-first so Discord messages appear in chronological order
  const newEntries = entries
    .filter((item) => item.guid && !seen.has(item.guid))
    .reverse();

  if (newEntries.length === 0) {
    console.log("No new edits since last run.");
    saveSeen(seen);
    return;
  }

  console.log(`Found ${newEntries.length} new edit(s). Posting to Discord...`);

  for (const item of newEntries) {
    await postToDiscord(item);
    seen.add(item.guid);
    console.log("Posted:", item.title);
  }

  saveSeen(seen);
  console.log("Done.");
}

main();
