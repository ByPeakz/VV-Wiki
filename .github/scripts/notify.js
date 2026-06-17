/**
 * .github/scripts/notify.js
 *
 * Polls the VV: Ultimatum wiki Recent Changes RSS feed.
 * Posts any edits from the last 6 minutes to Discord.
 * No file cache needed — time-based filtering handles deduplication.
 */

const Parser = require("rss-parser");

// ── CONFIG ────────────────────────────────────────────────────────────────────

const RSS_URL =
  "https://vv-ultimatum.fandom.com/wiki/Special:RecentChanges?feed=rss";

// Post edits newer than this many minutes (slightly more than the cron interval)
const LOOKBACK_MINUTES = 6;

const COLOR_EDIT = 0x5865f2; // blurple
const COLOR_NEW  = 0x57f287; // green

// ─────────────────────────────────────────────────────────────────────────────

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("DISCORD_WEBHOOK_URL secret is not set.");
  process.exit(1);
}

async function postToDiscord(item) {
  const isNew = (item.title || "").toLowerCase().includes("created");

  const titleParts = (item.title || "Untitled").split(" - ");
  const pageName = titleParts[0].trim();
  const summary  = titleParts.slice(1).join(" - ").trim() || "*(no summary)*";
  const editor   = item.creator || item.author || "Unknown";

  const embed = {
    title: isNew ? `📄 New page: ${pageName}` : `✏️ Edited: ${pageName}`,
    url: item.link || RSS_URL,
    color: isNew ? COLOR_NEW : COLOR_EDIT,
    fields: [
      { name: "Editor",       value: editor,  inline: true },
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

  // Respect Discord's rate limit (30 req/min)
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

  const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);

  const newEntries = (feed.items || [])
    .filter((item) => item.isoDate && new Date(item.isoDate) > cutoff)
    .reverse(); // oldest first so Discord shows them in order

  if (newEntries.length === 0) {
    console.log("No new edits in the last", LOOKBACK_MINUTES, "minutes.");
    return;
  }

  console.log(`Found ${newEntries.length} new edit(s). Posting to Discord...`);

  for (const item of newEntries) {
    await postToDiscord(item);
    console.log("Posted:", item.title);
  }

  console.log("Done.");
}

main();
