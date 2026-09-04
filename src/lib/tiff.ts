// Encodeur TIFF baseline, RGB 8 bits, une seule bande.
//
// UTIF.js n'encode qu'en non compressé et en RGBA : pour du Deflate il aurait
// fallu réécrire l'IFD par-dessus. Autant l'écrire directement — ~80 lignes,
// et la compression passe par CompressionStream, natif dans le navigateur.
// Résultat : ni UTIF ni pako en dépendance.

const HEADER = 8;
const ENTRIES = 13;
const IFD_SIZE = 2 + ENTRIES * 12 + 4;
const BPS_AT = HEADER + IFD_SIZE;       // BitsPerSample : 3 SHORT
const XRES_AT = BPS_AT + 8;             // 6 octets + padding pair
const YRES_AT = XRES_AT + 8;
const DATA_AT = YRES_AT + 8;

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

/** RGBA du canvas -> RGB. L'alpha a déjà été aplati sur la couleur de fond. */
function toRgb(rgba: Uint8ClampedArray): Uint8Array {
  const rgb = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) {
    rgb[o] = rgba[i];
    rgb[o + 1] = rgba[i + 1];
    rgb[o + 2] = rgba[i + 2];
  }
  return rgb;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  // CompressionStream('deflate') produit un flux zlib, exactement ce que
  // le tag Compression = 8 (Adobe Deflate) attend.
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeTiff(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  useDeflate: boolean,
): Promise<Blob> {
  const raw = toRgb(rgba);
  const strip = useDeflate ? await deflate(raw) : raw;

  const out = new ArrayBuffer(DATA_AT + strip.length);
  const view = new DataView(out);
  const LE = true;

  view.setUint16(0, 0x4949, LE);   // « II » : little-endian
  view.setUint16(2, 42, LE);
  view.setUint32(4, HEADER, LE);   // l'IFD suit immédiatement
  view.setUint16(HEADER, ENTRIES, LE);

  let at = HEADER + 2;
  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(at, tag, LE);
    view.setUint16(at + 2, type, LE);
    view.setUint32(at + 4, count, LE);
    // Une valeur de 4 octets ou moins tient dans le champ ; sinon `value` est un offset.
    if (type === SHORT && count === 1) view.setUint16(at + 8, value, LE);
    else view.setUint32(at + 8, value, LE);
    at += 12;
  };

  // Les tags doivent être triés par numéro croissant.
  entry(256, LONG, 1, width);          // ImageWidth
  entry(257, LONG, 1, height);         // ImageLength
  entry(258, SHORT, 3, BPS_AT);        // BitsPerSample
  entry(259, SHORT, 1, useDeflate ? 8 : 1); // Compression
  entry(262, SHORT, 1, 2);             // PhotometricInterpretation : RGB
  entry(273, LONG, 1, DATA_AT);        // StripOffsets
  entry(277, SHORT, 1, 3);             // SamplesPerPixel
  entry(278, LONG, 1, height);         // RowsPerStrip : une seule bande
  entry(279, LONG, 1, strip.length);   // StripByteCounts
  entry(282, RATIONAL, 1, XRES_AT);    // XResolution
  entry(283, RATIONAL, 1, YRES_AT);    // YResolution
  entry(284, SHORT, 1, 1);             // PlanarConfiguration : entrelacé
  entry(296, SHORT, 1, 2);             // ResolutionUnit : pouce
  view.setUint32(at, 0, LE);           // pas d'IFD suivant

  view.setUint16(BPS_AT, 8, LE);
  view.setUint16(BPS_AT + 2, 8, LE);
  view.setUint16(BPS_AT + 4, 8, LE);
  for (const offset of [XRES_AT, YRES_AT]) {
    view.setUint32(offset, 72, LE);
    view.setUint32(offset + 4, 1, LE);
  }

  new Uint8Array(out).set(strip, DATA_AT);
  return new Blob([out], { type: 'image/tiff' });
}
