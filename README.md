# RedacImg

Outil interne de traitement d'images produit. Glissez un dossier, collez votre liste de références, lancez — les images sont renommées, redimensionnées et exportées sans Photoshop.

![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)

---

## Ce que ça fait

1. **Scan** — glissez un ou plusieurs dossiers (récursif). JPEG, PNG, TIFF et AVIF.
2. **Correspondance** — collez votre liste `code interne + EAN` (copier-coller depuis Excel). Chaque image est associée à la bonne référence par son nom de fichier.
3. **Traitement** — redimensionnement, recadrage, fond configurable, export en TIFF / JPEG / PNG / WebP.
4. **Rapport** — CSV en trois sections : introuvables, ambiguës, inutilisées.

Les fichiers de sortie sont nommés par EAN (`7040353498027.tif`, `7040353498027_1.tif`…).

---

## Démarrage rapide

**Windows** : double-cliquez sur `demarrer.cmd`. Il installe les dépendances au premier lancement puis ouvre l'app dans le navigateur.

**En ligne de commande :**

```bash
npm install
npm run start      # build + prévisualisation
```

```bash
npm run dev        # serveur de développement (hot-reload)
```

---

## Installation PWA

Chrome et Edge proposent une icône d'installation dans la barre d'adresse. Une fois installée, l'app s'ouvre dans sa propre fenêtre, sans navigateur.

---

## Réglages

| Option | Défaut | Description |
|--------|--------|-------------|
| Largeur / Hauteur | 500 × 500 px | Dimensions cibles |
| Mode | `contain` | `contain` · `cover` · `pad` |
| Fond | `#ffffff` | Couleur de marge / aplatissement PNG |
| Agrandissement | non | Étirer les images plus petites que la cible |
| Format | TIFF | TIFF · JPEG · PNG · WebP |
| Compression Deflate | oui | TIFF sans perte, plus léger |
| Une seule image / ref | non | Garde le premier fichier si plusieurs correspondent |

Les réglages sont sauvegardés automatiquement dans le navigateur.

---

## Logique de correspondance

- Les tokens du nom de fichier (séparateurs = frontières) sont comparés aux identifiants de la liste (séparateurs supprimés).  
  → `PRF0A8.jpg` → token `prf0a8` ✓  
  → `PRF0ZS-7040353497068.jpg` → tokens `prf0zs` + `7040353497068` ✓  
  → `70403534970371.jpg` ≠ EAN `7040353497037` (chiffre en trop) ✓
- Un EAN est détecté par sa forme (8–14 chiffres), pas par sa position dans la ligne.
- Un fichier correspondant à 2+ références → écarté, signalé comme ambigu.
- Deux références partageant le même EAN → exclues pour éviter tout écrasement silencieux.

---

## Architecture

```
src/
├── lib/
│   ├── matching.js      # moteur de correspondance (pur JS, zéro dépendances)
│   ├── tiff.ts          # encodeur TIFF maison (IFD + Deflate via CompressionStream)
│   ├── pool.ts          # pool de Web Workers (hardwareConcurrency, max 8)
│   ├── scan.ts          # scan drag-and-drop (FileSystemEntry) + fallback input
│   ├── output.ts        # écriture disque (File System Access API) + ZIP (fflate)
│   └── settings.ts      # persistance localStorage
├── workers/
│   └── process.worker.ts  # géométrie, downscale multi-passes, OffscreenCanvas
└── components/
    ├── Dropzone.tsx
    ├── SettingsPanel.tsx
    └── ReportPanel.tsx
```

**Stack :** Vite 6 · React 19 · TypeScript · Tailwind v4 · shadcn/ui (new-york)

**Pas de backend.** Tout tourne dans le navigateur. Les images ne quittent jamais la machine.

---

## Sorties

- **File System Access API** (Chrome / Edge) : écriture directe dans un dossier choisi par l'utilisateur.
- **Fallback ZIP** : un fichier `.zip` est téléchargé si l'API n'est pas disponible.

---

## Développement

```bash
npm run dev         # Vite dev server → http://localhost:5173
npm test            # 25 tests Node (matching + encodeur TIFF)
npm run fixtures    # génère les fichiers de test dans fixtures/
npm run icons       # régénère les icônes PWA (192 + 512 px)
```
