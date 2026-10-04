// Reads character-card metadata embedded in a PNG's tEXt/zTXt chunks
// (the "chara" keyword used by Tavern-style V2/V3 character cards).

const zlib = require("zlib");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readChunks(buffer) {
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.slice(dataStart, dataStart + length);
    chunks.push({ type, data });
    offset = dataStart + length + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

function extractText(chunks, keyword) {
  for (const chunk of chunks) {
    if (chunk.type !== "tEXt" && chunk.type !== "zTXt") continue;
    const nullIdx = chunk.data.indexOf(0);
    if (nullIdx === -1) continue;
    const kw = chunk.data.toString("latin1", 0, nullIdx);
    if (kw !== keyword) continue;

    if (chunk.type === "tEXt") {
      return chunk.data.toString("latin1", nullIdx + 1);
    }
    try {
      const compressed = chunk.data.slice(nullIdx + 2);
      return zlib.inflateSync(compressed).toString("latin1");
    } catch {
      return null;
    }
  }
  return null;
}

// Returns the parsed character JSON (the inner `data` object for V2/V3 cards),
// or null if the file isn't a PNG or has no embedded character data.
function parseCharacterCard(buffer) {
  if (!buffer || buffer.length < 8 || !buffer.slice(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }

  let chunks;
  try {
    chunks = readChunks(buffer);
  } catch {
    return null;
  }

  const raw = extractText(chunks, "chara") || extractText(chunks, "ccv3");
  if (!raw) return null;

  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    return json && typeof json === "object" && json.data ? json.data : json;
  } catch {
    return null;
  }
}

module.exports = { parseCharacterCard };
