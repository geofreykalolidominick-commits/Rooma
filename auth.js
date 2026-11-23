import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  ref,
  set,
  get
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { auth, db } from "./firebase-config.js";

const authView = document.getElementById("authView");
const appView = document.getElementById("appView");

const tabLoginBtn = document.getElementById("tabLoginBtn");
const tabRegisterBtn = document.getElementById("tabRegisterBtn");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const goToLoginLink = document.getElementById("goToLoginLink");
const goToRegisterLink = document.getElementById("goToRegisterLink");
const forgotPasswordLink = document.getElementById("forgotPasswordLink");
const forgotEmailLink = document.getElementById("forgotEmailLink");
const authStatus = document.getElementById("authStatus");

const welcomeUserText = document.getElementById("welcomeUserText");
const guestModeTab = document.getElementById("guestModeTab");
const logoutBtn = document.getElementById("logoutBtn");

let pendingRegisteredProfile = null;

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
    "auth/missing-email": "Rooma: Please type your email address in the Email box first.",
    "auth/too-many-requests": "Rooma: Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Rooma: Network error. Please check your internet connection."
  };

  if (map[code]) return map[code];

  const cleanMsg = (err?.message || "Something went wrong.")
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\(auth\/[^)]+\)\.?$/i, "");
  return `Rooma: ${cleanMsg}`;
}

function showAuthMessage(errOrMsg, isInfo = false) {
  authStatus.textContent =
    typeof errOrMsg === "string" ? errOrMsg : formatRoomaError(errOrMsg);
  authStatus.classList.toggle("info", isInfo);
  authStatus.classList.remove("hidden");
}

function clearAuthMessage() {
  authStatus.classList.add("hidden");
  authStatus.classList.remove("info");
}

function switchTab(mode) {
  tabLoginBtn.classList.toggle("active", mode === "login");
  tabRegisterBtn.classList.toggle("active", mode === "register");

  loginForm.classList.toggle("hidden", mode !== "login");
  registerForm.classList.toggle("hidden", mode !== "register");
  clearAuthMessage();
}

tabLoginBtn.addEventListener("click", () => switchTab("login"));
tabRegisterBtn.addEventListener("click", () => switchTab("register"));
goToLoginLink.addEventListener("click", () => switchTab("login"));
goToRegisterLink.addEventListener("click", () => switchTab("register"));

// Forgot Password Recovery
forgotPasswordLink.addEventListener("click", async () => {
  clearAuthMessage();
  const email = document.getElementById("loginEmail").value.trim();

  if (!email) {
    showAuthMessage("Rooma: Enter your account Email above first, then tap Forgot Password?", true);
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showAuthMessage(`Rooma: Password reset link sent to ${email}. Check your inbox or spam folder.`, true);
  } catch (err) {
    showAuthMessage(err);
  }
});

// Forgot Email Guidance
forgotEmailLink.addEventListener("click", () => {
  showAuthMessage(
    "Rooma: Try any email address you normally use, or contact Rooma support/admin with your registered phone number to verify your account.",
    true
  );
});

// Register User (Email/Password + Valid Phone + Selected Role)
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthMessage();

  const fullName = document.getElementById("regName").value.trim();
  const cleanPhone = normalizePhone(document.getElementById("regPhone").value);
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const selectedRole = document.getElementById("regRole").value === "host" ? "host" : "guest";
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

    const newProfile = {
      fullName,
      phone: cleanPhone,
      email,
      role: selectedRole,
      createdAt: Date.now()
    };

    pendingRegisteredProfile = newProfile;
    await set(ref(db, `users/${cred.user.uid}`), newProfile);
    await window.refreshRoomaProfile(newProfile);
  } catch (err) {
    pendingRegisteredProfile = null;
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
  pendingRegisteredProfile = null;
  await signOut(auth);
});

// Refresh Profile Helper for Account Editor
window.refreshRoomaProfile = async (overrideProfile = null) => {
  const user = auth.currentUser;
  if (!user) return null;

  let profile = overrideProfile || pendingRegisteredProfile;
  if (!profile) {
    try {
      const snap = await get(ref(db, `users/${user.uid}`));
      if (snap.exists()) profile = snap.val();
    } catch (_) {
      // Fallback to existing profile or auth details
    }
  }

  const existingRole = window.roomaUserProfile?.role;
  const resolvedRole = profile?.role === "host" || existingRole === "host" ? "host" : profile?.role || existingRole || "guest";

  window.roomaUserProfile = {
    fullName: profile?.fullName || window.roomaUserProfile?.fullName || user.displayName || user.email || "Member",
    phone: profile?.phone || window.roomaUserProfile?.phone || "",
    email: profile?.email || window.roomaUserProfile?.email || user.email || "",
    role: resolvedRole,
    createdAt: profile?.createdAt || window.roomaUserProfile?.createdAt || Date.now(),
    updatedAt: profile?.updatedAt || window.roomaUserProfile?.updatedAt || null
  };

  pendingRegisteredProfile = null;
  welcomeUserText.textContent = `Welcome, ${window.roomaUserProfile.fullName || user.displayName || user.email}`;
  if (typeof window.onRoomaProfileUpdated === "function") {
    window.onRoomaProfileUpdated(window.roomaUserProfile);
  }
  return window.roomaUserProfile;
};

// Listen for Auth State Changes (Always open directly to Find Rooms)
onAuthStateChanged(auth, async (user) => {
  if (user) {
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    await window.refreshRoomaProfile(pendingRegisteredProfile);
    guestModeTab.click();
  } else {
    pendingRegisteredProfile = null;
    window.roomaUserProfile = null;
    appView.classList.add("hidden");
    authView.classList.remove("hidden");
  }
});
