const express = require("express");
const fs = require("fs");
const path = require("path");

const logger = require("./logger");
const settings = require("./settings");
const chub = require("./chub");

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

// ---- Search ----

app.get("/api/search", async (req, res) => {
  const { q = "", page = "0", sort = "download_count", nsfw = "false" } = req.query;
  logger.debug("GET /api/search", { q, page, sort, nsfw });

  try {
    const results = await chub.search({
      query: q,
      page: Number(page) || 0,
      sort,
      nsfw: nsfw === "true",
    });
    logger.info("Search completed", { query: q, page, resultCount: results.length });
    res.json({ results });
  } catch (err) {
    logger.error("Search failed", err);
    res.status(502).json({ error: err.message });
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
  const { fullPath, name, destinationIds } = req.body || {};
  logger.debug("POST /api/download", { fullPath, name, destinationIdCount: destinationIds?.length });

  if (!fullPath || !Array.isArray(destinationIds) || destinationIds.length === 0) {
    logger.warn("Invalid download request", { fullPath, destinationIdCount: destinationIds?.length });
    return res.status(400).json({ error: "fullPath and destinationIds are required" });
  }

  const destinations = settings.listDestinations().filter((d) => destinationIds.includes(d.id));
  if (destinations.length === 0) {
    logger.warn("No matching destinations found", { destinationIds });
    return res.status(400).json({ error: "No matching destinations found" });
  }

  try {
    logger.info("Starting download", { fullPath, destinationCount: destinations.length });
    const buffer = await chub.downloadCard(fullPath);
    logger.info("Card downloaded", { fullPath, sizeBytes: buffer.length });

    const baseName = sanitizeFilename(name || fullPath.split("/").pop());
    const written = [];
    const failed = [];

    for (const dest of destinations) {
      try {
        const target = uniqueTargetPath(dest.path, baseName);
        fs.writeFileSync(target, buffer);
        logger.info("File written", { destination: dest.label, file: target });
        written.push({ destination: dest.label, file: target });
      } catch (writeErr) {
        logger.error("Failed to write file for destination", writeErr);
        failed.push({ destination: dest.label, error: writeErr.message });
      }
    }

    if (failed.length > 0) {
      logger.warn("Download partially completed", { fullPath, filesWritten: written.length, filesFailed: failed.length });
      return res.status(207).json({ ok: written.length > 0, written, failed });
    }

    logger.info("Download completed successfully", { fullPath, filesWritten: written.length });
    res.json({ ok: true, written });
  } catch (err) {
    logger.error("Download failed", err);
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  logger.info(`Server started at http://localhost:${PORT}`);
});
