# Libris

Bibliothèque personnelle sur téléphone : étagère en bois, livres qui s'ouvrent et se feuillettent, statuts de lecture, notes, envies, tri et conseils de lecture.

- **Front** : Vite, JavaScript sans framework (`src/`)
- **Données et connexion** : Firebase (Google + Firestore), une bibliothèque par compte
- **Recherche de livres** : Google Books, sans clé
- **Conseils de lecture** : fonction Vercel `api/conseils.js` qui appelle l'API Claude

## Mise en route

1. Coller la configuration web Firebase dans `src/firebase-config.js`.
2. Dans Firebase : activer Google dans Authentication, créer Firestore et publier les règles de `firestore.rules`.
3. Ajouter le domaine Vercel dans Authentication > Paramètres > Domaines autorisés.
4. Sur Vercel, importer le dépôt (preset Vite) et ajouter la variable `ANTHROPIC_API_KEY`.
   Facultatif : `ALLOWED_EMAILS` (adresses autorisées à demander des conseils, séparées par des virgules).

## Développement

```
npm install
npm run dev
```
