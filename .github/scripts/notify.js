/**
 * .github/scripts/notify.js
 *
 * Polls the VV: Ultimatum wiki Recent Changes via the MediaWiki API.
 * Edits a pinned Discord message with the last 10 edits and their timestamps.
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────

const API_URL =
  "https://vv-ultimatum.fandom.com/api.php?action=query&list=recentchanges&rcprop=title|user|comment|timestamp|ids&rclimit=10&rctype=edit|new&format=json&origin=*";

const COLOR = 0x5865f2;

// ─────────────────────────────────────────────────────────────────────────────

const webhookUrl  = process.env.DISCORD_WEBHOOK_URL;
const messageId   = process.env.DISCORD_MESSAGE_ID;

if (!webhookUrl) {
  console.error("DISCORD_WEBHOOK_URL secret is not set.");
  process.exit(1);
}

if (!messageId) {
  console.error("DISCORD_MESSAGE_ID variable is not set.");
  process.exit(1);
}

function formatTimestamp(isoDate) {
  const date = new Date(isoDate);
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`; // Discord relative timestamp
}

async function main() {
  // Fetch recent changes from the MediaWiki API
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

  const data    = await res.json();
  const changes = data?.query?.recentchanges || [];

  if (changes.length === 0) {
    console.log("No recent changes returned by API.");
    return;
  }

  // Build the list of edits
  const editLines = changes.map((change) => {
    const isNew    = change.type === "new";
    const icon     = isNew ? "📄" : "✏️";
    const pageUrl  = `https://vv-ultimatum.fandom.com/wiki/${encodeURIComponent(change.title.replace(/ /g, "_"))}`;
    const summary  = change.comment ? ` — *${change.comment}*` : "";
    const time     = formatTimestamp(change.timestamp);

    return `${icon} [${change.title}](${pageUrl}) by **${change.user}**${summary}\n${time}`;
  });

  const description = editLines.join("\n\n");

  const embed = {
    title:       "📋 Recent Wiki Edits",
    description: description,
    color:       COLOR,
    footer:      { text: "VV: Ultimatum Wiki • Last updated" },
    timestamp:   new Date().toISOString(),
  };

  // Edit the pinned Discord message
  const editRes = await fetch(`${webhookUrl}/messages/${messageId}`, {
    method:  "PATCH",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ embeds: [embed] }),
  });

  if (!editRes.ok) {
    console.error(`Discord error ${editRes.status}:`, await editRes.text());
    process.exit(1);
  }

  console.log("Successfully updated Discord message with", changes.length, "edits.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
