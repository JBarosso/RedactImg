// Le TIFF est écrit à la main : on le relit octet par octet pour vérifier que
// l'IFD est cohérent et que les pixels ressortent identiques.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { encodeTiff } from '../src/lib/tiff.ts';

const W = 3;
const H = 2;
const rgba = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) {
  rgba[i * 4] = i * 10;
  rgba[i * 4 + 1] = 255 - i * 10;
  rgba[i * 4 + 2] = 128;
  rgba[i * 4 + 3] = 255;
}
const expectedRgb = Buffer.from([0, 255, 128, 10, 245, 128, 20, 235, 128, 30, 225, 128, 40, 215, 128, 50, 205, 128]);

async function parse(blob) {
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.readUInt16LE(0), 0x4949, 'entête little-endian');
  assert.equal(buf.readUInt16LE(2), 42, 'magic TIFF');

  const ifd = buf.readUInt32LE(4);
  const count = buf.readUInt16LE(ifd);
  const tags = new Map();
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    const type = buf.readUInt16LE(at + 2);
    tags.set(buf.readUInt16LE(at), {
      type,
      count: buf.readUInt32LE(at + 4),
      value: type === 3 ? buf.readUInt16LE(at + 8) : buf.readUInt32LE(at + 8),
      at,
    });
  }
  return { buf, count, tags, nextIfd: buf.readUInt32LE(ifd + 2 + count * 12) };
}

test('TIFF non compressé : IFD conforme et pixels intacts', async () => {
  const { buf, count, tags, nextIfd } = await parse(await encodeTiff(rgba, W, H, false));

  assert.equal(count, 13);
  assert.equal(nextIfd, 0, 'pas d IFD suivant');
  assert.equal(tags.get(256).value, W);
  assert.equal(tags.get(257).value, H);
  assert.equal(tags.get(259).value, 1, 'compression : aucune');
  assert.equal(tags.get(262).value, 2, 'photométrie RGB');
  assert.equal(tags.get(277).value, 3, '3 canaux');
  assert.equal(tags.get(278).value, H, 'une seule bande');
  assert.equal(tags.get(284).value, 1, 'entrelacé');

  const bps = tags.get(258);
  assert.equal(bps.count, 3);
  assert.deepEqual([0, 2, 4].map((o) => buf.readUInt16LE(bps.value + o)), [8, 8, 8]);

  const offset = tags.get(273).value;
  const bytes = tags.get(279).value;
  assert.equal(bytes, W * H * 3, 'RGB 8 bits sans alpha');
  assert.deepEqual(buf.subarray(offset, offset + bytes), expectedRgb);
  assert.equal(offset + bytes, buf.length, 'aucun octet en trop');
});

test('TIFF Deflate : flux zlib relisible, pixels identiques', async () => {
  const { buf, tags } = await parse(await encodeTiff(rgba, W, H, true));

  assert.equal(tags.get(259).value, 8, 'compression Adobe Deflate');
  const offset = tags.get(273).value;
  const strip = buf.subarray(offset, offset + tags.get(279).value);
  assert.deepEqual(inflateSync(strip), expectedRgb);
});

test('les tags sont triés par numéro croissant, comme l exige la spec TIFF', async () => {
  const { tags } = await parse(await encodeTiff(rgba, W, H, true));
  const numbers = [...tags.keys()];
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
});
