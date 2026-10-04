// Minimal client for Chub.ai's (CharacterHub) public search/download API.
// The old /api/characters/search and /api/characters/download endpoints were
// retired; search now goes through the /search proxy (which requires
// browser-like headers, including Referer/Origin, to pass Chub's WAF), and
// cards are downloaded straight from the CDN URL the search response
// provides (max_res_url), since character download now requires auth.

const logger = require("./logger");

const SEARCH_URL = "https://api.chub.ai/search";
const avatarUrl = (fullPath) => `https://avatars.charhub.io/avatars/${fullPath}/avatar.webp`;
const fallbackDownloadUrl = (fullPath) => `https://avatars.charhub.io/avatars/${fullPath}/chara_card_v2.png`;

// Chub's WAF blocks requests that don't look like they came from a browser
// on chub.ai itself.
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://chub.ai/",
  Origin: "https://chub.ai",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

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
    const res = await fetch(`${SEARCH_URL}?${params.toString()}`, { headers: BROWSER_HEADERS });

    if (!res.ok) {
      logger.error("Chub search API error", { status: res.status, statusText: res.statusText });
      throw new Error(`Chub search failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const nodes = Array.isArray(data?.data?.nodes) ? data.data.nodes : [];
    logger.info("Chub search succeeded", { query, page, nodeCount: nodes.length });

    return nodes.map((node) => ({
      fullPath: node.fullPath,
      name: node.name,
      author: node.fullPath ? node.fullPath.split("/")[0] : "",
      tagline: node.tagline || "",
      tags: Array.isArray(node.topics) ? node.topics : [],
      thumbnail: avatarUrl(node.fullPath),
      downloadUrl: node.max_res_url || fallbackDownloadUrl(node.fullPath),
    }));
  } catch (err) {
    logger.error("Chub search error", err);
    throw err;
  }
}

async function downloadCard(downloadUrl) {
  logger.debug("Chub.downloadCard called", { downloadUrl });

  try {
    logger.info("Requesting Chub download", { downloadUrl });
    const res = await fetch(downloadUrl, { headers: BROWSER_HEADERS });

    if (!res.ok) {
      logger.error("Chub download API error", { downloadUrl, status: res.status, statusText: res.statusText });
      throw new Error(`Chub download failed: HTTP ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logger.info("Chub download succeeded", { downloadUrl, sizeBytes: buffer.length });
    return buffer;
  } catch (err) {
    logger.error("Chub download error", err);
    throw err;
  }
}

module.exports = { search, downloadCard };
