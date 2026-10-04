// Minimal client for Chub.ai's (CharacterHub) public search/download API.
// Endpoints reverse-engineered from the open-source SillyTavern-Chub-Search
// extension (github.com/city-unit/SillyTavern-Chub-Search). Chub does not
// publish an official API contract, so these may need updating if they change.

const logger = require("./logger");

const SEARCH_URL = "https://api.chub.ai/api/characters/search";
const DOWNLOAD_URL = "https://api.chub.ai/api/characters/download";
const avatarUrl = (fullPath) => `https://avatars.charhub.io/avatars/${fullPath}/avatar.webp`;

async function search({ query = "", page = 0, first = 24, sort = "download_count", asc = false, nsfw = false }) {
  logger.debug("Chub.search called", { query, page, first, sort, asc, nsfw });

  const params = new URLSearchParams({
    first: String(first),
    page: String(page),
    sort,
    asc: String(asc),
    venus: "true",
    include_forks: "true",
    nsfw: String(nsfw),
    require_images: "false",
    require_custom_prompt: "false",
  });
  if (query) params.set("search", query);

  try {
    logger.info("Requesting Chub API", { url: SEARCH_URL, query, page });
    const res = await fetch(`${SEARCH_URL}?${params.toString()}`);

    if (!res.ok) {
      logger.error("Chub search API error", { status: res.status, statusText: res.statusText });
      throw new Error(`Chub search failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    logger.info("Chub search succeeded", { query, page, nodeCount: nodes.length });

    return nodes.map((node) => ({
      fullPath: node.fullPath,
      name: node.name,
      author: node.fullPath ? node.fullPath.split("/")[0] : "",
      tagline: node.tagline || "",
      tags: Array.isArray(node.topics) ? node.topics : [],
      thumbnail: avatarUrl(node.fullPath),
    }));
  } catch (err) {
    logger.error("Chub search error", err);
    throw err;
  }
}

async function downloadCard(fullPath) {
  logger.debug("Chub.downloadCard called", { fullPath });

  try {
    logger.info("Requesting Chub download", { fullPath, url: DOWNLOAD_URL });
    const res = await fetch(DOWNLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullPath, format: "tavern", version: "main" }),
    });

    if (!res.ok) {
      logger.error("Chub download API error", { fullPath, status: res.status, statusText: res.statusText });
      throw new Error(`Chub download failed: HTTP ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logger.info("Chub download succeeded", { fullPath, sizeBytes: buffer.length });
    return buffer;
  } catch (err) {
    logger.error("Chub download error", err);
    throw err;
  }
}

module.exports = { search, downloadCard };
