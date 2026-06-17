/**
 * .github/scripts/notify.js
 *
 * Polls the VV: Ultimatum wiki Recent Changes via the MediaWiki API.
 * Posts any edits from the last 6 minutes to Discord.
 * No external dependencies — uses Node's built-in fetch.
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────

// Using the MediaWiki API instead of RSS to avoid Fandom's bot blocking
const API_URL =
  "https://vv-ultimatum.fandom.com/api.php?action=query&list=recentchanges&rcprop=title|user|comment|timestamp|ids&rclimit=20&rctype=edit|new&format=json&origin=*";

const LOOKBACK_MINUTES = 6;

const COLOR_EDIT = 0x5865f2;
const COLOR_NEW  = 0x57f287;

// ─────────────────────────────────────────────────────────────────────────────

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("DISCORD_WEBHOOK_URL secret is not set.");
  process.exit(1);
}

async function postToDiscord(change) {
  const isNew    = change.type === "new";
  const pageName = change.title;
  const editor   = change.user    || "Unknown";
  const summary  = change.comment || "*(no summary)*";
  const pageUrl  = `https://vv-ultimatum.fandom.com/wiki/${encodeURIComponent(pageName.replace(/ /g, "_"))}`;

  const embed = {
    title: isNew ? `📄 New page: ${pageName}` : `✏️ Edited: ${pageName}`,
    url:   pageUrl,
    color: isNew ? COLOR_NEW : COLOR_EDIT,
    fields: [
      { name: "Editor",       value: editor,  inline: true },
      { name: "Edit Summary", value: summary, inline: true },
    ],
    footer:    { text: "VV: Ultimatum Wiki" },
    timestamp: change.timestamp || new Date().toISOString(),
  };

  const res = await fetch(webhookUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    console.error(`Discord error ${res.status}:`, await res.text());
  }

  // Respect Discord rate limit (30 req/min)
  await new Promise((r) => setTimeout(r, 1000));
}

async function main() {
  const res = await fetch(API_URL, {
    headers: {
      "User-Agent": "VVWikiNotifier/1.0 (GitHub Actions; vv-ultimatum.fandom.com)",
      "Accept":     "application/json",
    },
  });

  if (!res.ok) {
    console.error("Failed to fetch from MediaWiki API:", res.status);
    process.exit(1);
  }

  const data = await res.json();
  const changes = data?.query?.recentchanges || [];

  if (changes.length === 0) {
    console.log("No recent changes returned by API.");
    return;
  }

  const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);

  const newEntries = changes
    .filter((c) => c.timestamp && new Date(c.timestamp) > cutoff)
    .reverse(); // oldest first

  if (newEntries.length === 0) {
    console.log("No new edits in the last", LOOKBACK_MINUTES, "minutes.");
    return;
  }

  console.log(`Found ${newEntries.length} new edit(s). Posting to Discord...`);

  for (const change of newEntries) {
    await postToDiscord(change);
    console.log("Posted:", change.title);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
