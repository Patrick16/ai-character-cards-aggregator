const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function getTimestamp() {
  return new Date().toISOString();
}

function formatLog(level, message, data = null) {
  let output = `[${getTimestamp()}] [${level}] ${message}`;
  if (data) {
    output += ` ${JSON.stringify(data)}`;
  }
  return output;
}

function log(level, message, data = null) {
  const formatted = formatLog(level, message, data);
  console.log(formatted);

  ensureLogDir();
  try {
    fs.appendFileSync(LOG_FILE, formatted + "\n", "utf8");
  } catch (err) {
    console.error(`Failed to write to log file: ${err.message}`);
  }
}

function info(message, data = null) {
  log("INFO", message, data);
}

function error(message, err = null) {
  const data = err instanceof Error ? { message: err.message, stack: err.stack } : err;
  log("ERROR", message, data);
}

function warn(message, data = null) {
  log("WARN", message, data);
}

function debug(message, data = null) {
  if (process.env.DEBUG) {
    log("DEBUG", message, data);
  }
}

module.exports = { info, error, warn, debug };
