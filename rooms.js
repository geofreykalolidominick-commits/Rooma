import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { auth, db } from "./firebase-config.js";

const ADMIN_EMAILS = ["geofreykalolidominick@gmail.com"];

// Navigation & Section Elements
const guestModeTab = document.getElementById("guestModeTab");
const hostModeTab = document.getElementById("hostModeTab");
const adminModeTab = document.getElementById("adminModeTab");

const guestSection = document.getElementById("guestSection");
const bookingSection = document.getElementById("bookingSection");
const hostSection = document.getElementById("hostSection");
const adminSection = document.getElementById("adminSection");

// Guest Finder Elements
const searchInput = document.getElementById("searchInput");
const filterAvailBtn = document.getElementById("filterAvailBtn");
const filterBudgetBtn = document.getElementById("filterBudgetBtn");
const filterNearMeBtn = document.getElementById("filterNearMeBtn");
const distanceStatus = document.getElementById("distanceStatus");
const roomsList = document.getElementById("roomsList");

// Booking Summary & Approval / Confirmation Elements
const backToRoomsBtn = document.getElementById("backToRoomsBtn");
const bookingRoomSummary = document.getElementById("bookingRoomSummary");
const confirmBookingForm = document.getElementById("confirmBookingForm");
const bookingNightsInput = document.getElementById("bookingNightsInput");
const savedGuestPhoneNote = document.getElementById("savedGuestPhoneNote");
const bookingTotalText = document.getElementById("bookingTotalText");
const confirmBookingBtn = document.getElementById("confirmBookingBtn");
const bookingPendingBox = document.getElementById("bookingPendingBox");
const bookingPendingRefText = document.getElementById("bookingPendingRefText");
const bookingConfirmedBox = document.getElementById("bookingConfirmedBox");
const bookingRefText = document.getElementById("bookingRefText");
const openDirectionsBtn = document.getElementById("openDirectionsBtn");
const callHostConfirmedBtn = document.getElementById("callHostConfirmedBtn");

// Host Upload & Bookings Elements
const hostBookingsList = document.getElementById("hostBookingsList");
const myRoomsList = document.getElementById("myRoomsList");
const addRoomForm = document.getElementById("addRoomForm");
const useMyLocationBtn = document.getElementById("useMyLocationBtn");
const photoInput = document.getElementById("photoInput");
const photoPreviewWrap = document.getElementById("photoPreviewWrap");
const photoPreviewImg = document.getElementById("photoPreviewImg");
const clearPhotoBtn = document.getElementById("clearPhotoBtn");
const hostFeedback = document.getElementById("hostFeedback");

// Admin Elements
const adminStatsBar = document.getElementById("adminStatsBar");
const pendingRoomsList = document.getElementById("pendingRoomsList");
const allAdminRoomsList = document.getElementById("allAdminRoomsList");
const adminBookingsList = document.getElementById("adminBookingsList");

let currentUser = null;
let isAdmin = false;
let allRooms = [];
let allBookings = [];
let activeBookingRoom = null;
let activeBookingId = null;

let onlyAvailable = true;
let budgetCap = null;
let userCoords = null;
let sortByDistance = false;
let selectedPhotoDataUrl = "";

let roomsRef = null;
let bookingsRef = null;

function isCurrentUserAdmin(user) {
  if (!user || !user.email) return false;
  return ADMIN_EMAILS.includes(user.email.trim().toLowerCase());
}

function showSection(sectionName) {
  guestSection.classList.toggle("hidden", sectionName !== "guest");
  bookingSection.classList.toggle("hidden", sectionName !== "booking");
  hostSection.classList.toggle("hidden", sectionName !== "host");
  adminSection.classList.toggle("hidden", sectionName !== "admin");

  guestModeTab.classList.toggle("active", sectionName === "guest" || sectionName === "booking");
  hostModeTab.classList.toggle("active", sectionName === "host");
  adminModeTab.classList.toggle("active", sectionName === "admin");
}

guestModeTab.addEventListener("click", () => showSection("guest"));
hostModeTab.addEventListener("click", () => showSection("host"));
adminModeTab.addEventListener("click", () => {
  if (isAdmin) showSection("admin");
});
backToRoomsBtn.addEventListener("click", () => showSection("guest"));

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
      img.onerror = () => reject(new Error("Rooma: Could not read selected image."));
      img.src = event.target.result;
    };
    reader.onerror = () => reject(new Error("Rooma: Failed to load file."));
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
  return km < 1 ? `${Math.round(km * 1000)}m away` : `${km.toFixed(1)} km away`;
}

