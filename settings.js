const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const logger = require("./logger");

const SETTINGS_PATH = path.join(__dirname, "data", "settings.json");

function load() {
  try {
    logger.debug("Loading settings", { path: SETTINGS_PATH });
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    if (!Array.isArray(data.destinations)) data.destinations = [];
    logger.debug("Settings loaded successfully", { destinationCount: data.destinations.length });
    return data;
  } catch (err) {
    logger.warn("Failed to load settings, using defaults", { error: err.message });
    return { destinations: [] };
  }
}

function save(data) {
  try {
    logger.debug("Saving settings", { path: SETTINGS_PATH, destinationCount: data.destinations?.length || 0 });
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), "utf8");
    logger.debug("Settings saved successfully");
  } catch (err) {
    logger.error("Failed to save settings", err);
    throw err;
  }
}

function listDestinations() {
  logger.debug("Listing destinations");
  const destinations = load().destinations;
  logger.debug("Listed destinations", { count: destinations.length });
  return destinations;
}

function addDestination({ label, folderPath }) {
  logger.debug("Adding destination", { label, folderPath });

  try {
    const resolved = path.resolve(folderPath);
    logger.debug("Resolved path", { resolved });

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      logger.error("Path is not a directory", { resolved });
      throw new Error("Path exists but is not a directory");
    }

    const data = load();
    const entry = { id: crypto.randomUUID(), label: label || resolved, path: resolved };
    data.destinations.push(entry);
    save(data);

    logger.info("Destination added successfully", { id: entry.id, label: entry.label, path: entry.path });
    return entry;
  } catch (err) {
    logger.error("Failed to add destination", err);
    throw err;
  }
}

function removeDestination(id) {
  logger.debug("Removing destination", { id });

  try {
    const data = load();
    const beforeCount = data.destinations.length;
    data.destinations = data.destinations.filter((d) => d.id !== id);
    const afterCount = data.destinations.length;

    if (beforeCount === afterCount) {
      logger.warn("Destination not found", { id });
    } else {
      save(data);
      logger.info("Destination removed successfully", { id, remainingCount: afterCount });
    }
  } catch (err) {
    logger.error("Failed to remove destination", err);
    throw err;
  }
}

module.exports = { listDestinations, addDestination, removeDestination };
