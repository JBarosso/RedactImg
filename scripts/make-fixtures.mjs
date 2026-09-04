// Jeu de test : noms volontairement tordus. Sert aux tests unitaires (noms) et
// au drag & drop manuel dans l'app (vrais fichiers JPEG/PNG 1x1).
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Liste collée par la collègue : 6 lignes valides + les cas tordus. */
export const REFS_TEXT = [
  'PRETJ5\t7040353498027',
  'PRETR3\t7040353500027',
  'PREVV0\t7040353499079',
  'PREVV2\t7040355044017',
  'PRF0A8\t7040353497037',
  'PRF0ZS\t7040353497068',
  'PRZZZ9   7040355044000',   // aucun fichier -> introuvable
  '',                          // ligne vide -> ignorée
  'PRETJ5\t7040353498027',     // doublon exact de la ligne 1
  '   ',                       // blancs -> ignorée
  'PRSOLO1',                   // un seul identifiant sur la ligne
  'PRQ-M4  7040353499001  lot42', // tirets dans le code + champ en trop
].join('\n');

/** Chemins relatifs des fichiers du jeu de test, avec ce que chacun couvre. */
export const FILES = [
  ['PRETJ5_1.jpg',                    'ref -> plusieurs fichiers (1/2)'],
  ['PRETJ5_2.jpg',                    'ref -> plusieurs fichiers (2/2)'],
  ['Photos HD/PRETJ5_1.jpg',          'sous-dossier + doublon de nom de fichier'],
  ['7040353500027.png',               'match par EAN, pas par code'],
  ['prévv0 photo.jpg',                'accents + espace + casse'],
  ['PREVV2.JPG.jpg',                  'double extension + casse melangee'],
  ['Photos HD/lot 2/prf0a8.jpeg',     'recursif + extension .jpeg'],
  ['PRF0ZS-7040353497037.jpg',        'AMBIGU : matche PRF0ZS et l EAN de PRF0A8'],
  ['70403534970371.jpg',              'piege : EAN + 1 chiffre, ne doit PAS matcher'],
  ['PRETJ55.jpg',                     'piege : ressemble a PRETJ5 sans en etre'],
  ['PRSOLO1.png',                     'ligne a un seul identifiant'],
  ['Photos HD/PRQM4.jpg',             'ref saisie PRQ-M4 -> fichier PRQM4'],
  ['IMG_0042.jpg',                    'photo hors perimetre -> inutilisee'],
  ['Photos HD/notes du studio.txt',   'non-image -> ignore'],
];

// 1x1 noir, suffisants pour tester le decodage/pipeline plus tard.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');

if (process.argv[1]?.endsWith('make-fixtures.mjs')) {
  await rm(ROOT, { recursive: true, force: true });
  for (const [rel] of FILES) {
    const abs = join(ROOT, rel);
    await mkdir(dirname(abs), { recursive: true });
    const ext = rel.toLowerCase().split('.').pop();
    await writeFile(abs, ext === 'png' ? PNG : ext === 'txt' ? Buffer.from('notes\n') : JPG);
  }
  await writeFile(join(ROOT, 'references.txt'), REFS_TEXT);
  console.log(`${FILES.length} fichiers + references.txt -> ${ROOT}`);
}
