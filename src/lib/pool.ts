import type { Settings } from './settings';
import type { Done, Job } from '../workers/process.worker';

export type BatchItem = { name: string; file: File; source: string };
export type BatchFailure = { name: string; source: string; error: string };

type Handlers = {
  write(item: BatchItem, blob: Blob, size: { width: number; height: number }): Promise<void>;
  onProgress(done: number, label: string): void;
};

const newWorker = () =>
  new Worker(new URL('../workers/process.worker.ts', import.meta.url), { type: 'module' });

/**
 * Un worker par cœur, **une image à la fois par worker** : les fichiers
 * peuvent peser plusieurs centaines de Mo une fois décodés, et l'écriture
 * du résultat est attendue avant de charger la suivante.
 */
export async function runBatch(
  items: BatchItem[],
  settings: Settings,
  handlers: Handlers,
  signal: AbortSignal,
): Promise<BatchFailure[]> {
  const size = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, items.length, 8));
  const workers = Array.from({ length: size }, newWorker);
  const failures: BatchFailure[] = [];
  let next = 0;
  let done = 0;

  const consume = async (worker: Worker) => {
    while (!signal.aborted) {
      const index = next++;
      if (index >= items.length) return;
      const item = items[index];
      try {
        const result = await runOne(worker, { id: index, file: item.file, settings }, signal);
        if (result.ok) await handlers.write(item, result.blob, result);
        else failures.push({ name: item.name, source: item.source, error: result.error });
      } catch (error) {
        if (signal.aborted) return;
        failures.push({
          name: item.name,
          source: item.source,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      handlers.onProgress(++done, item.source);
    }
  };

  try {
    await Promise.all(workers.map(consume));
  } finally {
    workers.forEach((w) => w.terminate());
  }
  return failures;
}

function runOne(worker: Worker, job: Job, signal: AbortSignal): Promise<Done> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('annulé'));
    };
    worker.onmessage = (e: MessageEvent<Done>) => {
      cleanup();
      resolve(e.data);
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || 'erreur dans le worker'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    worker.postMessage(job);
  });
}
