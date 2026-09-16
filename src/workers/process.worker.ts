/// <reference lib="webworker" />
import { decodeTiff, encodeTiff } from '@/lib/tiff';
import type { Settings } from '@/lib/settings';

export type Job = { id: number; file: File; settings: Settings };
export type Done =
  | { id: number; ok: true; blob: Blob; width: number; height: number }
  | { id: number; ok: false; error: string };

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function geometry(sw: number, sh: number, s: Settings) {
  const fit = Math.min(s.width / sw, s.height / sh);
  const fill = Math.max(s.width / sw, s.height / sh);
  let scale = s.mode === 'cover' ? fill : fit;
  // Agrandir une petite image ne crée pas de détail, ça la rend juste floue.
  if (!s.allowUpscale) scale = Math.min(scale, 1);

  const drawW = Math.max(1, Math.round(sw * scale));
  const drawH = Math.max(1, Math.round(sh * scale));
  // « contenir » suit les proportions ; « marges » et « recadrer » sortent
  // toujours exactement la taille demandée.
  const canvasW = s.mode === 'contain' ? drawW : s.width;
  const canvasH = s.mode === 'contain' ? drawH : s.height;

  return {
    canvasW,
    canvasH,
    drawW,
    drawH,
    dx: Math.round((canvasW - drawW) / 2),
    dy: Math.round((canvasH - drawH) / 2),
  };
}

// Matrices [a, b, c, d, e, f] pour Orientation 2 à 8, e et f en fraction de la
// taille de sortie : x' = a·x + c·y + e·w, y' = b·x + d·y + f·h.
const ORIENTATION = [
  [-1, 0, 0, 1, 1, 0],
  [-1, 0, 0, -1, 1, 1],
  [1, 0, 0, -1, 0, 1],
  [0, 1, 1, 0, 0, 0],
  [0, 1, -1, 0, 1, 0],
  [0, -1, -1, 0, 1, 1],
  [0, -1, 1, 0, 0, 1],
] as const;

async function decode(file: File): Promise<ImageBitmap> {
  // Détection par signature, pas par extension : un .tif mal nommé passe quand même.
  const [a, b, c, d] = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const tiff = (a === 0x49 && b === 0x49 && c === 42 && d === 0) || (a === 0x4d && b === 0x4d && c === 0 && d === 42);
  // `from-image` applique l'orientation EXIF : sans ça les photos prises
  // à la verticale ressortent couchées. JPEG, PNG et AVIF sont natifs.
  if (!tiff) return createImageBitmap(file, { imageOrientation: 'from-image' });

  const { rgba, width, height, orientation } = decodeTiff(await file.arrayBuffer());
  const bmp = await createImageBitmap(
    new ImageData(new Uint8ClampedArray(rgba.buffer as ArrayBuffer, rgba.byteOffset, rgba.length), width, height),
  );
  const m = ORIENTATION[orientation - 2];
  if (!m) return bmp;

  // Un ImageData n'a pas d'EXIF : l'orientation TIFF s'applique à la main.
  const swap = orientation >= 5;
  const canvas = new OffscreenCanvas(swap ? height : width, swap ? width : height);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4] * canvas.width, m[5] * canvas.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return createImageBitmap(canvas);
}

async function process({ file, settings }: Job) {
  let bmp = await decode(file);
  const geo = geometry(bmp.width, bmp.height, settings);

  // Réduction en plusieurs demi-passes : un downscale direct d'un facteur 8
  // crénelle, une succession de /2 non.
  while (bmp.width >= geo.drawW * 2 && bmp.height >= geo.drawH * 2 && bmp.width > 1) {
    const next = await createImageBitmap(bmp, {
      resizeWidth: Math.max(1, bmp.width >> 1),
      resizeHeight: Math.max(1, bmp.height >> 1),
      resizeQuality: 'high',
    });
    bmp.close();
    bmp = next;
  }

  const canvas = new OffscreenCanvas(geo.canvasW, geo.canvasH);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, geo.canvasW, geo.canvasH);
  ctx.drawImage(bmp, geo.dx, geo.dy, geo.drawW, geo.drawH);
  bmp.close();

  const blob =
    settings.format === 'tif'
      ? await encodeTiff(
          ctx.getImageData(0, 0, geo.canvasW, geo.canvasH).data,
          geo.canvasW,
          geo.canvasH,
          settings.tiffDeflate,
        )
      : await canvas.convertToBlob({
          type: MIME[settings.format],
          quality: settings.quality / 100,
        });

  return { blob, width: geo.canvasW, height: geo.canvasH };
}

self.onmessage = async (event: MessageEvent<Job>) => {
  const { id } = event.data;
  try {
    const { blob, width, height } = await process(event.data);
    (self as unknown as Worker).postMessage({ id, ok: true, blob, width, height } satisfies Done);
  } catch (error) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies Done);
  }
};