function requestGuestLocation(silent = false) {
  if (!navigator.geolocation) {
    if (!silent) {
      distanceStatus.textContent = "Rooma: GPS location is not supported on this device.";
      distanceStatus.classList.remove("hidden");
    }
    return;
  }

  if (!silent) {
    distanceStatus.textContent = "Rooma: Finding your GPS location...";
    distanceStatus.classList.remove("hidden");
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userCoords = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      renderRooms();
      if (!silent) {
        distanceStatus.textContent = "Rooma: Sorted by closest rooms to your current location.";
        distanceStatus.classList.remove("hidden");
      }
    },
    (err) => {
      if (!silent) {
        distanceStatus.textContent = "Rooma: Could not get location — " + err.message;
        distanceStatus.classList.remove("hidden");
      }
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Photo selection & preview
photoInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    hostFeedback.textContent = "Rooma: Optimizing photo...";
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
    hostFeedback.textContent = "Rooma: GPS is not supported on this browser.";
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
      hostFeedback.textContent = "Rooma: Location error — " + err.message;
      useMyLocationBtn.disabled = false;
      useMyLocationBtn.textContent = "📍 Use My Current GPS Location";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// Guest: Sort Closest toggle
filterNearMeBtn.addEventListener("click", () => {
  if (sortByDistance) {
    sortByDistance = false;
    filterNearMeBtn.classList.remove("active");
    distanceStatus.classList.add("hidden");
    renderRooms();
    return;
  }

  sortByDistance = true;
  filterNearMeBtn.classList.add("active");
  requestGuestLocation(false);
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

// Host: Submit Room (starts as "pending" until Admin approves)
addRoomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const btn = document.getElementById("publishRoomBtn");
  try {
    btn.disabled = true;
    btn.textContent = "Submitting...";

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
      approvalStatus: "pending",
      createdAt: Date.now()
    });

    addRoomForm.reset();
    document.getElementById("amenitiesInput").value = "En-suite bathroom, Fan, Parking";
    useMyLocationBtn.textContent = "📍 Use My Current GPS Location";
    clearPhotoBtn.click();
    hostFeedback.textContent = "Rooma: Submitted! Waiting for Admin approval before going live.";
  } catch (err) {
    hostFeedback.textContent = "Rooma: Could not publish room — " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Submit Room for Approval";
  }
});

// Host: Toggle Room Availability
window.toggleRoomStatus = async (roomId, currentStatus) => {
  const nextStatus = currentStatus === "available_now" ? "occupied" : "available_now";
  await update(ref(db, `rooms/${roomId}`), { availability: nextStatus });
};

// Host: Delete Own Room After Confirmation
window.deleteHostRoom = async (roomId, encodedTitle) => {
  const title = decodeURIComponent(encodedTitle || "this room");
  const ok = confirm(`Rooma: Delete "${title}" permanently from the system? This cannot be undone.`);
  if (!ok) return;

  try {
    await remove(ref(db, `rooms/${roomId}`));
    hostFeedback.textContent = `Rooma: "${title}" has been deleted.`;
  } catch (err) {
    hostFeedback.textContent = "Rooma: Could not delete room — " + err.message;
  }
};

// Host / Admin: Approve or Decline a Booking
window.setBookingStatus = async (bookingId, nextStatus) => {
  await update(ref(db, `bookings/${bookingId}`), {
    status: nextStatus,
    updatedAt: Date.now()
  });
};

// Admin: Approve Room
window.approveRoom = async (roomId) => {
  if (!isAdmin) return;
  await update(ref(db, `rooms/${roomId}`), {
    approvalStatus: "approved",
    reviewedAt: Date.now()
  });
};

// Admin: Reject Only (keeps record marked rejected)
window.rejectRoomOnly = async (roomId) => {
  if (!isAdmin) return;
  await update(ref(db, `rooms/${roomId}`), {
    approvalStatus: "rejected",
    reviewedAt: Date.now()
  });
};

// Admin: Reject & Delete Room from System
window.rejectAndDeleteRoom = async (roomId, encodedTitle) => {
  if (!isAdmin) return;
  const title = decodeURIComponent(encodedTitle || "this room");
  const ok = confirm(`Rooma Admin: Reject and permanently delete "${title}" from the system?`);
  if (!ok) return;

  await remove(ref(db, `rooms/${roomId}`));
};

