/**

 * FIREBASE CONFIGURATION (TEMPLATE)
 * 
 * This module initializes the Firebase application and Realtime Database.
 * 
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  get,
  onValue
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// Firebase project configuration placeholders
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_AUTH_DOMAIN_HERE",
  databaseURL: "YOUR_DATABASE_URL_HERE",
  projectId: "YOUR_PROJECT_ID_HERE",
  storageBucket: "YOUR_STORAGE_BUCKET_HERE",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID_HERE",
  appId: "YOUR_APP_ID_HERE"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and export methods for other modules
export const db = getDatabase(app);
export { ref, set, get, onValue };