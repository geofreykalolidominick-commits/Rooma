import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  ref,
  set,
  get,
  update
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { auth, db } from "./firebase-config.js";

const authView = document.getElementById("authView");
const appView = document.getElementById("appView");

const tabGuestQuickBtn = document.getElementById("tabGuestQuickBtn");
const tabLoginBtn = document.getElementById("tabLoginBtn");
const tabRegisterBtn = document.getElementById("tabRegisterBtn");

const guestQuickForm = document.getElementById("guestQuickForm");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const goToLoginLink = document.getElementById("goToLoginLink");
const goToRegisterLink = document.getElementById("goToRegisterLink");
const goToLoginFromRegLink = document.getElementById("goToLoginFromRegLink");
const authStatus = document.getElementById("authStatus");

const welcomeUserText = document.getElementById("welcomeUserText");
const guestModeTab = document.getElementById("guestModeTab");
const hostModeTab = document.getElementById("hostModeTab");
const guestSection = document.getElementById("guestSection");
const hostSection = document.getElementById("hostSection");
const logoutBtn = document.getElementById("logoutBtn");

function normalizePhone(rawPhone) {
  const digits = (rawPhone || "").replace(/[^\d+]/g, "").trim();
  if (/^\+255[67]\d{8}$/.test(digits)) return digits;
  if (/^255[67]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^0[67]\d{8}$/.test(digits)) return `+255${digits.slice(1)}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return null;
}

function formatRoomaError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-credential": "Rooma: Incorrect email or password. Please check and try again.",
    "auth/user-not-found": "Rooma: No account found with this email. Tap Register to create one.",
    "auth/wrong-password": "Rooma: Incorrect password. Please try again.",
    "auth/email-already-in-use": "Rooma: This email is already registered. Please log in instead.",
    "auth/weak-password": "Rooma: Password must be at least 6 characters long.",
    "auth/invalid-email": "Rooma: Please enter a valid email address.",
    "auth/too-many-requests": "Rooma: Too many failed attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Rooma: Network error. Please check your internet connection.",
    "auth/operation-not-allowed": "Rooma: Quick guest sign-in is disabled in Firebase Auth settings."
  };

  if (map[code]) return map[code];

  const cleanMsg = (err?.message || "Something went wrong.")
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\(auth\/[^)]+\)\.?$/i, "");
  return `Rooma: ${cleanMsg}`;
}

function showAuthMessage(errOrMsg) {
  authStatus.textContent =
    typeof errOrMsg === "string" ? errOrMsg : formatRoomaError(errOrMsg);
  authStatus.classList.remove("hidden");
}

function clearAuthMessage() {
  authStatus.classList.add("hidden");
}

function switchTab(mode) {
  tabGuestQuickBtn.classList.toggle("active", mode === "quick");
  tabLoginBtn.classList.toggle("active", mode === "login");
  tabRegisterBtn.classList.toggle("active", mode === "register");

  guestQuickForm.classList.toggle("hidden", mode !== "quick");
  loginForm.classList.toggle("hidden", mode !== "login");
  registerForm.classList.toggle("hidden", mode !== "register");
  clearAuthMessage();
}

tabGuestQuickBtn.addEventListener("click", () => switchTab("quick"));
tabLoginBtn.addEventListener("click", () => switchTab("login"));
tabRegisterBtn.addEventListener("click", () => switchTab("register"));
goToLoginLink.addEventListener("click", () => switchTab("login"));
goToRegisterLink.addEventListener("click", () => switchTab("register"));
goToLoginFromRegLink.addEventListener("click", () => switchTab("login"));

// One-Time Guest Quick Start (Name + Valid Phone -> Straight to Find Rooms)
guestQuickForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthMessage();

  const fullName = document.getElementById("quickGuestName").value.trim();
  const cleanPhone = normalizePhone(document.getElementById("quickGuestPhone").value);
  const btn = document.getElementById("quickGuestSubmitBtn");

  if (!fullName) {
    showAuthMessage("Rooma: Please enter your full name.");
    return;
  }
  if (!cleanPhone) {
    showAuthMessage("Rooma: Please enter a valid phone number (e.g., +255712345678 or 0712345678).");
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "Opening Rooma...";

    const cred = await signInAnonymously(auth);
    await updateProfile(cred.user, { displayName: fullName });
    await set(ref(db, `users/${cred.user.uid}`), {
      fullName,
      phone: cleanPhone,
      role: "guest",
      isQuickGuest: true,
      createdAt: Date.now()
    });
  } catch (err) {
    showAuthMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Find Rooms Now";
  }
});

// Register User (Email/Password + Valid Phone)
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthMessage();

  const fullName = document.getElementById("regName").value.trim();
  const cleanPhone = normalizePhone(document.getElementById("regPhone").value);
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const role = document.getElementById("regRole").value;
  const btn = document.getElementById("registerSubmitBtn");

  if (!cleanPhone) {
    showAuthMessage("Rooma: Please enter a valid phone number (e.g., +255712345678 or 0712345678).");
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = "Creating account...";
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    await set(ref(db, `users/${cred.user.uid}`), {
      fullName,
      phone: cleanPhone,
      email,
      role,
      createdAt: Date.now()
    });
  } catch (err) {
    showAuthMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Register";
  }
});

// Login User
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthMessage();

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const btn = document.getElementById("loginSubmitBtn");

  try {
    btn.disabled = true;
    btn.textContent = "Logging in...";
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showAuthMessage(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Login";
  }
});

// Logout
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// Dashboard Tab Switching (Guest vs Host)
guestModeTab.addEventListener("click", () => {
  guestModeTab.classList.add("active");
  hostModeTab.classList.remove("active");
  guestSection.classList.remove("hidden");
  hostSection.classList.add("hidden");
});

hostModeTab.addEventListener("click", () => {
  hostModeTab.classList.add("active");
  guestModeTab.classList.remove("active");
  hostSection.classList.remove("hidden");
  guestSection.classList.add("hidden");
});

// Listen for Auth State Changes (Always open directly to Find Rooms)
onAuthStateChanged(auth, async (user) => {
  if (user) {
    authView.classList.add("hidden");
    appView.classList.remove("hidden");

    let profile = null;
    try {
      const snap = await get(ref(db, `users/${user.uid}`));
      if (snap.exists()) {
        profile = snap.val();
      } else if (user.isAnonymous) {
        profile = {
          fullName: user.displayName || "Guest",
          phone: "",
          role: "guest",
          isQuickGuest: true
        };
        await update(ref(db, `users/${user.uid}`), profile);
      }
    } catch (_) {
      // Fallback if profile read is temporarily unavailable
    }

    window.roomaUserProfile = profile || {
      fullName: user.displayName || user.email || "Guest",
      phone: "",
      role: "guest"
    };

    welcomeUserText.textContent = `Welcome, ${window.roomaUserProfile.fullName || user.displayName || user.email}`;
    guestModeTab.click();
  } else {
    window.roomaUserProfile = null;
    appView.classList.add("hidden");
    authView.classList.remove("hidden");
  }
});
