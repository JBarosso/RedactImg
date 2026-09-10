import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReferences, matchFiles, planOutputs, tokenize, normalizeId, manualTasks, parseEan } from '../src/lib/matching.js';
import { FILES, REFS_TEXT } from '../scripts/make-fixtures.mjs';

const files = FILES.map(([path]) => ({ path }));
const { refs, invalid, duplicates } = parseReferences(REFS_TEXT);
const byLabel = (label) => refs.find((r) => r.label === label);
const pathsOf = (list) => list.map((x) => x.file?.path ?? x.path).sort();

test('tokenize : les séparateurs sont des frontières', () => {
  assert.deepEqual(tokenize('PRETJ5_1'), ['pretj5', '1']);
  assert.deepEqual(tokenize('prévv0 photo'), ['prevv0', 'photo']);
  assert.deepEqual(tokenize('PREVV2.JPG'), ['prevv2', 'jpg']);
  assert.deepEqual(tokenize('PRF0ZS-7040353497037'), ['prf0zs', '7040353497037']);
});

test('normalizeId : une référence ponctuée reste comparable', () => {
  assert.equal(normalizeId('PRE-TJ5'), 'pretj5');
  assert.equal(normalizeId('prétj 5'), 'pretj5');
});

test('parse : lignes vides ignorées, doublon détecté, ligne à 1 identifiant acceptée', () => {
  assert.equal(refs.length, 9);
  assert.equal(invalid.length, 0);
  assert.deepEqual(duplicates.map((d) => [d.line, d.firstLine]), [[9, 1]]);
  assert.deepEqual(byLabel('PRSOLO1').warnings, ['un seul identifiant sur la ligne']);
  assert.deepEqual(byLabel('PRQ-M4').warnings, ['champs supplémentaires ignorés']);
});

test('parse : EAN reconnu à sa forme, pas à sa position', () => {
  const { refs: r } = parseReferences('7040353498027\tPRETJ5');
  assert.equal(r[0].code, 'PRETJ5');
  assert.equal(r[0].ean, '7040353498027');
});

test('parse : une ligne sans identifiant part en invalide', () => {
  const { refs: r, invalid: inv } = parseReferences('---\nPRETJ5\t7040353498027');
  assert.equal(r.length, 1);
  assert.deepEqual(inv.map((i) => i.line), [1]);
});

const result = matchFiles(files, refs);

test('les non-images sont ignorées, pas comptées comme inutilisées', () => {
  assert.deepEqual(pathsOf(result.ignored), ['Photos HD/notes du studio.txt']);
});

test('une référence peut matcher plusieurs fichiers, sous-dossiers compris', () => {
  const hits = result.tasks.filter((t) => t.ref.label === 'PRETJ5');
  assert.deepEqual(pathsOf(hits), ['PRETJ5_1.jpg', 'PRETJ5_2.jpg', 'Photos HD/PRETJ5_1.jpg']);
  assert.ok(hits.every((h) => h.matchedOn === 'code'));
});

test('firstOnly ne garde qu un fichier, toujours le même', () => {
  const first = matchFiles(files, refs, { firstOnly: true }).tasks.filter((t) => t.ref.label === 'PRETJ5');
  assert.equal(first.length, 1);
  assert.equal(first[0].file.path, 'Photos HD/PRETJ5_1.jpg');
  const shuffled = matchFiles([...files].reverse(), refs, { firstOnly: true }).tasks.filter((t) => t.ref.label === 'PRETJ5');
  assert.deepEqual(shuffled, first);
});

test('le rapport dit sur quel identifiant ça a matché', () => {
  const byEan = result.tasks.find((t) => t.ref.label === 'PRETR3');
  assert.equal(byEan.file.path, '7040353500027.png');
  assert.equal(byEan.matchedOn, 'ean');
});

test('accents, espaces, casse et double extension matchent', () => {
  assert.equal(result.tasks.find((t) => t.ref.label === 'PREVV0').file.path, 'prévv0 photo.jpg');
  assert.equal(result.tasks.find((t) => t.ref.label === 'PREVV2').file.path, 'PREVV2.JPG.jpg');
  assert.equal(result.tasks.find((t) => t.ref.label === 'PRF0A8').file.path, 'Photos HD/lot 2/prf0a8.jpeg');
});

test('pas de includes brut : un EAN suffixé ne matche pas', () => {
  assert.ok(pathsOf(result.unused).includes('70403534970371.jpg'));
  assert.ok(pathsOf(result.unused).includes('PRETJ55.jpg'));
  assert.ok(!result.tasks.some((t) => t.file.path === '70403534970371.jpg'));
});

test('un fichier matchant deux références est ambigu et ne produit rien', () => {
  assert.equal(result.ambiguous.length, 1);
  const [amb] = result.ambiguous;
  assert.equal(amb.file.path, 'PRF0ZS-7040353497037.jpg');
  assert.deepEqual(
    amb.refs.map((h) => [h.ref.label, h.matchedOn]).sort(),
    [['PRF0A8', 'ean'], ['PRF0ZS', 'code']],
  );
  assert.ok(!result.tasks.some((t) => t.file.path === amb.file.path));
});