// Guest: Open Booking Summary View for a Selected Room
function updateBookingTotal() {
  if (!activeBookingRoom) return;
  const nights = Math.max(1, parseInt(bookingNightsInput.value, 10) || 1);
  const total = nights * Number(activeBookingRoom.nightlyPrice || 0);
  bookingTotalText.textContent = `${total.toLocaleString()} TZS`;
}

function syncGuestBookingStatusUI() {
  if (!activeBookingRoom || !activeBookingId) return;
  const booking = allBookings.find((b) => b.id === activeBookingId);
  if (!booking) return;

  const shortCode = `RM-${booking.id.slice(-4).toUpperCase()}`;

  if (booking.status === "approved") {
    confirmBookingForm.classList.add("hidden");
    bookingPendingBox.classList.add("hidden");
    bookingConfirmedBox.classList.remove("hidden");

    bookingRefText.textContent = `Reference: #${shortCode} • ${booking.nights} night(s) • ${Number(booking.totalTzs || 0).toLocaleString()} TZS`;
    const dest = `${activeBookingRoom.latitude},${activeBookingRoom.longitude}`;
    openDirectionsBtn.href = userCoords
      ? `https://www.google.com/maps/dir/?api=1&origin=${userCoords.lat},${userCoords.lng}&destination=${dest}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`;
    callHostConfirmedBtn.href = `tel:${activeBookingRoom.hostPhone}`;
  } else if (booking.status === "declined") {
    confirmBookingForm.classList.remove("hidden");
    bookingPendingBox.classList.add("hidden");
    bookingConfirmedBox.classList.add("hidden");
    confirmBookingBtn.disabled = false;
    confirmBookingBtn.textContent = "Request Booking Again";
    savedGuestPhoneNote.textContent = "Rooma: Previous request was declined by the host. You can send another request.";
  } else {
    confirmBookingForm.classList.add("hidden");
    bookingConfirmedBox.classList.add("hidden");
    bookingPendingBox.classList.remove("hidden");
    bookingPendingRefText.textContent = `Reference: #${shortCode} • ${booking.nights} night(s) • ${Number(booking.totalTzs || 0).toLocaleString()} TZS`;
  }
}

bookingNightsInput.addEventListener("input", updateBookingTotal);

window.openBookingPage = (roomId) => {
  const room = allRooms.find((r) => r.id === roomId);
  if (!room) return;

  activeBookingRoom = room;
  activeBookingId = null;
  bookingNightsInput.value = "1";
  updateBookingTotal();

  const savedPhone = window.roomaUserProfile?.phone || "";
  savedGuestPhoneNote.textContent = savedPhone
    ? `Your saved contact (${savedPhone}) will be shared with the host upon approval.`
    : "Your account contact will be shared with the host upon approval.";

  confirmBookingForm.classList.remove("hidden");
  bookingPendingBox.classList.add("hidden");
  bookingConfirmedBox.classList.add("hidden");
  confirmBookingBtn.disabled = false;
  confirmBookingBtn.textContent = "Request Booking";

  const distKm = userCoords
    ? calculateDistanceKm(userCoords.lat, userCoords.lng, Number(room.latitude), Number(room.longitude))
    : null;
  const distText = distKm !== null ? `<p class="distance-line">${formatDistance(distKm)} from your location</p>` : "";
  const photoHtml = room.photoUrl
    ? `<img src="${room.photoUrl}" alt="${room.roomTitle}" class="booking-summary-photo" />`
    : "";

  bookingRoomSummary.innerHTML = `
    <div class="booking-summary-card">
      ${photoHtml}
      <div class="gh-name">${room.guesthouseName}</div>
      <h3 class="room-title" style="margin-bottom:6px;">${room.roomTitle}</h3>
      <p class="meta-line">📍 ${room.area}, ${room.city} • ${room.landmark}</p>
      ${distText}
      <p class="sub-meta" style="margin-top:6px;">Amenities: ${(room.amenities || []).join(" • ")}</p>
      <p class="price" style="margin-top:10px;">${Number(room.nightlyPrice).toLocaleString()} TZS <span>/ night</span></p>
    </div>
  `;

  // If the current guest already has a pending/approved booking for this room, show its live status
  const existing = currentUser
    ? allBookings.find(
        (b) =>
          b.roomId === room.id &&
          b.guestId === currentUser.uid &&
          (b.status === "pending_host" || b.status === "approved")
      )
    : null;

  showSection("booking");

  if (existing) {
    activeBookingId = existing.id;
    syncGuestBookingStatusUI();
  }
};

