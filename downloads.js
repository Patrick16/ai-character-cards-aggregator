// Tracks every card this tool has downloaded (source + external id -> which
// destination folder it was written to), so search results can show
// "already downloaded" status per folder.

const fs = require("fs");
const path = require("path");

const logger = require("./logger");

const DOWNLOADS_PATH = path.join(__dirname, "data", "downloads.json");

function load() {
  try {
    const raw = fs.readFileSync(DOWNLOADS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch (err) {
    logger.debug("No downloads registry yet, starting empty", { error: err.message });
    return [];
  }
}

function save(entries) {
  fs.mkdirSync(path.dirname(DOWNLOADS_PATH), { recursive: true });
  fs.writeFileSync(DOWNLOADS_PATH, JSON.stringify({ entries }, null, 2), "utf8");
}

function record({ source, externalId, name, destinationId, file }) {
  logger.debug("Recording download", { source, externalId, destinationId, file });
  const entries = load();
  entries.push({ source, externalId, name, destinationId, file, downloadedAt: new Date().toISOString() });
  save(entries);
}

// Returns { [externalId]: [{ destinationId, file, downloadedAt }] } for the given source/ids.
function lookup(source, externalIds) {
  const idSet = new Set(externalIds);
  const map = {};
  for (const id of idSet) map[id] = [];

  for (const entry of load()) {
    if (entry.source === source && idSet.has(entry.externalId)) {
      map[entry.externalId].push({ destinationId: entry.destinationId, file: entry.file, downloadedAt: entry.downloadedAt });
    }
  }
  return map;
}

module.exports = { record, lookup };
