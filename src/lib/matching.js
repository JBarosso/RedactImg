// Matching références <-> fichiers.
// Aucune dépendance, aucune API navigateur : testable sous `node --test`,
// importable tel quel dans l'app.

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png']);
const SEP = /[^\p{L}\p{N}]+/gu;
const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

/** Casse + accents. */
export function normalize(s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Forme comparable d'un identifiant : séparateurs supprimés, pour qu'une
 * référence saisie `PRE-TJ5` matche un fichier `PRETJ5.jpg`.
 */
export function normalizeId(id) {
  return normalize(id).replace(SEP, '');
}

/**
 * Découpe un nom de fichier en tokens. Les séparateurs sont des *frontières*,
 * jamais du bruit à supprimer : c'est ce qui empêche `7040353497037` de
 * matcher `70403534970371`.
 *
 * ponytail: pas de matching partiel intra-token. Un fichier dont la référence
 * est collée à autre chose sans séparateur (`PRETJ5xx.jpg`) ne matchera pas.
 * Si ce cas apparaît en vrai, ajouter un préfixe/suffixe explicite ici plutôt
 * qu'un `includes`, qui ramènerait les faux positifs.
 */
export function tokenize(name) {
  return normalize(name).split(SEP).filter(Boolean);
}

/** Sépare un chemin en dossier / nom sans extension / extension. */
export function splitPath(path) {
  const p = path.replace(/\\/g, '/');
  const slash = p.lastIndexOf('/');
  const dir = slash < 0 ? '' : p.slice(0, slash);
  const file = p.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  return dot <= 0
    ? { dir, base: file, ext: '' }
    : { dir, base: file.slice(0, dot), ext: file.slice(dot + 1).toLowerCase() };
}

/**
 * Parse le collage de la liste de références : une ligne = un produit,
 * deux identifiants séparés par tabulation ou espaces.
 *
 * L'EAN est reconnu à sa forme (8 à 14 chiffres), pas à sa position : une
 * liste dont les colonnes sont inversées passe quand même.
 *
 * @param {string} text
 * @returns {{refs: Ref[], invalid: {line:number,raw:string,reason:string}[],
 *            duplicates: {line:number,raw:string,firstLine:number}[]}}
 */
export function parseReferences(text) {
  const refs = [];
  const invalid = [];
  const duplicates = [];
  const seen = new Map();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const trimmed = raw.trim();
    if (!trimmed) return;

    const fields = trimmed.split(/\s+/);
    const eanAt = fields.findIndex((f) => /^\d{8,14}$/.test(f));
    const ean = eanAt < 0 ? undefined : fields[eanAt];
    // Un champ qui ne contient que de la ponctuation n'est pas un identifiant.
    const code = fields.find((f, j) => j !== eanAt && normalizeId(f));

    const ids = [code, ean].filter(Boolean);
    if (!ids.length) {
      invalid.push({ line, raw: trimmed, reason: 'aucun identifiant exploitable' });
      return;
    }

    const key = ids.map(normalizeId).sort().join('|');
    const first = seen.get(key);
    if (first !== undefined) {
      duplicates.push({ line, raw: trimmed, firstLine: first });
      return;
    }
    seen.set(key, line);

    const warnings = [];
    if (fields.length > 2) warnings.push('champs supplémentaires ignorés');
    if (ids.length < 2) warnings.push('un seul identifiant sur la ligne');

    refs.push({
      line,
      raw: trimmed,
      code: code ?? null,
      ean: ean ?? null,
      label: code ?? ean,
      warnings,
    });
  });

  return { refs, invalid, duplicates };
}

/**
 * Confronte les fichiers scannés aux références.
 *
 * Un fichier qui matche plusieurs références est *ambigu* : il est sorti du
 * lot et ne produit rien, il n'apparaît que dans le rapport. Trancher
 * silencieusement produirait un fichier dont le nom choisit à notre place.
 *
 * @param {{path:string}[]} files chemins relatifs au dossier scanné
 * @param {Ref[]} refs
 * @param {{firstOnly?: boolean}} [opts] ne traiter que le 1er fichier par référence
 */
