// Configuration du projet Firebase (console Firebase > Paramètres du projet > Vos applications).
// Ces valeurs sont publiques par nature : la sécurité vient des règles Firestore (firestore.rules).
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
}

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)
