const state = {
  destinations: [],
  sources: [],
  page: 0,
  query: "",
  tags: "",
  sort: "download_count",
  nsfw: false,
  source: "chub",
  results: [],
};

const el = (id) => document.getElementById(id);

function showToast(message, isError = false) {
  const toast = el("toast");
  toast.textContent = message;
  toast.className = `toast ${isError ? "error" : ""}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.add("hidden"), 4000);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- Destinations ----

async function loadDestinations() {
  const res = await fetch("/api/destinations");
  state.destinations = await res.json();
  renderDestinations();
}

function renderDestinations() {
  const list = el("destinationList");
  list.innerHTML = "";
  if (state.destinations.length === 0) {
    list.innerHTML = '<p class="hint">No folders yet. Add at least one below.</p>';
  }
  for (const dest of state.destinations) {
    const row = document.createElement("div");
    row.className = "destRow";
    row.innerHTML = `
      <div>
        <div>${escapeHtml(dest.label)}</div>
        <div class="path">${escapeHtml(dest.path)}</div>
      </div>
      <button class="danger small" data-id="${dest.id}">Remove</button>
    `;
    row.querySelector("button").addEventListener("click", () => removeDestination(dest.id));
    list.appendChild(row);
  }
  // Re-render result cards so their destination checkboxes stay in sync.
  renderResults();
}

async function removeDestination(id) {
  await fetch(`/api/destinations/${id}`, { method: "DELETE" });
  await loadDestinations();
}

el("addDestinationForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("settingsError").textContent = "";
  const label = el("destLabel").value.trim();
  const path = el("destPath").value.trim();
  const res = await fetch("/api/destinations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, path }),
  });
  const data = await res.json();
  if (!res.ok) {
    el("settingsError").textContent = data.error || "Could not add folder";
    return;
  }
  el("destLabel").value = "";
  el("destPath").value = "";
  await loadDestinations();
});

el("toggleSettings").addEventListener("click", () => {
  el("settingsPanel").classList.toggle("hidden");
});

// ---- Sources ----

async function loadSources() {
  const res = await fetch("/api/sources");
  state.sources = await res.json();
  const select = el("source");
  select.innerHTML = state.sources.map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join("");
  select.value = state.source;
  applySourceVisibility();
}

function applySourceVisibility() {
  const provider = state.sources.find((s) => s.id === state.source);
  const chubOnly = !!provider?.supportsNsfwSort;
  el("sort").classList.toggle("hidden", !chubOnly);
  el("nsfw").closest("label").classList.toggle("hidden", !chubOnly);
}

el("source").addEventListener("change", () => {
  state.source = el("source").value;
  applySourceVisibility();
  runSearch(true);
});

// ---- Search ----

async function runSearch(reset) {
  if (reset) {
    state.page = 0;
    state.results = [];
  }
  state.query = el("query").value.trim();
  state.tags = el("tags").value.trim();
  state.sort = el("sort").value;
  state.nsfw = el("nsfw").checked;

  const params = new URLSearchParams({
    q: state.query,
    tags: state.tags,
    page: String(state.page),
    sort: state.sort,
    nsfw: String(state.nsfw),
    source: state.source,
  });

  try {
    const res = await fetch(`/api/search?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed");
    state.results = reset ? data.results : [...state.results, ...data.results];
    el("loadMoreWrap").classList.toggle("hidden", data.results.length === 0);
    renderResults();
  } catch (err) {
    showToast(err.message, true);
  }
}

el("searchBtn").addEventListener("click", () => runSearch(true));
for (const inputId of ["query", "tags"]) {
  el(inputId).addEventListener("keydown", (e) => {
    if (e.key === "Enter") runSearch(true);
  });
}
el("loadMore").addEventListener("click", () => {
  state.page += 1;
  runSearch(false);
});

function cardKey(card) {
  return `${card.source}::${card.id}`;
}

function findCard(key) {
  return state.results.find((c) => cardKey(c) === key);
}

// ---- Rendering ----

function renderResults() {
  const grid = el("results");
  grid.innerHTML = "";
  for (const card of state.results) {
    grid.appendChild(renderCard(card));
  }
}

function renderLocationsBadge(card) {
  if (!card.locations || card.locations.length === 0) {
    return '<span class="badge notDownloaded">Not downloaded</span>';
  }
  const byDestination = new Map();
  for (const loc of card.locations) {
    if (!byDestination.has(loc.destinationId)) byDestination.set(loc.destinationId, loc);
  }
  const labels = [...byDestination.values()].map((l) => escapeHtml(l.label));
  const titles = card.locations.map((l) => l.file).join("\n");
  return `<span class="badge downloaded" title="${escapeHtml(titles)}">In: ${labels.join(", ")}</span>`;
}

function renderDestPicker(card) {
  if (state.destinations.length === 0) return "<span>No destination folders</span>";
  return state.destinations
    .map((d) => {
      const already = (card.locations || []).some((l) => l.destinationId === d.id);
      return `<label class="${already ? "already" : ""}"><input type="checkbox" class="destCheckbox" value="${d.id}" ${already ? "" : "checked"}> ${escapeHtml(d.label)}${already ? " (already here)" : ""}</label>`;
    })
    .join("");
}

