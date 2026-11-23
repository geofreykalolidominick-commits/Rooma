import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA5GrPyPrxfEruGGlEOx02jF5fOAJIidWY",
  authDomain: "rooma-tz.firebaseapp.com",
  databaseURL: "https://rooma-tz-default-rtdb.firebaseio.com",
  projectId: "rooma-tz",
  storageBucket: "rooma-tz.firebasestorage.app",
  messagingSenderId: "868313040311",
  appId: "1:868313040311:web:383a9a5e4973b730ded432",
  measurementId: "G-HF34SR1734"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
