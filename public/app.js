const state = {
  destinations: [],
  page: 0,
  query: "",
  sort: "download_count",
  nsfw: false,
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
    list.innerHTML = '<p class="hint">Папок пока нет. Добавьте хотя бы одну ниже.</p>';
  }
  for (const dest of state.destinations) {
    const row = document.createElement("div");
    row.className = "destRow";
    row.innerHTML = `
      <div>
        <div>${dest.label}</div>
        <div class="path">${dest.path}</div>
      </div>
      <button class="danger small" data-id="${dest.id}">Удалить</button>
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
    el("settingsError").textContent = data.error || "Не удалось добавить папку";
    return;
  }
  el("destLabel").value = "";
  el("destPath").value = "";
  await loadDestinations();
});

el("toggleSettings").addEventListener("click", () => {
  el("settingsPanel").classList.toggle("hidden");
});

// ---- Search ----

async function runSearch(reset) {
  if (reset) {
    state.page = 0;
    state.results = [];
  }
  state.query = el("query").value.trim();
  state.sort = el("sort").value;
  state.nsfw = el("nsfw").checked;

  const params = new URLSearchParams({
    q: state.query,
    page: String(state.page),
    sort: state.sort,
    nsfw: String(state.nsfw),
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
el("query").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch(true);
});
el("loadMore").addEventListener("click", () => {
  state.page += 1;
  runSearch(false);
});

function renderResults() {
  const grid = el("results");
  grid.innerHTML = "";
  for (const card of state.results) {
    grid.appendChild(renderCard(card));
  }
}

function renderCard(card) {
  const node = document.createElement("div");
  node.className = "card";

  const destOptions = state.destinations
    .map(
      (d) => `
      <label><input type="checkbox" class="destCheckbox" value="${d.id}" checked> ${d.label}</label>
    `
    )
    .join("");

  node.innerHTML = `
    <img src="${card.thumbnail}" alt="${card.name}" loading="lazy" onerror="this.style.visibility='hidden'">
    <div class="body">
      <div class="name">${card.name}</div>
      <div class="author">by ${card.author}</div>
      <div class="tagline">${card.tagline}</div>
      <div class="tags">${card.tags.slice(0, 5).map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      <div class="destPick">${destOptions || "<span>Нет папок назначения</span>"}</div>
      <div class="downloadRow">
        <button class="small downloadBtn">Скачать</button>
      </div>
      <div class="status"></div>
    </div>
  `;

  node.querySelector(".downloadBtn").addEventListener("click", () => downloadCard(card, node));
  return node;
}

async function downloadCard(card, node) {
  const statusEl = node.querySelector(".status");
  const destinationIds = [...node.querySelectorAll(".destCheckbox:checked")].map((cb) => cb.value);

  if (destinationIds.length === 0) {
    statusEl.textContent = "Выберите папку назначения";
    statusEl.style.color = "var(--danger)";
    return;
  }

  statusEl.textContent = "Скачивание...";
  statusEl.style.color = "";

  try {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullPath: card.fullPath, name: card.name, destinationIds }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Download failed");

    if (data.failed && data.failed.length > 0) {
      const okList = data.written.map((w) => w.destination).join(", ") || "никуда";
      const failList = data.failed.map((f) => f.destination).join(", ");
      statusEl.textContent = `Частично: сохранено (${okList}), не удалось (${failList})`;
      statusEl.style.color = "var(--danger)";
      showToast(`Не удалось сохранить в: ${failList}`, true);
    } else {
      statusEl.textContent = `Готово: ${data.written.map((w) => w.destination).join(", ")}`;
    }
  } catch (err) {
    statusEl.textContent = "Ошибка";
    statusEl.style.color = "var(--danger)";
    showToast(err.message, true);
  }
}

loadDestinations();
