/// <reference lib="webworker" />
import { encodeTiff } from '@/lib/tiff';
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

async function process({ file, settings }: Job) {
  // `from-image` applique l'orientation EXIF : sans ça les photos prises
  // à la verticale ressortent couchées.
  let bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
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