function renderCard(card) {
  const node = document.createElement("div");
  node.className = "card";
  node.dataset.key = cardKey(card);

  node.innerHTML = `
    <img src="${card.thumbnail}" alt="${escapeHtml(card.name)}" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="body">
      <div class="name">${escapeHtml(card.name)}</div>
      <div class="author">by ${escapeHtml(card.author)}</div>
      <div class="tagline">${escapeHtml(card.tagline)}</div>
      <div class="tags">${card.tags.slice(0, 5).map((t) => `<span class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join("")}</div>
      <div class="locations">${renderLocationsBadge(card)}</div>
      <div class="destPick">${renderDestPicker(card)}</div>
      <div class="downloadRow">
        <button class="small detailsBtn ghost">Details</button>
        <button class="small downloadBtn">Download</button>
      </div>
      <div class="status"></div>
    </div>
  `;

  node.querySelector(".downloadBtn").addEventListener("click", () => downloadCard(card, node));
  node.querySelector(".detailsBtn").addEventListener("click", () => openModal(card));
  node.querySelector("img").addEventListener("click", () => openModal(card));
  for (const tagEl of node.querySelectorAll(".tag")) {
    tagEl.addEventListener("click", () => addTagFilter(tagEl.dataset.tag));
  }
  return node;
}

function addTagFilter(tag) {
  const current = el("tags").value.split(",").map((t) => t.trim()).filter(Boolean);
  if (!current.includes(tag)) current.push(tag);
  el("tags").value = current.join(", ");
  runSearch(true);
}

async function downloadCard(card, node) {
  const statusEl = node.querySelector(".status");
  const destinationIds = [...node.querySelectorAll(".destCheckbox:checked")].map((cb) => cb.value);

  if (destinationIds.length === 0) {
    statusEl.textContent = "Pick a destination folder";
    statusEl.style.color = "var(--danger)";
    return;
  }

  statusEl.textContent = "Downloading...";
  statusEl.style.color = "";

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: card.source,
        id: card.id,
        fullPath: card.id,
        downloadUrl: card.downloadUrl,
        name: card.name,
        destinationIds,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Download failed");

    card.locations = card.locations || [];
    for (const w of data.written || []) {
      if (!card.locations.some((l) => l.destinationId === w.destinationId)) {
        card.locations.push({ destinationId: w.destinationId, label: w.destination, file: w.file });
      }
    }

    if (data.failed && data.failed.length > 0) {
      const okList = (data.written || []).map((w) => w.destination).join(", ") || "nowhere";
      const failList = data.failed.map((f) => f.destination).join(", ");
      statusEl.textContent = `Partial: saved to (${okList}), failed (${failList})`;
      statusEl.style.color = "var(--danger)";
      showToast(`Failed to save to: ${failList}`, true);
    } else {
      statusEl.textContent = `Saved to: ${data.written.map((w) => w.destination).join(", ")}`;
    }

    refreshCardChrome(card);
  } catch (err) {
    statusEl.textContent = "Error";
    statusEl.style.color = "var(--danger)";
    showToast(err.message, true);
  }
}

function refreshCardChrome(card) {
  const key = cardKey(card);
  const cardNode = document.querySelector(`.card[data-key="${CSS.escape(key)}"]`);
  if (cardNode) {
    cardNode.querySelector(".locations").innerHTML = renderLocationsBadge(card);
    cardNode.querySelector(".destPick").innerHTML = renderDestPicker(card);
  }
  if (el("modalBackdrop").dataset.key === key) {
    renderModalBody(card);
  }
}

// ---- Details modal ----

function statsLine(card) {
  const s = card.stats;
  if (!s) return "";
  const parts = [];
  if (s.rating) parts.push(`★ ${s.rating.toFixed ? s.rating.toFixed(1) : s.rating} (${s.ratingCount})`);
  if (s.favorites) parts.push(`${s.favorites} favorites`);
  if (s.chats) parts.push(`${s.chats} chats`);
  if (s.createdAt) parts.push(`created ${new Date(s.createdAt).toLocaleDateString()}`);
  return parts.length ? `<div class="modalStats">${parts.map(escapeHtml).join(" · ")}</div>` : "";
}

function detailSection(title, text) {
  if (!text) return "";
  return `<div class="modalSection"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text)}</p></div>`;
}

function renderModalBody(card) {
  const d = card.details || {};
  el("modalContent").innerHTML = `
    <div class="modalHeader">
      <img src="${card.thumbnail}" alt="${escapeHtml(card.name)}" onerror="this.style.visibility='hidden'">
      <div>
        <h3>${escapeHtml(card.name)}</h3>
        <div class="author">by ${escapeHtml(card.author)}</div>
        ${statsLine(card)}
        <div class="tags">${(card.tags || []).map((t) => `<span class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join("")}</div>
      </div>
    </div>
    ${detailSection("Description", d.description)}
    ${detailSection("Personality", d.personality)}
    ${detailSection("Scenario", d.scenario)}
    ${detailSection("First message", d.firstMessage)}
    <div class="locations">${renderLocationsBadge(card)}</div>
    <div class="destPick">${renderDestPicker(card)}</div>
    <div class="downloadRow"><button class="small downloadBtn">Download</button></div>
    <div class="status"></div>
  `;
  el("modalContent").querySelector(".downloadBtn").addEventListener("click", () => downloadCard(card, el("modalContent")));
  for (const tagEl of el("modalContent").querySelectorAll(".tag")) {
    tagEl.addEventListener("click", () => {
      closeModal();
      addTagFilter(tagEl.dataset.tag);
    });
  }
}

function openModal(card) {
  el("modalBackdrop").dataset.key = cardKey(card);
  renderModalBody(card);
  el("modalBackdrop").classList.remove("hidden");
}

function closeModal() {
  el("modalBackdrop").classList.add("hidden");
  el("modalBackdrop").dataset.key = "";
}

el("modalClose").addEventListener("click", closeModal);
el("modalBackdrop").addEventListener("click", (e) => {
  if (e.target === el("modalBackdrop")) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// ---- Init ----

(async function init() {
  await loadSources();
  await loadDestinations();
  runSearch(true);
})();
