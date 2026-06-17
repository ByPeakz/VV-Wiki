/**
 * .github/scripts/notify.js
 *
 * Polls the VV: Ultimatum wiki Recent Changes RSS feed.
 * Posts any edits from the last 6 minutes to Discord.
 * Uses no external dependencies — just Node's built-in fetch and XML parsing.
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────

const RSS_URL =
  "https://vv-ultimatum.fandom.com/wiki/Special:RecentChanges?feed=rss";

const LOOKBACK_MINUTES = 6;

const COLOR_EDIT = 0x5865f2;
const COLOR_NEW  = 0x57f287;

// ─────────────────────────────────────────────────────────────────────────────

const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
if (!webhookUrl) {
  console.error("DISCORD_WEBHOOK_URL secret is not set.");
  process.exit(1);
}

// Minimal XML field extractor — pulls the text content of the first matching tag
function extractAll(xml, tag) {
  const results = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  let match;
  while ((match = re.exec(xml)) !== null) {
    results.push(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim());
  }
  return results;
}

function parseRSS(xml) {
  const titles    = extractAll(xml, "title").slice(1);  // skip channel title
  const links     = extractAll(xml, "link").slice(1);
  const dates     = extractAll(xml, "pubDate");
  const creators  = extractAll(xml, "dc:creator");
  const summaries = extractAll(xml, "description").slice(1);

  return titles.map((title, i) => ({
    title:     title,
    link:      links[i]     || "",
    pubDate:   dates[i]     || "",
    creator:   creators[i]  || "Unknown",
    summary:   summaries[i] || "",
  }));
}

async function postToDiscord(item) {
  const isNew = item.title.toLowerCase().includes("created");

  const titleParts = item.title.split(" - ");
  const pageName   = titleParts[0].trim();
  const summary    = titleParts.slice(1).join(" - ").trim() || "*(no summary)*";

  const embed = {
    title: isNew ? `📄 New page: ${pageName}` : `✏️ Edited: ${pageName}`,
    url:   item.link || RSS_URL,
    color: isNew ? COLOR_NEW : COLOR_EDIT,
    fields: [
      { name: "Editor",       value: item.creator, inline: true },
      { name: "Edit Summary", value: summary,       inline: true },
    ],
    footer:    { text: "VV: Ultimatum Wiki" },
    timestamp: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
  };

  const res = await fetch(webhookUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ embeds: [embed] }),
  });

  if (!res.ok) {
    console.error(`Discord error ${res.status}:`, await res.text());
  }

  // Respect Discord rate limit
  await new Promise((r) => setTimeout(r, 1000));
}

async function main() {
  const res = await fetch(RSS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; VVWikiNotifier/1.0)" },
  });

  if (!res.ok) {
    console.error("Failed to fetch RSS feed:", res.status);
    process.exit(1);
  }

  const xml   = await res.text();
  const items = parseRSS(xml);

  const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000);

  const newEntries = items
    .filter((item) => item.pubDate && new Date(item.pubDate) > cutoff)
    .reverse();

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

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
