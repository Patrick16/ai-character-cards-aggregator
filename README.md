# AI Character Cards Aggregator

A small local web app for searching character cards on [Chub.ai](https://chub.ai) and downloading them straight into your TavernAI / SillyTavern character folders — no manual save-and-move required.

## Features

- Search Chub.ai's character card catalog (by keyword, tags, sort order, NSFW toggle)
- Browse **My Library**: a second source that indexes cards already sitting in your destination folders, read straight from each PNG's embedded data — searchable and taggable just like Chub
- See at a glance which folder(s) a card is already downloaded to, right on its card
- Click a card to open a details modal with the full description, personality, scenario, first message, tags and stats
- Manage multiple destination folders (e.g. different SillyTavern installs)
- Download a card directly into one or more destinations at once
- Automatic filename sanitization and de-duplication (`name (2).png`, etc.)
- File-based logging of requests and errors for troubleshooting

Adding another search source is a matter of dropping a `providers/<name>.js` module (see `providers/index.js`); Chub.ai and the local library are implemented this way.

## Requirements

- [Node.js](https://nodejs.org/) 18+ (uses the built-in `fetch` API)

## Setup

```bash
npm install
npm start
```

The server starts at `http://localhost:4321` by default. Open that URL in your browser.

To use a different port:

```bash
PORT=8080 npm start
```

## Usage

1. Open the app in your browser.
2. Add one or more destination folders (the local paths where character cards should be saved, e.g. your SillyTavern `characters` directory).
3. Search for cards by name/keyword.
4. Select the destination(s) and download a card — it's saved as a `.png` file ready for import.

## Logging

All requests and errors are logged to the console and to `logs/app.log`. Set the `DEBUG` environment variable to enable verbose debug-level logs:

```bash
DEBUG=1 npm start
```

## Project structure

- `server.js` — Express server and API routes
- `providers/` — Search sources, each exposing `search()` / `getBuffer()`
  - `providers/chub.js` — Chub.ai API client
  - `providers/local.js` — Scans destination folders for existing cards
- `lib/pngCard.js` — Reads embedded character data out of a card PNG
- `settings.js` — Persists destination folders to `data/settings.json`
- `downloads.js` — Tracks what's been downloaded where, in `data/downloads.json`
- `logger.js` — Simple console + file logger
- `public/` — Frontend (static HTML/CSS/JS)

## Disclaimer

This project talks to Chub.ai's public, undocumented API (reverse-engineered from the open-source [SillyTavern-Chub-Search](https://github.com/city-unit/SillyTavern-Chub-Search) extension). Endpoints may change without notice.

## License

[MIT](LICENSE)
