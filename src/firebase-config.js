// Configuration du projet Firebase (console Firebase > Paramètres du projet > Vos applications).
// Ces valeurs sont publiques par nature : la sécurité vient des règles Firestore (firestore.rules).
export const firebaseConfig = {
  apiKey: 'AIzaSyDt5uoi4RusC5lC5cz4ZY9106wTe1o7qU8',
  authDomain: 'libris-1e54e.firebaseapp.com',
  projectId: 'libris-1e54e',
  storageBucket: 'libris-1e54e.firebasestorage.app',
  messagingSenderId: '207871490440',
  appId: '1:207871490440:web:6127fa07c245c0b6ea223d',
}

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