test('références introuvables, en distinguant celles écartées pour ambiguïté', () => {
  assert.deepEqual(
    result.missing.map((m) => [m.ref.label, m.onlyAmbiguous]).sort(),
    [['PRF0ZS', true], ['PRZZZ9', false]],
  );
});

test('une référence ponctuée dans la liste matche le fichier sans ponctuation', () => {
  assert.equal(result.tasks.find((t) => t.ref.label === 'PRQ-M4').file.path, 'Photos HD/PRQM4.jpg');
  assert.equal(result.tasks.find((t) => t.ref.label === 'PRSOLO1').file.path, 'PRSOLO1.png');
});

test('images inutilisées', () => {
  assert.deepEqual(pathsOf(result.unused), ['70403534970371.jpg', 'IMG_0042.jpg', 'PRETJ55.jpg']);
});

test('chaque image est dans exactement un bucket', () => {
  const total = result.ambiguous.length + result.unused.length +
    new Set(result.tasks.map((t) => t.file.path)).size;
  assert.equal(total, files.length - result.ignored.length);
});

const plan = planOutputs(result.tasks);
const nameOf = (label) => plan.outputs.filter((o) => o.ref.label === label).map((o) => o.name);

test('le fichier de sortie porte l EAN', () => {
  assert.deepEqual(nameOf('PRETR3'), ['7040353500027.tif']);
  assert.deepEqual(nameOf('PREVV0'), ['7040353499079.tif']);
});

test('plusieurs images pour une reference -> suffixe numerote, dans l ordre de tri', () => {
  assert.deepEqual(nameOf('PRETJ5'), [
    '7040353498027_1.tif',
    '7040353498027_2.tif',
    '7040353498027_3.tif',
  ]);
  const first = plan.outputs.find((o) => o.name === '7040353498027_1.tif');
  assert.equal(first.file.path, 'Photos HD/PRETJ5_1.jpg');
});

test('extension pilotee par le format de sortie', () => {
  const jpg = planOutputs(result.tasks, { ext: 'jpg' });
  assert.ok(jpg.outputs.every((o) => o.name.endsWith('.jpg')));
});

test('ligne sans EAN : repli sur le code interne, et c est signale', () => {
  assert.deepEqual(nameOf('PRSOLO1'), ['PRSOLO1.tif']);
  assert.deepEqual(plan.withoutEan.map((o) => o.ref.label), ['PRSOLO1']);
});

test('deux references pour un meme EAN : ecartees, jamais ecrasees', () => {
  const { refs: r } = parseReferences('PRETJ5 7040353498027 | PRETR3 7040353498027'.replace(' | ', String.fromCharCode(10)));
  const m = matchFiles([{ path: 'PRETJ5_1.jpg' }, { path: 'PRETR3.jpg' }], r);
  const p = planOutputs(m.tasks);
  assert.equal(p.outputs.length, 0);
  assert.equal(p.collisions.length, 1);
  assert.deepEqual(p.collisions[0].refs.map((x) => x.label), ['PRETJ5', 'PRETR3']);
  assert.deepEqual(p.collisions[0].files.map((f) => f.path), ['PRETJ5_1.jpg', 'PRETR3.jpg']);
});

test('aucun nom de sortie en double dans le plan', () => {
  assert.equal(new Set(plan.outputs.map((o) => o.name)).size, plan.outputs.length);
});

test('EAN manuel : saisie nettoyée, images seules triées, doublon écarté comme dans la liste', () => {
  assert.equal(parseEan(' 3023 190010373 '), '3023190010373');
  assert.equal(parseEan('1234567'), '1234567');
  assert.equal(parseEan('PRE/TJ5'), null);
  assert.equal(parseEan('   '), null);

  const tasks = manualTasks([
    { ean: '3023190010373', files: [{ path: 'b.jpg' }, { path: 'notes.txt' }, { path: 'a.png' }] },
    { ean: 'a/b', files: [{ path: 'c.jpg' }] },
    { ean: '3023190010373', files: [{ path: 'd.jpg' }] },
  ]);
  assert.deepEqual(tasks.map((t) => t.file.path), ['a.png', 'b.jpg', 'd.jpg']);
  assert.ok(tasks.every((t) => t.ref.line === 0 && t.matchedOn === 'ean'));

  const solo = planOutputs(manualTasks([{ ean: '3023190010373', files: [{ path: 'b.jpg' }, { path: 'a.png' }] }]));
  assert.deepEqual(solo.outputs.map((o) => o.name), ['3023190010373_1.tif', '3023190010373_2.tif']);

  const dup = planOutputs(tasks);
  assert.equal(dup.outputs.length, 0);
  assert.equal(dup.collisions.length, 1);
});