// Guest: Request Booking -> Saves as "pending_host" until Host approves
confirmBookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser || !activeBookingRoom) return;

  const nights = Math.max(1, parseInt(bookingNightsInput.value, 10) || 1);
  const guestName = window.roomaUserProfile?.fullName || currentUser.displayName || currentUser.email || "Guest";
  const guestPhone = window.roomaUserProfile?.phone || "Not provided";
  const totalTzs = nights * Number(activeBookingRoom.nightlyPrice || 0);

  try {
    confirmBookingBtn.disabled = true;
    confirmBookingBtn.textContent = "Sending Request...";

    const newBookingRef = push(ref(db, "bookings"));
    await set(newBookingRef, {
      roomId: activeBookingRoom.id,
      guesthouseName: activeBookingRoom.guesthouseName,
      roomTitle: activeBookingRoom.roomTitle,
      hostId: activeBookingRoom.hostId,
      hostPhone: activeBookingRoom.hostPhone,
      guestId: currentUser.uid,
      guestName,
      guestPhone,
      nights,
      totalTzs,
      status: "pending_host",
      createdAt: Date.now()
    });

    activeBookingId = newBookingRef.key;
    confirmBookingForm.classList.add("hidden");
    bookingConfirmedBox.classList.add("hidden");
    bookingPendingBox.classList.remove("hidden");
    bookingPendingRefText.textContent = `Reference: #RM-${newBookingRef.key.slice(-4).toUpperCase()} • ${nights} night(s) • ${totalTzs.toLocaleString()} TZS`;
  } catch (err) {
    alert("Rooma: Booking request failed — " + err.message);
    confirmBookingBtn.disabled = false;
    confirmBookingBtn.textContent = "Request Booking";
  }
});

function renderAdminActionRow(room) {
  const safeTitle = encodeURIComponent(room.roomTitle || "Room");
  return `
    <div class="admin-btn-row">
      <button type="button" class="btn-small admin-approve-btn" onclick="approveRoom('${room.id}')">Approve</button>
      <div class="split-reject-btn" role="group" aria-label="Reject options">
        <button type="button" class="split-reject-left" onclick="rejectAndDeleteRoom('${room.id}', '${safeTitle}')">Reject &amp; Del</button>
        <button type="button" class="split-reject-right" onclick="rejectRoomOnly('${room.id}')">Reject</button>
      </div>
    </div>
  `;
}

