import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  ref,
  push,
  set,
  update,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { auth, db } from "./firebase-config.js";

const searchInput = document.getElementById("searchInput");
const filterAvailBtn = document.getElementById("filterAvailBtn");
const filterBudgetBtn = document.getElementById("filterBudgetBtn");
const filterNearMeBtn = document.getElementById("filterNearMeBtn");
const distanceStatus = document.getElementById("distanceStatus");
const roomsList = document.getElementById("roomsList");
const myRoomsList = document.getElementById("myRoomsList");

const addRoomForm = document.getElementById("addRoomForm");
const useMyLocationBtn = document.getElementById("useMyLocationBtn");
const photoInput = document.getElementById("photoInput");
const photoPreviewWrap = document.getElementById("photoPreviewWrap");
const photoPreviewImg = document.getElementById("photoPreviewImg");
const clearPhotoBtn = document.getElementById("clearPhotoBtn");
const hostFeedback = document.getElementById("hostFeedback");

let currentUser = null;
let allRooms = [];
let onlyAvailable = true;
let budgetCap = null;
let userCoords = null;
let sortByDistance = false;
let selectedPhotoDataUrl = "";
let roomsRef = null;

// Compress image to lightweight JPEG data URL for free Realtime DB storage
function compressImage(file, maxWidth = 600, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not read selected image."));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error("Failed to load file."));
    reader.readAsDataURL(file);
  });
}

// Haversine distance in kilometers
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => typeof v !== "number" || Number.isNaN(v))) {
    return null;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km) {
  if (km === null) return "";
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

// Photo selection & preview
photoInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    hostFeedback.textContent = "Optimizing photo...";
    selectedPhotoDataUrl = await compressImage(file);
    photoPreviewImg.src = selectedPhotoDataUrl;
    photoPreviewWrap.classList.remove("hidden");
    hostFeedback.textContent = "";
  } catch (err) {
    hostFeedback.textContent = err.message;
  }
});

clearPhotoBtn.addEventListener("click", () => {
  photoInput.value = "";
  selectedPhotoDataUrl = "";
  photoPreviewImg.src = "";
  photoPreviewWrap.classList.add("hidden");
});

