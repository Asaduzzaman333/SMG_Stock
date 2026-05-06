import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  waitForPendingWrites,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD5NNJHN4ymhcrTCKGfJKvHmCeaU-MXgPM",
  authDomain: "smg-inventory-6819e.firebaseapp.com",
  projectId: "smg-inventory-6819e",
  storageBucket: "smg-inventory-6819e.firebasestorage.app",
  messagingSenderId: "621376514719",
  appId: "1:621376514719:web:711991dc924ac37a1890aa",
  measurementId: "G-JSYW9DEBFE",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const entriesCollection = collection(db, "purchaseEntries");
const entriesQuery = query(entriesCollection, orderBy("createdAt", "desc"));
const issueEntriesCollection = collection(db, "issueEntries");
const issueEntriesQuery = query(issueEntriesCollection, orderBy("createdAt", "desc"));

let analytics = null;

try {
  analytics = getAnalytics(app);
} catch (error) {
  console.warn("Firebase Analytics initialization skipped:", error);
}

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn("Firebase auth persistence setup failed:", error);
});

export { app, auth, db, analytics };

export function observeAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export async function requireAuth(redirectTo = "login.html") {
  const user = await getCurrentUser();

  if (!user) {
    window.location.replace(redirectTo);
    throw new Error("Auth required");
  }

  return user;
}

export async function redirectIfAuthenticated(target = "index.html") {
  const user = await getCurrentUser();

  if (user) {
    window.location.replace(target);
  }

  return user;
}

export async function loginWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutCurrentUser() {
  await signOut(auth);
}

export async function getPurchaseEntries() {
  try {
    const snapshot = await getDocs(entriesQuery);
    return snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }));
  } catch (error) {
    console.warn("Ordered Firestore fetch failed, falling back to unordered fetch:", error);
    const snapshot = await getDocs(entriesCollection);
    return snapshot.docs
      .map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }
}

export function subscribeToPurchaseEntries(onData, onError) {
  return onSnapshot(
    entriesQuery,
    (snapshot) => {
      const rows = snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }));
      onData(rows);
    },
    (error) => {
      console.error("Firestore subscription error:", error);
      onError?.(error);
    },
  );
}

export async function addPurchaseEntry(entry) {
  const docRef = await addDoc(entriesCollection, {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await waitForPendingWrites(db);
  return docRef.id;
}

export async function updatePurchaseEntry(id, entry) {
  await updateDoc(doc(db, "purchaseEntries", id), {
    ...entry,
    updatedAt: serverTimestamp(),
  });
  await waitForPendingWrites(db);
}

export async function deletePurchaseEntry(id) {
  await deleteDoc(doc(db, "purchaseEntries", id));
  await waitForPendingWrites(db);
}

export async function getIssueEntries() {
  try {
    const snapshot = await getDocs(issueEntriesQuery);
    return snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }));
  } catch (error) {
    console.warn("Ordered issue fetch failed, falling back to unordered fetch:", error);
    const snapshot = await getDocs(issueEntriesCollection);
    return snapshot.docs
      .map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }
}

export function subscribeToIssueEntries(onData, onError) {
  return onSnapshot(
    issueEntriesQuery,
    (snapshot) => {
      const rows = snapshot.docs.map((entryDoc) => ({ id: entryDoc.id, ...entryDoc.data() }));
      onData(rows);
    },
    (error) => {
      console.error("Firestore issue subscription error:", error);
      onError?.(error);
    },
  );
}

export async function addIssueEntry(entry) {
  const docRef = await addDoc(issueEntriesCollection, {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await waitForPendingWrites(db);
  return docRef.id;
}

export async function updateIssueEntry(id, entry) {
  await updateDoc(doc(db, "issueEntries", id), {
    ...entry,
    updatedAt: serverTimestamp(),
  });
  await waitForPendingWrites(db);
}

export async function deleteIssueEntry(id) {
  await deleteDoc(doc(db, "issueEntries", id));
  await waitForPendingWrites(db);
}