function renderHostBookings() {
  if (!currentUser) {
    hostBookingsList.innerHTML = "";
    return;
  }

  const hostRoomIds = new Set(allRooms.filter((r) => r.hostId === currentUser.uid).map((r) => r.id));
  const incoming = allBookings.filter(
    (b) => b.hostId === currentUser.uid || hostRoomIds.has(b.roomId)
  );

  if (incoming.length === 0) {
    hostBookingsList.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:#64748b;">No guest bookings for your rooms yet.</div>`;
    return;
  }

  hostBookingsList.innerHTML = incoming
    .map((b) => {
      const status = b.status || "pending_host";
      const badgeClass = status === "approved" ? "avail" : status === "declined" ? "occ" : "pending";
      const badgeText =
        status === "approved" ? "Approved" : status === "declined" ? "Declined" : "Needs Approval";
      const smsMsg = encodeURIComponent(
        `Rooma Booking: ${b.guestName} (${b.guestPhone}) requested ${b.roomTitle} at ${b.guesthouseName} for ${b.nights} night(s) (${Number(b.totalTzs || 0).toLocaleString()} TZS).`
      );
      const cleanPhone = (b.guestPhone || "").replace(/\s+/g, "");

      return `
        <div class="room-card">
          <div>
            <div class="room-top">
              <div>
                <div class="gh-name">${b.guesthouseName}</div>
                <div class="room-title">${b.roomTitle}</div>
              </div>
              <span class="badge ${badgeClass}">${badgeText}</span>
            </div>
            <p class="meta-line" style="margin-top:6px;">Guest: <strong>${b.guestName}</strong> • ${b.guestPhone}</p>
            <p class="sub-meta" style="margin-top:4px;">${b.nights} night(s) • <strong>${Number(b.totalTzs || 0).toLocaleString()} TZS</strong></p>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div class="admin-btn-row">
              <button type="button" class="btn-small admin-approve-btn" onclick="setBookingStatus('${b.id}', 'approved')">Approve</button>
              <button type="button" class="btn-small" style="flex:1;background:#dc2626;" onclick="setBookingStatus('${b.id}', 'declined')">Decline</button>
            </div>
            <div class="confirmed-actions">
              <a href="sms:${cleanPhone}?body=${smsMsg}" class="action-btn sms-btn">✉️ SMS Guest</a>
              <a href="tel:${cleanPhone}" class="action-btn call-btn">📞 Call Guest</a>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

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

  // Only approved rooms appear on the public Guest Finder feed
  const approvedRooms = enriched.filter((r) => r.approvalStatus === "approved");

  const filtered = approvedRooms.filter((r) => {
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
    roomsList.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:#64748b;">No approved rooms match your filters right now.</div>`;
  } else {
    roomsList.innerHTML = filtered
      .map((r) => {
        const isAvail = r.availability === "available_now";
        const mapLink = `https://www.google.com/maps?q=${r.latitude},${r.longitude}`;
        const photoHtml = r.photoUrl
          ? `<img src="${r.photoUrl}" alt="${r.roomTitle}" class="room-photo" loading="lazy" />`
          : "";
        const distLine =
          r.distanceKm !== null
            ? `<p class="distance-line">${formatDistance(r.distanceKm)}</p>`
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
              <p class="meta-line" style="margin-top:8px;">📍 ${r.area}, ${r.city} • ${r.landmark}</p>
              <p class="sub-meta" style="margin-top:4px;">${(r.amenities || []).join(" • ")}</p>
              <p class="sub-meta" style="margin-top:6px;">
                <a href="${mapLink}" target="_blank" rel="noopener" style="color:#0284c7;font-weight:700;">Open map</a>
              </p>
              ${distLine}
            </div>
            <div class="room-bottom">
              <div class="price">${Number(r.nightlyPrice).toLocaleString()} TZS <span>/ night</span></div>
              <button type="button" class="btn-small" onclick="openBookingPage('${r.id}')">Book Room</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  // Host's own rooms (3/4 availability toggle + 1/4 red Delete button)
  const mine = allRooms.filter((r) => currentUser && r.hostId === currentUser.uid);
  if (mine.length === 0) {
    myRoomsList.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:#64748b;">You haven't uploaded any rooms yet.</div>`;
  } else {
    myRoomsList.innerHTML = mine
      .map((r) => {
        const status = r.approvalStatus || "pending";
        const badgeClass = status === "approved" ? "avail" : status === "rejected" ? "occ" : "pending";
        const badgeLabel =
          status === "approved" ? "Live (Approved)" : status === "rejected" ? "Rejected" : "Pending Admin";
        const isAvail = r.availability === "available_now";
        const photoHtml = r.photoUrl
          ? `<img src="${r.photoUrl}" alt="${r.roomTitle}" class="room-photo" loading="lazy" />`
          : "";
        const safeTitle = encodeURIComponent(r.roomTitle || "Room");

        return `
          <div class="room-card">
            <div>
              ${photoHtml}
              <div class="room-top">
                <div>
                  <div class="gh-name">${r.guesthouseName}</div>
                  <div class="room-title">${r.roomTitle}</div>
                </div>
                <span class="badge ${badgeClass}">${badgeLabel}</span>
              </div>
              <p class="meta-line" style="margin-top:6px;">${r.area}, ${r.city} • ${Number(r.nightlyPrice).toLocaleString()} TZS/night</p>
              <p class="sub-meta" style="margin-top:4px;">Occupancy: ${isAvail ? "Available Now" : "Occupied"}</p>
            </div>
            <div class="host-card-actions">
              <button
                type="button"
                class="btn-small host-toggle-btn"
                style="background:${isAvail ? "#ef4444" : "#16a34a"};"
                onclick="toggleRoomStatus('${r.id}', '${r.availability}')"
              >
                ${isAvail ? "Mark as Occupied" : "Mark as Available Now"}
              </button>
              <button
                type="button"
                class="btn-small host-delete-btn"
                onclick="deleteHostRoom('${r.id}', '${safeTitle}')"
              >
                Delete
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  renderHostBookings();

  if (isAdmin) {
    renderAdminPanel();
  }
}

function renderAdminPanel() {
  const pending = allRooms.filter((r) => (r.approvalStatus || "pending") === "pending");
  const reviewed = allRooms.filter((r) => r.approvalStatus === "approved" || r.approvalStatus === "rejected");

  adminStatsBar.innerHTML = `
    <span class="stat-pill">⏳ Pending: ${pending.length}</span>
    <span class="stat-pill">✅ Approved: ${allRooms.filter((r) => r.approvalStatus === "approved").length}</span>
    <span class="stat-pill">⛔ Rejected: ${allRooms.filter((r) => r.approvalStatus === "rejected").length}</span>
    <span class="stat-pill">📖 Bookings: ${allBookings.length}</span>
  `;

  if (pending.length === 0) {
    pendingRoomsList.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:#64748b;">No rooms waiting for approval.</div>`;
  } else {
    pendingRoomsList.innerHTML = pending
      .map((r) => {
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
                <span class="badge pending">Pending</span>
              </div>
              <p class="meta-line" style="margin-top:6px;">📍 ${r.area}, ${r.city} • ${Number(r.nightlyPrice).toLocaleString()} TZS/night</p>
              <p class="sub-meta" style="margin-top:4px;">Host: ${r.hostName} (${r.hostPhone})</p>
            </div>
            ${renderAdminActionRow(r)}
          </div>
        `;
      })
      .join("");
  }

  if (reviewed.length === 0) {
    allAdminRoomsList.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:#64748b;">No approved or rejected rooms yet.</div>`;
  } else {
    allAdminRoomsList.innerHTML = reviewed
      .map((r) => {
        const isApp = r.approvalStatus === "approved";
        return `
          <div class="room-card">
            <div>
              <div class="room-top">
                <div>
                  <div class="gh-name">${r.guesthouseName}</div>
                  <div class="room-title">${r.roomTitle}</div>
                </div>
                <span class="badge ${isApp ? "avail" : "occ"}">${isApp ? "Approved" : "Rejected"}</span>
              </div>
              <p class="meta-line" style="margin-top:6px;">${r.area}, ${r.city} • ${Number(r.nightlyPrice).toLocaleString()} TZS/night</p>
              <p class="sub-meta" style="margin-top:4px;">Host: ${r.hostName}</p>
            </div>
            ${renderAdminActionRow(r)}
          </div>
        `;
      })
      .join("");
  }

  if (allBookings.length === 0) {
    adminBookingsList.innerHTML = `<div class="panel" style="grid-column:1/-1;text-align:center;color:#64748b;">No guest bookings recorded yet.</div>`;
  } else {
    adminBookingsList.innerHTML = allBookings
      .map((b) => {
        const status = b.status || "pending_host";
        const badgeClass = status === "approved" ? "avail" : status === "declined" ? "occ" : "pending";
        const badgeText =
          status === "approved" ? "Approved" : status === "declined" ? "Declined" : "Pending Host";

        return `
          <div class="room-card">
            <div>
              <div class="room-top">
                <div>
                  <div class="gh-name">${b.guesthouseName}</div>
                  <div class="room-title">${b.roomTitle}</div>
                </div>
                <span class="badge ${badgeClass}">${badgeText}</span>
              </div>
              <p class="meta-line" style="margin-top:6px;">Guest: ${b.guestName} (${b.guestPhone})</p>
              <p class="sub-meta" style="margin-top:4px;">Host Phone: ${b.hostPhone} • ${b.nights} night(s) • <strong>${Number(b.totalTzs || 0).toLocaleString()} TZS</strong></p>
            </div>
          </div>
        `;
      })
      .join("");
  }
}

// Subscribe to Realtime Database rooms & bookings when signed in
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  isAdmin = isCurrentUserAdmin(user);
  adminModeTab.classList.toggle("hidden", !isAdmin);

  if (user) {
    requestGuestLocation(true);

    roomsRef = ref(db, "rooms");
    onValue(roomsRef, (snapshot) => {
      const val = snapshot.val();
      allRooms = val
        ? Object.entries(val).map(([id, data]) => ({ id, ...data }))
        : [];
      allRooms.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderRooms();
    });

    bookingsRef = ref(db, "bookings");
    onValue(bookingsRef, (snapshot) => {
      const val = snapshot.val();
      const rawBookings = val
        ? Object.entries(val).map(([id, data]) => ({ id, ...data }))
        : [];
      rawBookings.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      allBookings = isAdmin
        ? rawBookings
        : rawBookings.filter(
            (b) => b.guestId === user.uid || b.hostId === user.uid
          );

      renderHostBookings();
      if (isAdmin) renderAdminPanel();
      syncGuestBookingStatusUI();
    });
  } else {
    if (roomsRef) off(roomsRef);
    if (bookingsRef) off(bookingsRef);
    allRooms = [];
    allBookings = [];
    activeBookingRoom = null;
    activeBookingId = null;
  }
});
