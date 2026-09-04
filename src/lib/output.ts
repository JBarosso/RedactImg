import { zipSync } from 'fflate';

export type Writer = {
  kind: 'disk' | 'zip';
  label: string;
  write(name: string, blob: Blob): Promise<void>;
  finish(): Promise<void>;
  bytes(): number;
};

export const hasFileSystemAccess = 'showDirectoryPicker' in globalThis;

// IndexedDB – persiste le dernier dossier pour que le picker s'y ouvre.
const IDB = { name: 'redacimg', store: 'handles', key: 'last' };

function openIdb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB.name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB.store);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function saveLastDir(handle: FileSystemDirectoryHandle): void {
  openIdb()
    .then((db) => {
      db.transaction(IDB.store, 'readwrite').objectStore(IDB.store).put(handle, IDB.key);
    })
    .catch(() => {});
}

async function loadLastDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIdb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(IDB.store, 'readonly');
      const req = tx.objectStore(IDB.store).get(IDB.key);
      req.onsuccess = () => res((req.result as FileSystemDirectoryHandle) ?? null);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return null;
  }
}

// Crée les sous-dossiers nécessaires et écrit le fichier.
async function writeNested(root: FileSystemDirectoryHandle, path: string, blob: Blob) {
  const parts = path.split('/');
  const fileName = parts.pop()!;
  let dir: FileSystemDirectoryHandle = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  const fh = await dir.getFileHandle(fileName, { create: true });
  const stream = await fh.createWritable();
  await stream.write(blob);
  await stream.close();
}

/**
 * Écriture directe dans un dossier si le navigateur le permet, sinon ZIP.
 * Le picker s'ouvre dans le dernier dossier choisi grâce à `startIn`.
 */
export async function createWriter(): Promise<Writer> {
  if (hasFileSystemAccess) {
    const last = await loadLastDir();
    const dir = await (
      globalThis as unknown as {
        showDirectoryPicker(o: {
          mode: string;
          startIn?: FileSystemDirectoryHandle;
        }): Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker({ mode: 'readwrite', ...(last ? { startIn: last } : {}) });

    saveLastDir(dir);
    let total = 0;
    return {
      kind: 'disk',
      label: dir.name,
      async write(name, blob) {
        await writeNested(dir, name, blob);
        total += blob.size;
      },
      async finish() {},
      bytes: () => total,
    };
  }

  // Repli : tout reste en mémoire jusqu'au téléchargement.
  const files: Record<string, Uint8Array> = {};
  let total = 0;
  return {
    kind: 'zip',
    label: 'archive ZIP',
    async write(name, blob) {
      files[name] = new Uint8Array(await blob.arrayBuffer());
      total += blob.size;
    },
    async finish() {
      if (!Object.keys(files).length) return;
      const zip = zipSync(files, { level: 0 });
      download(new Blob([zip as unknown as BlobPart], { type: 'application/zip' }), 'redacimg.zip');
    },
    bytes: () => total,
  };
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `;` et BOM : Excel en français ouvre le fichier sans écran d'import. */
export function toCsv(rows: (string | number)[][]): Blob {
  const body = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
    .join('\r\n');
  return new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' });
}
