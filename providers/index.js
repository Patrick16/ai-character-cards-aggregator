// Registry of search providers. Each provider implements:
//   { id, label, search(params) -> Promise<result[]>, getBuffer(result) -> Promise<Buffer>, supportsNsfwSort }
//
// To add another platform, write providers/<name>.js with that shape and
// register it below. Several well-known sites (JanitorAI-style directories,
// RisuRealm) either require authentication or sit behind bot-detection that
// blocks unauthenticated scraping, so they aren't wired in here yet — add
// them once they expose a stable public API.

const chub = require("./chub");
const local = require("./local");
const risurealm = require("./risurealm");

const PROVIDERS = { [chub.id]: chub, [local.id]: local, [risurealm.id]: risurealm };

// Only providers that support a real search() show up as a browsable source
// (the dropdown). RisuRealm is resolve-only (see providers/risurealm.js).
function list() {
  return Object.values(PROVIDERS)
    .filter((p) => p.searchable !== false)
    .map((p) => ({ id: p.id, label: p.label, supportsNsfwSort: !!p.supportsNsfwSort }));
}

function get(sourceId) {
  const provider = PROVIDERS[sourceId];
  if (!provider) throw new Error(`Unknown source: ${sourceId}`);
  return provider;
}

module.exports = { list, get };
