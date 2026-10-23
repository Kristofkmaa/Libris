// Connexion Google et données Firestore : users/{uid}/books/{id} et users/{uid}/meta/{settings|reco}
import { initializeApp } from 'firebase/app'
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut as fbSignOut, browserLocalPersistence, setPersistence,
} from 'firebase/auth'
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, onSnapshot, setDoc, deleteDoc,
} from 'firebase/firestore'
import { firebaseConfig, isConfigured } from './firebase-config.js'

export { isConfigured }

let auth = null, db = null
if (isConfigured) {
  const app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  // La session reste ouverte sur le téléphone : on ne se connecte qu'une fois
  setPersistence(auth, browserLocalPersistence).catch(() => {})
  getRedirectResult(auth).catch(() => {})
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
}

export function watchUser(cb) {
  if (!auth) { cb(null); return () => {} }
  return onAuthStateChanged(auth, cb)
}

export async function signIn() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    // Fenêtre bloquée : on bascule sur la redirection
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
      return
    }
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return
    throw e
  }
}

export const signOut = () => fbSignOut(auth)
export const idToken = () => auth.currentUser?.getIdToken()

const books = (uid) => collection(db, 'users', uid, 'books')
const meta = (uid, key) => doc(db, 'users', uid, 'meta', key)

export function watchBooks(uid, cb, onError) {
  return onSnapshot(books(uid), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), onError)
}
export function watchMeta(uid, key, cb) {
  return onSnapshot(meta(uid, key), s => cb(s.exists() ? s.data() : null), () => {})
}
export const newBookId = (uid) => doc(books(uid)).id
export function saveBook(uid, b) {
  const { id, ...data } = b
  return setDoc(doc(books(uid), id), data)
}
export const deleteBook = (uid, id) => deleteDoc(doc(books(uid), id))
export const saveMeta = (uid, key, data) => setDoc(meta(uid, key), data)
