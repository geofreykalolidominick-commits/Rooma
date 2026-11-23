import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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
const goToRegisterLink = document.getElementById("goToRegisterLink");
const goToLoginLink = document.getElementById("goToLoginLink");
const authStatus = document.getElementById("authStatus");

const welcomeUserText = document.getElementById("welcomeUserText");
const guestModeTab = document.getElementById("guestModeTab");
const hostModeTab = document.getElementById("hostModeTab");
const guestSection = document.getElementById("guestSection");
const hostSection = document.getElementById("hostSection");
const logoutBtn = document.getElementById("logoutBtn");

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
    "auth/network-request-failed": "Rooma: Network error. Please check your internet connection."
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

function switchToLogin() {
  tabLoginBtn.classList.add("active");
  tabRegisterBtn.classList.remove("active");
  loginForm.classList.remove("hidden");
  registerForm.classList.add("hidden");
  clearAuthMessage();
}

function switchToRegister() {
  tabRegisterBtn.classList.add("active");
  tabLoginBtn.classList.remove("active");
  registerForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  clearAuthMessage();
}

tabLoginBtn.addEventListener("click", switchToLogin);
tabRegisterBtn.addEventListener("click", switchToRegister);
goToRegisterLink.addEventListener("click", switchToRegister);
goToLoginLink.addEventListener("click", switchToLogin);

// Register User
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearAuthMessage();

  const fullName = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  const role = document.getElementById("regRole").value;
  const btn = document.getElementById("registerSubmitBtn");

  try {
    btn.disabled = true;
    btn.textContent = "Creating account...";
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: fullName });
    await set(ref(db, `users/${cred.user.uid}`), {
      fullName,
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

// Listen for Auth State Changes
onAuthStateChanged(auth, async (user) => {
  if (user) {
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    welcomeUserText.textContent = `Welcome, ${user.displayName || user.email}`;

    try {
      const snap = await get(ref(db, `users/${user.uid}`));
      if (snap.exists() && snap.val().role === "host") {
        hostModeTab.click();
      } else {
        guestModeTab.click();
      }
    } catch (_) {
      guestModeTab.click();
    }
  } else {
    appView.classList.add("hidden");
    authView.classList.remove("hidden");
  }
});
