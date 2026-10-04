const express = require("express");
const fs = require("fs");
const path = require("path");

const logger = require("./logger");
const settings = require("./settings");
const downloads = require("./downloads");
const providers = require("./providers");

const app = express();
const PORT = process.env.PORT || 4321;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Destinations (target folders for downloaded cards) ----

app.get("/api/destinations", (req, res) => {
  logger.debug("GET /api/destinations");
  try {
    const destinations = settings.listDestinations();
    logger.info("Listed destinations", { count: destinations.length });
    res.json(destinations);
  } catch (err) {
    logger.error("Failed to list destinations", err);
    res.status(500).json({ error: "Failed to list destinations" });
  }
});

app.post("/api/destinations", (req, res) => {
  const { label, path: folderPath } = req.body || {};
  logger.debug("POST /api/destinations", { label, folderPath });

  if (!folderPath) {
    logger.warn("Missing folderPath in request");
    return res.status(400).json({ error: "folderPath is required" });
  }

  try {
    const entry = settings.addDestination({ label, folderPath });
    logger.info("Destination added", { id: entry.id, label: entry.label, path: entry.path });
    res.json(entry);
  } catch (err) {
    logger.error("Failed to add destination", err);
    res.status(400).json({ error: `Folder not usable: ${err.message}` });
  }
});

app.delete("/api/destinations/:id", (req, res) => {
  const { id } = req.params;
  logger.debug("DELETE /api/destinations/:id", { id });
  try {
    settings.removeDestination(id);
    logger.info("Destination removed", { id });
    res.json({ ok: true });
  } catch (err) {
    logger.error("Failed to remove destination", err);
    res.status(500).json({ error: "Failed to remove destination" });
  }
});

// ---- Sources ----

app.get("/api/sources", (req, res) => {
  res.json(providers.list());
});

// ---- Search ----

function attachLocations(source, results) {
  const destinations = settings.listDestinations();
  const destById = new Map(destinations.map((d) => [d.id, d]));

  if (source === "local") {
    // Local provider already reports exactly where each card lives on disk.
    for (const r of results) {
      r.locations = (r.locations || [])
        .filter((loc) => destById.has(loc.destinationId))
        .map((loc) => ({ destinationId: loc.destinationId, label: destById.get(loc.destinationId).label, file: loc.file }));
    }
    return results;
  }

  const ids = results.map((r) => r.id);
  const found = downloads.lookup(source, ids);
  for (const r of results) {
    r.locations = (found[r.id] || [])
      .filter((loc) => destById.has(loc.destinationId))
      .map((loc) => ({ destinationId: loc.destinationId, label: destById.get(loc.destinationId).label, file: loc.file }));
  }
  return results;
}

app.get("/api/search", async (req, res) => {
  const { q = "", page = "0", sort = "download_count", nsfw = "false", source = "chub", tags = "" } = req.query;
  const tagList = String(tags).split(",").map((t) => t.trim()).filter(Boolean);
  logger.debug("GET /api/search", { q, page, sort, nsfw, source, tags: tagList });

  try {
    const provider = providers.get(source);
    const results = await provider.search({
      query: q,
      tags: tagList,
      page: Number(page) || 0,
      sort,
      nsfw: nsfw === "true",
    });
    attachLocations(source, results);
    logger.info("Search completed", { source, query: q, page, resultCount: results.length });
    res.json({ results });
  } catch (err) {
    logger.error("Search failed", err);
    res.status(502).json({ error: err.message });
  }
});

// ---- Import by link (sources with no sanctioned search API, e.g. RisuRealm) ----

app.post("/api/resolve", async (req, res) => {
  const { url } = req.body || {};
  logger.debug("POST /api/resolve", { url });

  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }

  try {
    const risurealm = providers.get("risurealm");
    const result = await risurealm.resolve(url);
    const [withLocations] = attachLocations(result.source, [result]);
    logger.info("Resolve completed", { source: result.source, id: result.id });
    res.json({ result: withLocations });
  } catch (err) {
    logger.error("Resolve failed", err);
    res.status(502).json({ error: err.message });
  }
});

// ---- Local library thumbnails ----

app.get("/api/local/thumbnail", (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).end();

  try {
    const local = providers.get("local");
    const item = local.findById(String(id));
    if (!item) return res.status(404).end();

    const destinations = settings.listDestinations();
    const resolvedFile = path.resolve(item.file);
    const isInsideKnownDestination = destinations.some((d) => resolvedFile.startsWith(path.resolve(d.path) + path.sep));
    if (!isInsideKnownDestination) return res.status(403).end();

    res.sendFile(resolvedFile);
  } catch (err) {
    logger.error("Failed to serve local thumbnail", err);
    res.status(500).end();
  }
});

// ---- Download ----

function sanitizeFilename(name) {
  return (name || "character")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 150) || "character";
}

function uniqueTargetPath(folder, baseName) {
  let candidate = path.join(folder, `${baseName}.png`);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(folder, `${baseName} (${n}).png`);
    n += 1;
  }
  return candidate;
}

app.post("/api/download", async (req, res) => {
  const { source = "chub", id, fullPath, downloadUrl, name, destinationIds } = req.body || {};
  logger.debug("POST /api/download", { source, id, fullPath, downloadUrl, name, destinationIdCount: destinationIds?.length });

  if (!Array.isArray(destinationIds) || destinationIds.length === 0) {
    logger.warn("Invalid download request", { destinationIdCount: destinationIds?.length });
    return res.status(400).json({ error: "destinationIds are required" });
  }

  const destinations = settings.listDestinations().filter((d) => destinationIds.includes(d.id));
  if (destinations.length === 0) {
    logger.warn("No matching destinations found", { destinationIds });
    return res.status(400).json({ error: "No matching destinations found" });
  }

  try {
    const provider = providers.get(source);
    logger.info("Starting download", { source, id, downloadUrl, destinationCount: destinations.length });
    const buffer = await provider.getBuffer({ id, downloadUrl });
    logger.info("Card downloaded", { source, id, downloadUrl, sizeBytes: buffer.length });

    const baseName = sanitizeFilename(name || (fullPath ? fullPath.split("/").pop() : null));
    const written = [];
    const failed = [];

    for (const dest of destinations) {
      try {
        const target = uniqueTargetPath(dest.path, baseName);
        fs.writeFileSync(target, buffer);
        downloads.record({ source, externalId: id, name: baseName, destinationId: dest.id, file: target });
        logger.info("File written", { destination: dest.label, file: target });
        written.push({ destinationId: dest.id, destination: dest.label, file: target });
      } catch (writeErr) {
        logger.error("Failed to write file for destination", writeErr);
        failed.push({ destinationId: dest.id, destination: dest.label, error: writeErr.message });
      }
    }

    if (failed.length > 0) {
      logger.warn("Download partially completed", { downloadUrl, filesWritten: written.length, filesFailed: failed.length });
      return res.status(207).json({ ok: written.length > 0, written, failed });
    }

    logger.info("Download completed successfully", { downloadUrl, filesWritten: written.length });
    res.json({ ok: true, written });
  } catch (err) {
    logger.error("Download failed", err);
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  logger.info(`Server started at http://localhost:${PORT}`);
});
