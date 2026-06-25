// ===== FIREBASE SETUP =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAk4YbkVfRU7_d72yz2EA6wLKG4UYDVRB0",
  authDomain: "mialbumgp.firebaseapp.com",
  projectId: "mialbumgp",
  storageBucket: "mialbumgp.firebasestorage.app",
  messagingSenderId: "567792590628",
  appId: "1:567792590628:web:5290a65bfd63d1b9aeddb1",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ===== AUTH LOGIC =====
let currentUser = null;

window.handleLogin = async () => {
  try {
    showSync(true);
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Login failed", error);
    showToast("Error al iniciar sesión");
  } finally {
    showSync(false);
  }
};

window.handleLogout = async () => {
  try {
    localStorage.removeItem("last_album_id");
    localStorage.removeItem("last_album_name");
    await signOut(auth);
    location.reload(); 
  } catch (error) {
    console.error("Logout failed", error);
  }
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  // Always show album-screen initially to ensure login card is visible
  document.getElementById("album-screen").classList.remove("hidden");
  
  if (user) {
    document.getElementById("auth-section").classList.add("hidden");
    document.getElementById("albums-container").classList.remove("hidden");
    updateUserProfileUI(user);
    checkAndMigrateLegacyData(user.uid);
    
    // Resume session if possible
    const lastId = localStorage.getItem("last_album_id");
    const lastName = localStorage.getItem("last_album_name");
    
    if (lastId && lastName) {
      await selectAlbum(lastId, lastName);
    } else {
      renderAlbumScreen();
    }
  } else {
    document.getElementById("auth-section").classList.remove("hidden");
    document.getElementById("albums-container").classList.add("hidden");
    document.querySelectorAll(".user-profile").forEach(el => el.classList.add("hidden"));
  }
  
  // Hide initial loading screen
  const loader = document.getElementById("loading-screen");
  if (loader) {
    loader.classList.add("fade-out");
    setTimeout(() => loader.remove(), 500);
  }
});

function updateUserProfileUI(user) {
  document.querySelectorAll(".user-profile").forEach(el => el.classList.remove("hidden"));
  document.getElementById("user-photo-home").src = user.photoURL;
  document.getElementById("user-photo-view").src = user.photoURL;
  document.getElementById("user-name-home").textContent = user.displayName;
}

// ===== MIGRATION LOGIC =====
async function checkAndMigrateLegacyData(uid) {
  const deviceId = localStorage.getItem("album_device_id");
  if (!deviceId) return;

  const deviceAlbumsSnap = await getDocs(collection(db, "devices", deviceId, "albums"));
  if (!deviceAlbumsSnap.empty) {
    const confirmMigrate = confirm("Hemos detectado álbumes en este dispositivo. ¿Quieres moverlos a tu cuenta de Google para verlos en cualquier lugar?");
    if (confirmMigrate) {
      showSync(true);
      for (const albumDocRef of deviceAlbumsSnap.docs) {
        await setDoc(doc(db, "users", uid, "albums", albumDocRef.id), albumDocRef.data());
        await deleteDoc(albumDocRef.ref);
      }
      localStorage.removeItem("album_device_id");
      showToast("¡Álbumes migrados con éxito!");
      renderAlbumScreen();
      showSync(false);
    }
  }
}

// ===== FIRESTORE HELPERS =====
function albumsCol() {
  if (!currentUser) return null;
  return collection(db, "users", currentUser.uid, "albums");
}

function albumDoc(albumId) {
  if (!currentUser) return null;
  return doc(db, "users", currentUser.uid, "albums", albumId);
}

function showSync(visible) {
  document
    .querySelectorAll(".sync-indicator")
    .forEach((el) => el.classList.toggle("hidden", !visible));
}

// ===== DATA =====
const TOTAL = 628;

const SHINIES = new Set([
  33, 34, 36, 37, 56, 62, 82, 92, 102, 112, 122, 148, 159, 183, 190, 200, 210,
  220, 240, 252, 264, 289, 304, 314, 324, 350, 360, 386, 408, 428, 444, 450,
  480, 486, 541, 559, 564, 591, 594, 605,
]);