// Host: Fill GPS coordinates automatically
useMyLocationBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    hostFeedback.textContent = "GPS is not supported on this browser.";
    return;
  }
  useMyLocationBtn.disabled = true;
  useMyLocationBtn.textContent = "Detecting GPS pin...";

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      document.getElementById("latInput").value = pos.coords.latitude.toFixed(6);
      document.getElementById("lngInput").value = pos.coords.longitude.toFixed(6);
      useMyLocationBtn.disabled = false;
      useMyLocationBtn.textContent = "✓ GPS Pin Added";
    },
    (err) => {
      hostFeedback.textContent = "Location error: " + err.message;
      useMyLocationBtn.disabled = false;
      useMyLocationBtn.textContent = "📍 Use My Current GPS Location";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// Guest: Near Me GPS distance filter
filterNearMeBtn.addEventListener("click", () => {
  if (sortByDistance) {
    sortByDistance = false;
    filterNearMeBtn.classList.remove("active");
    distanceStatus.classList.add("hidden");
    renderRooms();
    return;
  }

  if (!navigator.geolocation) {
    distanceStatus.textContent = "GPS location is not supported on this device.";
    distanceStatus.classList.remove("hidden");
    return;
  }

  distanceStatus.textContent = "Finding your GPS location...";
  distanceStatus.classList.remove("hidden");

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      sortByDistance = true;
      filterNearMeBtn.classList.add("active");
      distanceStatus.textContent = "Sorted by closest rooms to your current location.";
      renderRooms();
    },
    (err) => {
      distanceStatus.textContent = "Could not get location: " + err.message;
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// Guest: Search & Chip Filters
searchInput.addEventListener("input", renderRooms);

filterAvailBtn.addEventListener("click", () => {
  onlyAvailable = !onlyAvailable;
  filterAvailBtn.classList.toggle("active", onlyAvailable);
  filterAvailBtn.textContent = onlyAvailable ? "✓ Available Now" : "All Statuses";
  renderRooms();
});

filterBudgetBtn.addEventListener("click", () => {
  budgetCap = budgetCap === 35000 ? null : 35000;
  filterBudgetBtn.classList.toggle("active", budgetCap === 35000);
  renderRooms();
});

// Host: Publish Room
addRoomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const btn = document.getElementById("publishRoomBtn");
  try {
    btn.disabled = true;
    btn.textContent = "Publishing...";

    const amenitiesRaw = document.getElementById("amenitiesInput").value;
    const amenities = amenitiesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const newRoomRef = push(ref(db, "rooms"));
    await set(newRoomRef, {
      hostId: currentUser.uid,
      hostName: currentUser.displayName || currentUser.email,
      guesthouseName: document.getElementById("ghNameInput").value.trim(),
      roomTitle: document.getElementById("roomTitleInput").value.trim(),
      city: document.getElementById("cityInput").value.trim(),
      area: document.getElementById("areaInput").value.trim(),
      landmark: document.getElementById("landmarkInput").value.trim() || "Near main road",
      nightlyPrice: Number(document.getElementById("priceInput").value),
      hostPhone: document.getElementById("phoneInput").value.trim(),
      latitude: parseFloat(document.getElementById("latInput").value),
      longitude: parseFloat(document.getElementById("lngInput").value),
      photoUrl: selectedPhotoDataUrl || "",
      amenities: amenities.length ? amenities : ["Standard room"],
      availability: "available_now",
      createdAt: Date.now()
    });

    addRoomForm.reset();
    document.getElementById("amenitiesInput").value = "En-suite bathroom, Fan, Parking";
    useMyLocationBtn.textContent = "📍 Use My Current GPS Location";
    clearPhotoBtn.click();
    hostFeedback.textContent = "Room published live to Rooma!";
  } catch (err) {
    hostFeedback.textContent = "Error: " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Publish Room to Rooma";
  }
});

// Host: Toggle Room Availability
window.toggleRoomStatus = async (roomId, currentStatus) => {
  const nextStatus = currentStatus === "available_now" ? "occupied" : "available_now";
  await update(ref(db, `rooms/${roomId}`), { availability: nextStatus });
};

function renderRooms() {
  const q = searchInput.value.trim().toLowerCase();

  let enriched = allRooms.map((r) => {
    const distanceKm = userCoords
      ? calculateDistanceKm(userCoords.lat, userCoords.lng, Number(r.latitude), Number(r.longitude))
      : null;
    return { ...r, distanceKm };
  });

  if (sortByDistance && userCoords) {
    enriched.sort((a, b) => {
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }

  const filtered = enriched.filter((r) => {
    const matchText =
      !q ||
      (r.city || "").toLowerCase().includes(q) ||
      (r.area || "").toLowerCase().includes(q) ||
      (r.roomTitle || "").toLowerCase().includes(q) ||
      (r.guesthouseName || "").toLowerCase().includes(q) ||
      (r.landmark || "").toLowerCase().includes(q);
    const matchAvail = !onlyAvailable || r.availability === "available_now";
    const matchPrice = budgetCap === null || Number(r.nightlyPrice) <= budgetCap;
    return matchText && matchAvail && matchPrice;
  });

  if (filtered.length === 0) {
    roomsList.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:#64748b;">No matching rooms yet. Switch to <b>Host Panel</b> to upload one!</div>`;
  } else {
    roomsList.innerHTML = filtered
      .map((r) => {
        const isAvail = r.availability === "available_now";
        const mapLink = `https://www.google.com/maps?q=${r.latitude},${r.longitude}`;
        const photoHtml = r.photoUrl
          ? `<img src="${r.photoUrl}" alt="${r.roomTitle}" class="room-photo" loading="lazy" />`
          : "";
        const distBadge =
          r.distanceKm !== null
            ? `<span class="distance-pill">📍 ${formatDistance(r.distanceKm)}</span>`
            : "";

        return `
          <div class="room-card">
            <div>
              ${photoHtml}
              <div class="room-top">
                <div>
                  <div class="gh-name">${r.guesthouseName}</div>
                  <div class="room-title">${r.roomTitle}</div>
                </div>
                <span class="badge ${isAvail ? "avail" : "occ"}">
                  ${isAvail ? "Available Now" : "Occupied"}
                </span>
              </div>
              ${distBadge}
              <p class="meta-line" style="margin-top:8px;">📍 ${r.area}, ${r.city} • ${r.landmark}</p>
              <p class="sub-meta" style="margin-top:4px;">${(r.amenities || []).join(" • ")}</p>
              <p class="sub-meta" style="margin-top:4px;">
                <a href="${mapLink}" target="_blank" style="color:#0284c7;font-weight:600;">Open Map Pin (${r.latitude}, ${r.longitude})</a>
              </p>
            </div>
            <div class="room-bottom">
              <div class="price">${Number(r.nightlyPrice).toLocaleString()} TZS <span>/ night</span></div>
              <a class="btn-small" href="tel:${r.hostPhone}">Call Host</a>
            </div>
          </div>
        `;
      })
      .join("");
  }

  const mine = allRooms.filter((r) => currentUser && r.hostId === currentUser.uid);
  if (mine.length === 0) {
    myRoomsList.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:#64748b;">You haven't uploaded any rooms yet.</div>`;
  } else {
    myRoomsList.innerHTML = mine
      .map((r) => {
        const isAvail = r.availability === "available_now";
        const photoHtml = r.photoUrl
          ? `<img src="${r.photoUrl}" alt="${r.roomTitle}" class="room-photo" loading="lazy" />`
          : "";
        return `
          <div class="room-card">
            <div>
              ${photoHtml}
              <div class="room-top">
                <div>
                  <div class="gh-name">${r.guesthouseName}</div>
                  <div class="room-title">${r.roomTitle}</div>
                </div>
                <span class="badge ${isAvail ? "avail" : "occ"}">
                  ${isAvail ? "Available Now" : "Occupied"}
                </span>
              </div>
              <p class="meta-line" style="margin-top:6px;">${r.area}, ${r.city} • ${Number(r.nightlyPrice).toLocaleString()} TZS/night</p>
            </div>
            <button
              type="button"
              class="btn-small"
              style="width:100%;background:${isAvail ? "#ef4444" : "#16a34a"};"
              onclick="toggleRoomStatus('${r.id}', '${r.availability}')"
            >
              ${isAvail ? "Mark as Occupied" : "Mark as Available Now"}
            </button>
          </div>
        `;
      })
      .join("");
  }
}

// Subscribe to Realtime Database rooms when signed in
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    roomsRef = ref(db, "rooms");
    onValue(roomsRef, (snapshot) => {
      const val = snapshot.val();
      allRooms = val
        ? Object.entries(val).map(([id, data]) => ({ id, ...data }))
        : [];
      allRooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderRooms();
    });
  } else {
    if (roomsRef) off(roomsRef);
    allRooms = [];
  }
});
