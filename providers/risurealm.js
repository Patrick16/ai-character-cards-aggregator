// RisuRealm "import by link" support.
//
// RisuRealm publishes an official, documented, unauthenticated download API
// (https://realm.risuai.net/help/api): GET /api/v1/download/:format/:id.
// They explicitly do NOT document or sanction a search endpoint, so unlike
// Chub this isn't wired in as a browsable source — instead the user pastes
// a character link and we resolve + download that one card through the
// documented endpoint. Some cards' creators disable API downloads via their
// license settings; that surfaces as a 403 we pass through as a clear error.

const logger = require("../logger");

const SOURCE = "risurealm";
const BASE = "https://realm.risuai.net";

function extractId(input) {
  const str = String(input || "").trim();
  const urlMatch = str.match(/risuai\.(?:net|xyz)\/character\/([a-zA-Z0-9-]+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9-]{8,}$/.test(str)) return str;
  return null;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function fetchOgMeta(id) {
  const res = await fetch(`${BASE}/character/${id}`);
  if (!res.ok) throw new Error(`RisuRealm character page not found (HTTP ${res.status})`);
  const html = await res.text();

  const get = (prop) => {
    const m = html.match(new RegExp(`<meta property="og:${prop}" content="([^"]*)"`));
    return m ? decodeHtmlEntities(m[1]) : "";
  };

  return { title: get("title"), description: get("description"), image: get("image") };
}

async function fetchCardData(id) {
  const res = await fetch(`${BASE}/api/v1/download/json-v2/${id}?cors=true&access_token=guest&non_commercial=true`);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.data || json || null;
}

async function resolve(input) {
  const id = extractId(input);
  if (!id) throw new Error("Could not find a RisuRealm character id in that link");

  logger.info("Resolving RisuRealm character", { id });
  const meta = await fetchOgMeta(id);
  const card = await fetchCardData(id);

  const details = card
    ? {
        description: card.description || meta.description || "",
        personality: card.personality || "",
        scenario: card.scenario || "",
        firstMessage: card.first_mes || "",
      }
    : { description: meta.description || "" };

  return {
    source: SOURCE,
    id,
    name: card?.name || meta.title || "Unknown character",
    author: "",
    tagline: (details.description || "").slice(0, 160),
    tags: Array.isArray(card?.tags) ? card.tags : [],
    thumbnail: meta.image || "",
    details,
  };
}

async function getBuffer({ id }) {
  let lastError = null;

  for (const format of ["png-v3", "png-v2"]) {
    const res = await fetch(`${BASE}/api/v1/download/${format}/${id}?cors=true&access_token=guest&non_commercial=true`);
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      logger.info("RisuRealm download succeeded", { id, format, sizeBytes: arrayBuffer.byteLength });
      return Buffer.from(arrayBuffer);
    }
    const body = await res.json().catch(() => ({}));
    lastError = body.message || `HTTP ${res.status}`;
    if (res.status !== 403) break;
  }

  logger.error("RisuRealm download blocked", { id, error: lastError });
  throw new Error(`RisuRealm won't allow downloading this card: ${lastError}`);
}

module.exports = { id: SOURCE, label: "RisuRealm", searchable: false, resolve, getBuffer };