// Build section groups
const SECTIONS = [];
for (let start = 1; start <= 613; start += 20) {
  const end = Math.min(start + 19, 613);
  const ids = [];
  for (let i = start; i <= end; i++) ids.push(String(i));
  SECTIONS.push({ label: `${start}–${end}`, ids, special: false });
}
const tIds = [];
for (let i = 1; i <= 15; i++) tIds.push(`T${String(i).padStart(2, "0")}`);
SECTIONS.push({ label: "Especiales", ids: tIds, special: true });

// ===== STATE =====
let state = {};           
let currentAlbumId = null;
let currentAlbumName = "";
let saveTimeout = null;   

function getCount(id) {
  return state[id] || 0;
}

function setCount(id, n) {
  if (n <= 0) delete state[id];
  else state[id] = n;
  debouncedSave();
}

function debouncedSave() {
  clearTimeout(saveTimeout);
  showSync(true);
  saveTimeout = setTimeout(async () => {
    await saveCurrentAlbum();
    showSync(false);
  }, 500);
}

async function saveCurrentAlbum() {
  if (!currentAlbumId || !currentUser) return;
  await setDoc(albumDoc(currentAlbumId), {
    name: currentAlbumName,
    stickers: state,
    updatedAt: Date.now(),
  });
}

async function loadAlbum(albumId, albumName) {
  showSync(true);
  const snap = await getDoc(albumDoc(albumId));
  if (snap.exists()) {
    state = snap.data().stickers || {};
  } else {
    state = {};
  }
  currentAlbumId = albumId;
  currentAlbumName = albumName;
  showSync(false);
}

// ===== ALBUM SCREEN =====
// ===== LEGACY IMPORT =====
const LEGACY_KEY = "mundial2026_v2";

window.importLegacyData = async function () {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) { showToast("No hay datos guardados para importar"); return; }

  let stickers;
  try { stickers = JSON.parse(raw); } catch { showToast("Error al leer los datos"); return; }

  const name = prompt("¿Qué nombre le pones a este álbum?", "GP 1");
  if (!name || !name.trim()) return;

  const albumId = "album_" + Date.now();
  showSync(true);
  await setDoc(albumDoc(albumId), {
    name: name.trim(),
    stickers,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  showSync(false);

  // Remove legacy key so the banner doesn't appear again
  localStorage.removeItem(LEGACY_KEY);
  showToast(`✅ Álbum "${name.trim()}" importado con éxito`);
  renderAlbumScreen();
};

async function renderAlbumScreen() {
  document.getElementById("album-screen").classList.remove("hidden");
  document.getElementById("album-view").classList.add("hidden");
  document.title = "Mis Álbumes 🏆";

  const list = document.getElementById("albums-list");
  list.innerHTML = `<div class="albums-loading">Cargando…</div>`;

  const snap = await getDocs(albumsCol());
  list.innerHTML = "";

  // Show import banner if old localStorage data exists
  const legacyRaw = localStorage.getItem(LEGACY_KEY);
  if (legacyRaw) {
    const banner = document.createElement("div");
    banner.className = "import-banner";
    banner.innerHTML = `
      <span class="import-banner-icon">💾</span>
      <div class="import-banner-text">
        <strong>Tienes datos guardados localmente</strong>
        <span>Impórtalos como un álbum en la nube</span>
      </div>
      <button class="import-banner-btn" onclick="importLegacyData()">Importar</button>
    `;
    list.appendChild(banner);
  }

  if (snap.empty && !legacyRaw) {
    const empty = document.createElement("div");
    empty.className = "albums-empty";
    empty.textContent = "No tienes álbumes aún. ¡Crea el primero!";
    list.appendChild(empty);
    return;
  }

  const albums = [];
  snap.forEach((d) => albums.push({ id: d.id, ...d.data() }));
  albums.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  for (const album of albums) {
    const stickers = album.stickers || {};
    const tengo = Object.keys(stickers).filter((k) => stickers[k] >= 1).length;
    const pct = Math.round((tengo / TOTAL) * 100);

    const card = document.createElement("div");
    card.className = "album-card";
    card.innerHTML = `
      <div class="album-card-info" onclick="selectAlbum('${album.id}', \`${album.name.replace(/`/g, "'")}\`)">
        <div class="album-card-icon">🏆</div>
        <div class="album-card-text">
          <div class="album-card-name">${album.name}</div>
          <div class="album-card-sub">${tengo} / ${TOTAL} figuritas · ${pct}%</div>
        </div>
        <div class="album-card-pct">${pct}%</div>
      </div>
      <button class="album-delete-btn" title="Eliminar álbum" onclick="deleteAlbum('${album.id}', \`${album.name.replace(/`/g, "'")}\`)">🗑</button>
    `;
    list.appendChild(card);
  }
}

