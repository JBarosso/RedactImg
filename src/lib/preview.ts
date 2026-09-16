import { newWorker, runOne } from './pool';
import { DEFAULTS, type Settings } from './settings';

/** `<img>` n'affiche pas le TIFF : son aperçu est rendu en JPEG par le worker. */
export const needsDecode = (file: File) => /\.tiff?$/i.test(file.name);

let worker: Worker | undefined;
let queue: Promise<unknown> = Promise.resolve();
// ponytail: URLs jamais révoquées, quelques Ko par aperçu affiché. Passer à un
// LRU si des sessions à plusieurs milliers de TIFF font gonfler la mémoire.
const cache = new WeakMap<File, Map<number, Promise<string>>>();

export function decodedPreview(file: File, size: number): Promise<string> {
  let bySize = cache.get(file);
  if (!bySize) cache.set(file, (bySize = new Map()));
  const cached = bySize.get(size);
  if (cached) return cached;

  const settings: Settings = { ...DEFAULTS, width: size, height: size, mode: 'contain', allowUpscale: false, format: 'jpg', quality: 85 };
  // Un seul worker, une image à la fois : les aperçus ne doivent ni saturer la
  // mémoire ni ralentir un lot lancé en parallèle.
  const url = queue.then(async () => {
    worker ??= newWorker();
    const done = await runOne(worker, { id: 0, file, settings }, new AbortController().signal);
    if (!done.ok) throw new Error(done.error);
    return URL.createObjectURL(done.blob);
  });
  queue = url.catch(() => undefined);
  bySize.set(size, url);
  return url;
}
