// "My Library" source: browses character cards that already sit in your
// configured destination folders (TavernAI / SillyTavern characters dirs),
// reading metadata straight out of each PNG's embedded chara data.
// This stands in for an external platform: it's a searchable, taggable view
// of characters you already have, deduplicated across folders by name+author.

const fs = require("fs");
const path = require("path");

const logger = require("../logger");
const settings = require("../settings");
const { parseCharacterCard } = require("../lib/pngCard");

const SOURCE = "local";

function scanAll() {
  const destinations = settings.listDestinations();
  const items = [];

  for (const dest of destinations) {
    let files;
    try {
      files = fs.readdirSync(dest.path);
    } catch (err) {
      logger.warn("Local library: cannot read destination folder", { destination: dest.label, error: err.message });
      continue;
    }

    for (const file of files) {
      if (!file.toLowerCase().endsWith(".png")) continue;
      const fullFile = path.join(dest.path, file);

      try {
        const stat = fs.statSync(fullFile);
        if (!stat.isFile()) continue;

        const buffer = fs.readFileSync(fullFile);
        const card = parseCharacterCard(buffer) || {};
        const name = card.name || path.basename(file, ".png");

        items.push({
          name,
          author: card.creator || "",
          description: card.description || "",
          personality: card.personality || "",
          scenario: card.scenario || "",
          firstMessage: card.first_mes || "",
          tags: Array.isArray(card.tags) ? card.tags : [],
          file: fullFile,
          destinationId: dest.id,
          destinationLabel: dest.label,
          mtimeMs: stat.mtimeMs,
        });
      } catch (err) {
        logger.warn("Local library: failed to read card", { file: fullFile, error: err.message });
      }
    }
  }

  return items;
}

function groupItems(items) {
  const map = new Map();

  for (const item of items) {
    const key = `${item.name.toLowerCase()}::${(item.author || "").toLowerCase()}`;
    const location = { destinationId: item.destinationId, label: item.destinationLabel, file: item.file };

    if (!map.has(key)) {
      map.set(key, { ...item, id: key, locations: [location] });
    } else {
      const group = map.get(key);
      group.locations.push(location);
      if (item.mtimeMs > group.mtimeMs) {
        Object.assign(group, item, { id: key, locations: group.locations });
      }
    }
  }

  return [...map.values()];
}

function findById(id) {
  const groups = groupItems(scanAll());
  return groups.find((g) => g.id === id) || null;
}

async function search({ query = "", tags = [], page = 0, first = 24 }) {
  logger.debug("Local.search called", { query, tags, page, first });

  const groups = groupItems(scanAll());
  const q = query.trim().toLowerCase();
  const tagFilters = (tags || []).map((t) => t.toLowerCase()).filter(Boolean);

  let filtered = groups.filter((item) => {
    if (q) {
      const haystack = `${item.name} ${item.author} ${item.description}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (tagFilters.length > 0) {
      const itemTags = (item.tags || []).map((t) => t.toLowerCase());
      if (!tagFilters.every((t) => itemTags.includes(t))) return false;
    }
    return true;
  });

  filtered.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const start = page * first;
  const pageItems = filtered.slice(start, start + first);

  logger.info("Local search succeeded", { query, tags, page, totalMatches: filtered.length, returned: pageItems.length });

  return pageItems.map((item) => ({
    source: SOURCE,
    id: item.id,
    name: item.name,
    author: item.author,
    tagline: (item.description || "").slice(0, 160),
    tags: item.tags,
    thumbnail: `/api/local/thumbnail?id=${encodeURIComponent(item.id)}`,
    locations: item.locations,
    details: {
      description: item.description,
      personality: item.personality,
      scenario: item.scenario,
      firstMessage: item.firstMessage,
    },
  }));
}

async function getBuffer({ id }) {
  const item = findById(id);
  if (!item) throw new Error("Local card not found (it may have been moved or deleted)");
  return fs.readFileSync(item.file);
}

module.exports = { id: SOURCE, label: "My Library (local files)", search, getBuffer, findById, supportsNsfwSort: false };