window.selectAlbum = async function (albumId, albumName) {
  // Save session
  localStorage.setItem("last_album_id", albumId);
  localStorage.setItem("last_album_name", albumName);

  await loadAlbum(albumId, albumName);
  document.getElementById("album-screen").classList.add("hidden");
  document.getElementById("album-view").classList.remove("hidden");
  document.getElementById("album-view-title").textContent = albumName;
  document.title = `${albumName} 🏆`;
  renderGrid();
  updateStats();
};

window.goBackToAlbums = function () {
  // Clear session
  localStorage.removeItem("last_album_id");
  localStorage.removeItem("last_album_name");
  
  currentAlbumId = null;
  state = {};
  renderAlbumScreen();
};

window.deleteAlbum = async function (albumId, albumName) {
  if (!confirm(`¿Eliminar el álbum "${albumName}"? Se perderá todo el progreso.`)) return;
  showSync(true);
  await deleteDoc(albumDoc(albumId));
  showSync(false);
  showToast(`Álbum "${albumName}" eliminado`);
  renderAlbumScreen();
};

// ===== NEW ALBUM MODAL =====
window.openNewAlbumModal = function () {
  const input = document.getElementById("new-album-name");
  input.value = "";
  document.getElementById("modal-new-album").classList.remove("hidden");
  setTimeout(() => input.focus(), 100);
};

window.closeNewAlbumModal = function () {
  document.getElementById("modal-new-album").classList.add("hidden");
};