export function matchFiles(files, refs, { firstOnly = false } = {}) {
  const ignored = [];
  const scanned = [];

  for (const file of files) {
    const { base, ext } = splitPath(file.path);
    if (!IMAGE_EXT.has(ext)) {
      ignored.push({ ...file, reason: ext ? `.${ext} non supporté` : 'sans extension' });
      continue;
    }
    scanned.push({ ...file, tokens: new Set(tokenize(base)) });
  }
  // Ordre stable : deux lots identiques donnent le même résultat, et
  // `firstOnly` choisit toujours le même fichier.
  scanned.sort((a, b) => collator.compare(a.path, b.path));

  const perRef = new Map(refs.map((r) => [r, []]));
  const ambiguous = [];
  const unused = [];

  for (const file of scanned) {
    const hits = [];
    for (const ref of refs) {
      const onCode = Boolean(ref.code) && file.tokens.has(normalizeId(ref.code));
      const onEan = Boolean(ref.ean) && file.tokens.has(normalizeId(ref.ean));
      if (!onCode && !onEan) continue;
      hits.push({ ref, matchedOn: onCode && onEan ? 'both' : onCode ? 'code' : 'ean' });
    }

    if (hits.length === 0) unused.push(strip(file));
    else if (hits.length === 1) perRef.get(hits[0].ref).push({ file: strip(file), matchedOn: hits[0].matchedOn });
    else ambiguous.push({ file: strip(file), refs: hits.map((h) => ({ ref: h.ref, matchedOn: h.matchedOn })) });
  }

  const tasks = [];
  const missing = [];
  for (const ref of refs) {
    const found = perRef.get(ref);
    if (found.length === 0) {
      missing.push({
        ref,
        // Distinction utile : "aucun fichier" vs "des fichiers, mais tous écartés".
        onlyAmbiguous: ambiguous.some((a) => a.refs.some((h) => h.ref === ref)),
      });
      continue;
    }
    for (const hit of firstOnly ? found.slice(0, 1) : found) {
      tasks.push({ ref, file: hit.file, matchedOn: hit.matchedOn });
    }
  }

  return { tasks, missing, unused, ambiguous, ignored };
}

/**
 * Décide le nom de chaque fichier de sortie. Il porte l'EAN, jamais le nom
 * d'origine : c'est l'EAN qui identifie le produit en aval.
 *
 * - une seule image pour la référence -> `<EAN>.<ext>`
 * - plusieurs -> `<EAN>_1`, `<EAN>_2`... dans l'ordre de tri des chemins
 * - ligne sans EAN -> repli sur le code interne, signalé dans le rapport
 *
 * Deux références distinctes qui aboutiraient au même EAN écriraient l'une
 * par-dessus l'autre : elles sont écartées et remontées, jamais écrasées.
 *
 * @param {{ref: Ref, file: {path:string}, matchedOn: string}[]} tasks
 * @param {{ext?: string}} [opts] extension du format de sortie choisi
 */
function applyTemplate(template, ref) {
  const s = template
    .replace('{ean}', ref.ean ?? '')
    .replace('{code}', ref.code ?? '')
    .replace(/[-_\s]+$/, '')
    .replace(/^[-_\s]+/, '')
    .trim();
  return s || (ref.ean ?? ref.code);
}

export function planOutputs(tasks, { ext = 'tif', nameTemplate = '{ean}' } = {}) {
  const byRef = new Map();
  for (const task of tasks) {
    if (!byRef.has(task.ref)) byRef.set(task.ref, []);
    byRef.get(task.ref).push(task);
  }

  const byStem = new Map();
  for (const ref of byRef.keys()) {
    const stem = applyTemplate(nameTemplate, ref);
    if (!byStem.has(stem)) byStem.set(stem, []);
    byStem.get(stem).push(ref);
  }

  const outputs = [];
  const collisions = [];
  for (const [stem, refs] of byStem) {
    if (refs.length > 1) {
      collisions.push({ stem, refs, files: refs.flatMap((r) => byRef.get(r).map((t) => t.file)) });
      continue;
    }
    const [ref] = refs;
    const list = byRef.get(ref);
    list.forEach((task, i) => {
      const baseName = list.length === 1 ? `${stem}.${ext}` : `${stem}_${i + 1}.${ext}`;
      const dir = splitPath(task.file.path).dir;
      const outPath = dir ? `${dir}/${baseName}` : baseName;
      outputs.push({ ...task, name: baseName, dir, outPath, namedFromEan: Boolean(ref.ean) });
    });
  }

  return { outputs, collisions, withoutEan: outputs.filter((o) => !o.namedFromEan) };
}

function strip({ tokens, ...file }) {
  return file;
}

/** @typedef {{line:number, raw:string, code:string|null, ean:string|null, label:string, warnings:string[]}} Ref */
