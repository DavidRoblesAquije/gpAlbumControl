// ===== DATA =====
const TOTAL = 628;

// Special shiny sticker IDs (numeric)
const SHINIES = new Set([
  33, 34, 36, 37, 56, 62, 82, 92, 102, 112, 122, 148, 159, 183, 190, 200, 210,
  220, 240, 252, 264, 289, 304, 314, 324, 350, 360, 386, 408, 428, 444, 450,
  480, 486, 541, 559, 564, 591, 594, 605,
]);

// Build section groups: numbers 1-613 in groups of 20, then specials T01-T15
const SECTIONS = [];
for (let start = 1; start <= 613; start += 20) {
  const end = Math.min(start + 19, 613);
  const ids = [];
  for (let i = start; i <= end; i++) ids.push(String(i));
  SECTIONS.push({ label: `${start}–${end}`, ids, special: false });
}
// T-section
const tIds = [];
for (let i = 1; i <= 15; i++) tIds.push(`T${String(i).padStart(2, "0")}`);
SECTIONS.push({ label: "Especiales", ids: tIds, special: true });

// ===== STATE =====
const STORAGE_KEY = "mundial2026_v2";
let state = {}; // id -> count (0=missing,1=pasted,>=2=duplicates)

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) {
    state = {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCount(id) {
  return state[id] || 0;
}

function setCount(id, n) {
  if (n <= 0) delete state[id];
  else state[id] = n;
  saveState();
}

// ===== COMPUTED STATS =====
function getStats() {
  let tengo = 0,
    repetidas = 0;
  const allIds = getAllIds();
  for (const id of allIds) {
    const c = getCount(id);
    if (c >= 1) tengo++;
    if (c >= 2) repetidas += c - 1;
  }
  const faltan = TOTAL - tengo;
  const pct = Math.round((tengo / TOTAL) * 100);
  return { tengo, faltan, repetidas, pct };
}

function getAllIds() {
  const ids = [];
  for (let i = 1; i <= 613; i++) ids.push(String(i));
  for (let i = 1; i <= 15; i++) ids.push(`T${String(i).padStart(2, "0")}`);
  return ids;
}

// ===== CURRENT TAB =====
let currentTab = "todas";

function setTab(tab) {
  currentTab = tab;
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  renderGrid();
}

// ===== LONG PRESS =====
let pressTimer = null;
let pressTarget = null;
let longPressTriggered = false;

function startPress(el, id) {
  longPressTriggered = false;
  pressTarget = el;
  el.classList.add("pressing");
  pressTimer = setTimeout(() => {
    longPressTriggered = true;
    el.classList.remove("pressing");
    handleLongPress(id);
  }, 500);
}

function endPress(el, id) {
  clearTimeout(pressTimer);
  el.classList.remove("pressing");
  if (!longPressTriggered) {
    handleClick(id);
  }
  longPressTriggered = false;
}

function cancelPress(el) {
  clearTimeout(pressTimer);
  el.classList.remove("pressing");
  longPressTriggered = false;
}

// ===== CLICK HANDLER =====
function handleClick(id) {
  const c = getCount(id);
  setCount(id, c + 1);
  updateSticker(id);
  updateStats();
}

// ===== LONG PRESS HANDLER =====
let modalId = null;
let modalQty = 1;

function handleLongPress(id) {
  const c = getCount(id);
  if (c < 1) return; // nothing to remove
  // Always open modal so the user can decide what to do
  openModal(id);
}

function openModal(id) {
  const c = getCount(id);
  const dups = c - 1; // extras beyond the 1 in the album
  modalId = id;
  modalQty = 1;
  document.getElementById("modal-num").textContent = id;

  if (dups <= 0) {
    // Has exactly 1 — offer to remove the sticker entirely
    document.getElementById("modal-title").textContent = "Quitar figurita";
    document.getElementById("modal-desc").textContent =
      "Tienes esta figurita. ¿Quitarla del álbum?";
    document.getElementById("modal-stepper").style.display = "none";
  } else {
    // Has duplicates — let user decide how many extras to remove
    document.getElementById("modal-title").textContent = "Quitar repetidas";
    document.getElementById("modal-desc").textContent =
      `Tienes ${dups} repetida${dups > 1 ? "s" : ""}`;
    document.getElementById("modal-stepper").style.display = "";
    document.getElementById("modal-qty").textContent = modalQty;
    updateStepBtns(dups);
  }

  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  modalId = null;
}

function stepQty(delta) {
  const c = getCount(modalId);
  const dups = c - 1;
  modalQty = Math.max(1, Math.min(dups, modalQty + delta));
  document.getElementById("modal-qty").textContent = modalQty;
  updateStepBtns(dups);
}

function updateStepBtns(dups) {
  document.getElementById("step-minus").disabled = modalQty <= 1;
  document.getElementById("step-plus").disabled = modalQty >= dups;
}

function confirmRemove() {
  if (!modalId) return;
  const c = getCount(modalId);
  const dups = c - 1;
  if (dups <= 0) {
    // Remove the sticker entirely (undo a wrong click)
    setCount(modalId, 0);
    updateSticker(modalId);
    updateStats();
    closeModal();
    showToast(`Figurita ${modalId} quitada del álbum`);
  } else {
    // Remove some duplicates
    setCount(modalId, Math.max(1, c - modalQty));
    updateSticker(modalId);
    updateStats();
    closeModal();
    showToast(`−${modalQty} repetida${modalQty > 1 ? "s" : ""} de ${modalId}`);
  }
}

// ===== RENDER =====
function renderGrid() {
  const area = document.getElementById("content-area");
  area.innerHTML = "";

  // filter based on tab
  const filter = currentTab; // 'todas' | 'faltan' | 'repetidas'

  let totalVisible = 0;

  for (const section of SECTIONS) {
    let visibleIds;
    if (filter === "todas") {
      visibleIds = section.ids;
    } else if (filter === "faltan") {
      visibleIds = section.ids.filter((id) => getCount(id) === 0);
    } else {
      visibleIds = section.ids.filter((id) => getCount(id) >= 2);
    }

    if (visibleIds.length === 0) continue;
    totalVisible += visibleIds.length;

    const group = document.createElement("div");
    group.className = section.special
      ? "section-group special-section"
      : "section-group";

    const title = document.createElement("div");
    title.className = "section-title";
    title.innerHTML = `
        ${section.special ? "⭐ " : ""}${section.label}
        <span class="sec-count">${visibleIds.length}</span>
      `;
    group.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "sticker-grid";

    for (const id of visibleIds) {
      grid.appendChild(createStickerEl(id, section.special));
    }

    group.appendChild(grid);
    area.appendChild(group);
  }

  // Empty state
  if (totalVisible === 0) {
    const emp = document.createElement("div");
    emp.className = "empty-state";
    if (filter === "faltan") {
      emp.innerHTML = `<span class="emoji">🎉</span><h3>¡Álbum completo!</h3><p>Tienes todas las figuritas</p>`;
    } else {
      emp.innerHTML = `<span class="emoji">✨</span><h3>Sin repetidas</h3><p>No tienes figuritas repetidas</p>`;
    }
    area.appendChild(emp);
  }

  // Reset area
  const resetArea = document.createElement("div");
  resetArea.className = "reset-area";
  resetArea.innerHTML = `<button class="reset-btn" onclick="confirmReset()">🗑 Reiniciar álbum</button>`;
  area.appendChild(resetArea);
}

function createStickerEl(id, isSectionSpecial) {
  const c = getCount(id);
  const isOwned = c >= 1;
  const isShiny = SHINIES.has(Number(id)) || isSectionSpecial;

  const el = document.createElement("div");
  el.className = `sticker${isOwned ? " owned" : ""}${isShiny ? " special" : ""}`;
  el.dataset.id = id;

  const numSpan = document.createElement("span");
  numSpan.className = "s-num";

  // For T stickers, show just the number part
  if (id.startsWith("T")) {
    numSpan.textContent = id;
    numSpan.style.fontSize = "9px";
  } else {
    numSpan.textContent = id;
  }
  el.appendChild(numSpan);

  if (c >= 2) {
    const badge = document.createElement("span");
    badge.className = "dup-badge";
    badge.textContent = `+${c - 1}`;
    el.appendChild(badge);
  }

  // Events
  el.addEventListener("mousedown", () => startPress(el, id));
  el.addEventListener("mouseup", () => endPress(el, id));
  el.addEventListener("mouseleave", () => cancelPress(el));
  el.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      startPress(el, id);
    },
    { passive: false },
  );
  el.addEventListener("touchend", (e) => {
    e.preventDefault();
    endPress(el, id);
  });
  el.addEventListener("touchcancel", () => cancelPress(el));

  return el;
}

