// Génère les icônes PNG de la PWA sans dépendance : node:zlib suffit à écrire
// un PNG valide, et le dessin est de la géométrie simple.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const CRC = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bits par canal
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtre "none"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Icône : carré arrondi dégradé pêche -> lavande, soleil + collines. */
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22;              // rayon des coins
  const sun = { x: size * 0.66, y: size * 0.34, r: size * 0.11 };
  const set = (x, y, [cr, cg, cb], a = 255) => {
    const i = (y * size + x) * 4;
    px[i] = cr; px[i + 1] = cg; px[i + 2] = cb; px[i + 3] = a;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // coins arrondis
      const cx = Math.min(Math.max(x, r), size - r);
      const cy = Math.min(Math.max(y, r), size - r);
      if (Math.hypot(x - cx, y - cy) > r) continue;

      let color = mix([255, 214, 186], [206, 199, 245], (x + y) / (2 * size));

      // collines menthe : deux paraboles
      const hill = (bx, by, w) => by + ((x - bx) ** 2) / w;
      if (y > hill(size * 0.34, size * 0.60, size * 0.9)) color = [151, 222, 197];
      if (y > hill(size * 0.70, size * 0.68, size * 0.7)) color = [122, 200, 178];

      // soleil, dessiné au-dessus du dégradé mais derrière rien
      if (Math.hypot(x - sun.x, y - sun.y) < sun.r &&
          y < hill(size * 0.34, size * 0.60, size * 0.9)) color = [255, 250, 240];

      set(x, y, color);
    }
  }
  return png(size, size, px);
}

for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), draw(size));
}
console.log('icon-192.png + icon-512.png -> public/');
