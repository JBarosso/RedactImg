export type Scanned = { path: string; file: File };

/**
 * Le glisser-déposer donne des `FileSystemEntry`. Les `DataTransferItem` sont
 * invalidés dès que le handler rend la main : on récupère toutes les entrées
 * de façon synchrone avant le moindre `await`.
 */
export async function scanDataTransfer(dt: DataTransfer): Promise<Scanned[]> {
  const roots = Array.from(dt.items)
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => Boolean(e));

  const found: Scanned[] = [];
  await Promise.all(roots.map((entry) => walk(entry, '', found)));
  return dedupe(found);
}

/** Repli : `<input type="file" webkitdirectory>`. */
export function scanFileList(list: FileList): Scanned[] {
  return dedupe(
    Array.from(list).map((file) => ({
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      file,
    })),
  );
}

async function walk(entry: FileSystemEntry, prefix: string, out: Scanned[]): Promise<void> {
  const path = prefix + entry.name;
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ path, file });
    return;
  }
  const children = await readAll((entry as FileSystemDirectoryEntry).createReader());
  await Promise.all(children.map((child) => walk(child, `${path}/`, out)));
}

/** `readEntries` renvoie les enfants par paquets : il faut boucler jusqu'au vide. */
function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const step = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all);
        all.push(...batch);
        step();
      }, reject);
    step();
  });
}

/** Le même dossier déposé deux fois ne doit pas doubler le lot. */
function dedupe(files: Scanned[]): Scanned[] {
  const byPath = new Map<string, Scanned>();
  for (const f of files) if (!byPath.has(f.path)) byPath.set(f.path, f);
  return [...byPath.values()];
}
