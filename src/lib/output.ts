import { zipSync } from 'fflate';

export type Writer = {
  kind: 'disk' | 'zip';
  label: string;
  write(name: string, blob: Blob): Promise<void>;
  finish(): Promise<void>;
  bytes(): number;
};

export const hasFileSystemAccess = 'showDirectoryPicker' in globalThis;

/**
 * Écriture directe dans un dossier si le navigateur le permet, sinon ZIP.
 * À appeler depuis un clic : le sélecteur de dossier exige un geste utilisateur.
 */
export async function createWriter(): Promise<Writer> {
  if (hasFileSystemAccess) {
    const dir = await (
      globalThis as unknown as {
        showDirectoryPicker(o: { mode: string }): Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker({ mode: 'readwrite' });

    let total = 0;
    return {
      kind: 'disk',
      label: dir.name,
      async write(name, blob) {
        const handle = await dir.getFileHandle(name, { create: true });
        const stream = await handle.createWritable();
        await stream.write(blob);
        await stream.close();
        total += blob.size;
      },
      async finish() {},
      bytes: () => total,
    };
  }

  // Repli : tout reste en mémoire jusqu'au téléchargement. Sur un très gros
  // lot c'est le point de rupture — d'où l'avertissement affiché dans l'app.
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
      // level 0 : les images sont déjà compressées, recompresser ne gagne rien.
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