window.confirmNewAlbum = async function () {
  const name = document.getElementById("new-album-name").value.trim();
  if (!name) {
    showToast("Escribe un nombre para el álbum");
    return;
  }
  closeNewAlbumModal();

  const albumId = "album_" + Date.now();
  showSync(true);
  await setDoc(albumDoc(albumId), {
    name,
    stickers: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  showSync(false);
  showToast(`Álbum "${name}" creado`);
  renderAlbumScreen();
};

// Close new album modal on overlay click
document.getElementById("modal-new-album").addEventListener("click", function (e) {
  if (e.target === this) closeNewAlbumModal();
});

// ===== CURRENT TAB =====
let currentTab = "todas";

window.setTab = function (tab) {
  currentTab = tab;
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  renderGrid();
};

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
  if (c < 1) return;
  openModal(id);
}

window.openModal = function (id) {
  const c = getCount(id);
  const dups = c - 1;
  modalId = id;
  modalQty = 1;
  document.getElementById("modal-num").textContent = id;

  if (dups <= 0) {
    document.getElementById("modal-title").textContent = "Quitar figurita";
    document.getElementById("modal-desc").textContent =
      "Tienes esta figurita. ¿Quitarla del álbum?";
    document.getElementById("modal-stepper").style.display = "none";
  } else {
    document.getElementById("modal-title").textContent = "Quitar repetidas";
    document.getElementById("modal-desc").textContent =
      `Tienes ${dups} repetida${dups > 1 ? "s" : ""}`;
    document.getElementById("modal-stepper").style.display = "";
    document.getElementById("modal-qty").textContent = modalQty;
    updateStepBtns(dups);
  }

  document.getElementById("modal").classList.remove("hidden");
};

window.closeModal = function () {
  document.getElementById("modal").classList.add("hidden");
  modalId = null;
};

window.stepQty = function (delta) {
  const c = getCount(modalId);
  const dups = c - 1;
  modalQty = Math.max(1, Math.min(dups, modalQty + delta));
  document.getElementById("modal-qty").textContent = modalQty;
  updateStepBtns(dups);
};

function updateStepBtns(dups) {
  document.getElementById("step-minus").disabled = modalQty <= 1;
  document.getElementById("step-plus").disabled = modalQty >= dups;
}

window.confirmRemove = function () {
  if (!modalId) return;
  const c = getCount(modalId);
  const dups = c - 1;
  if (dups <= 0) {
    setCount(modalId, 0);
    updateSticker(modalId);
    updateStats();
    closeModal();
    showToast(`Figurita ${modalId} quitada del álbum`);
  } else {
    setCount(modalId, Math.max(1, c - modalQty));
    updateSticker(modalId);
    updateStats();
    closeModal();
    showToast(`−${modalQty} repetida${modalQty > 1 ? "s" : ""} de ${modalId}`);
  }
};

// ===== RENDER =====
function renderGrid() {
  const area = document.getElementById("content-area");
  area.innerHTML = "";

  const filter = currentTab;
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
  const elements = document.querySelectorAll(`.sticker[data-id="${id}"]`);
  if (!elements.length) {
    renderGrid();
    return;
  }

  const c = getCount(id);
  const isOwned = c >= 1;

  elements.forEach((el) => {
    el.classList.toggle("owned", isOwned);
    const oldBadge = el.querySelector(".dup-badge");
    if (oldBadge) el.removeChild(oldBadge);
    if (c >= 2) {
      const badge = document.createElement("span");
      badge.className = "dup-badge";
      badge.textContent = `+${c - 1}`;
      el.appendChild(badge);
    }
  });

  if (currentTab !== "todas") {
    renderGrid();
  }
}

function updateStats() {
  let tengo = 0, repetidas = 0;
  const allIds = getAllIds();
  for (const id of allIds) {
    const c = getCount(id);
    if (c >= 1) tengo++;
    if (c >= 2) repetidas += c - 1;
  }
  const faltan = TOTAL - tengo;
  const pct = Math.round((tengo / TOTAL) * 100);

  const circumference = 188.5;
  const offset = circumference - (pct / 100) * circumference;

  document.getElementById("ring-fill").style.strokeDashoffset = offset;
  document.getElementById("ring-pct").textContent = pct + "%";
  document.getElementById("stat-tengo").textContent = tengo;
  document.getElementById("stat-faltan").textContent = faltan;
  document.getElementById("stat-repetidas").textContent = repetidas;

  document.getElementById("badge-todas").textContent = TOTAL;
  document.getElementById("badge-faltan").textContent = faltan;
  document.getElementById("badge-repetidas").textContent = repetidas;
}

function getAllIds() {
  const ids = [];
  for (let i = 1; i <= 613; i++) ids.push(String(i));
  for (let i = 1; i <= 15; i++) ids.push(`T${String(i).padStart(2, "0")}`);
  return ids;
}

// ===== TOAST =====
let toastTimer = null;
window.showToast = function (msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
};

// ===== RESET =====
window.confirmReset = function () {
  if (
    confirm(
      "⚠️ ¿Seguro que quieres reiniciar el álbum? Se perderá todo el progreso.",
    )
  ) {
    state = {};
    debouncedSave();
    renderGrid();
    updateStats();
    showToast("Álbum reiniciado");
  }
};

// ===== CLOSE STICKER MODAL ON OVERLAY CLICK =====
document.getElementById("modal").addEventListener("click", function (e) {
  if (e.target === this) closeModal();
});

// ===== INIT =====