function updateSticker(id) {
  // update specific sticker elements without full re-render
  const elements = document.querySelectorAll(`.sticker[data-id="${id}"]`);
  if (!elements.length) {
    // need to re-render if this sticker now should appear/disappear
    renderGrid();
    return;
  }

  const c = getCount(id);
  const isOwned = c >= 1;
  const isShiny = SHINIES.has(Number(id));
  const isTSpecial = id.startsWith("T");

  elements.forEach((el) => {
    el.classList.toggle("owned", isOwned);

    // Remove old badge
    const oldBadge = el.querySelector(".dup-badge");
    if (oldBadge) el.removeChild(oldBadge);

    if (c >= 2) {
      const badge = document.createElement("span");
      badge.className = "dup-badge";
      badge.textContent = `+${c - 1}`;
      el.appendChild(badge);
    }
  });

  // If sticker visibility changes (tab filter), re-render
  if (currentTab !== "todas") {
    renderGrid();
  }
}

function updateStats() {
  const s = getStats();
  const circumference = 188.5;
  const offset = circumference - (s.pct / 100) * circumference;

  document.getElementById("ring-fill").style.strokeDashoffset = offset;
  document.getElementById("ring-pct").textContent = s.pct + "%";
  document.getElementById("stat-tengo").textContent = s.tengo;
  document.getElementById("stat-faltan").textContent = s.faltan;
  document.getElementById("stat-repetidas").textContent = s.repetidas;

  document.getElementById("badge-todas").textContent = TOTAL;
  document.getElementById("badge-faltan").textContent = s.faltan;
  document.getElementById("badge-repetidas").textContent = s.repetidas;
}

// ===== TOAST =====
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ===== RESET =====
function confirmReset() {
  if (
    confirm(
      "⚠️ ¿Seguro que quieres reiniciar el álbum? Se perderá todo el progreso.",
    )
  ) {
    state = {};
    saveState();
    renderGrid();
    updateStats();
    showToast("Álbum reiniciado");
  }
}

// ===== CLOSE MODAL ON OVERLAY CLICK =====
document.getElementById("modal").addEventListener("click", function (e) {
  if (e.target === this) closeModal();
});

// ===== INIT =====
loadState();
renderGrid();
updateStats();
