import { useRef, useState } from 'react';
import { Download, FolderPlus, ImagePlus, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Thumbnail } from '@/components/ReportPanel';
import { matchFiles, parseEan } from '@/lib/matching.js';
import { scanDataTransfer, scanFileList, type Scanned } from '@/lib/scan';
import { cn } from '@/lib/utils';

export type EanItem = { id: string; ean: string; files: Scanned[] };
type SetItems = React.Dispatch<React.SetStateAction<EanItem[]>>;

// Pas de crypto.randomUUID : indisponible hors HTTPS/localhost.
let nextId = 0;
export const newEanItem = (): EanItem => ({ id: String(nextId++), ean: '', files: [] });

// Même filtre et même ordre que `manualTasks` : les vignettes suivent _1, _2…
const imagesOf = (files: Scanned[]) => matchFiles(files, []).unused;

type Props = {
  items: EanItem[];
  onChange: SetItems;
  onExpand: (f: File) => void;
  /** Mode autonome : un bouton de téléchargement par bloc et un global. */
  onDownload?: (items: EanItem[]) => Promise<void>;
  disabled?: boolean;
};

export function EanItems({ items, onChange, onExpand, onDownload, disabled }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const it of items) {
    const ean = parseEan(it.ean);
    if (ean) counts.set(ean, (counts.get(ean) ?? 0) + 1);
  }
  const ready = (it: EanItem) => {
    const ean = parseEan(it.ean);
    return ean !== null && counts.get(ean) === 1 && imagesOf(it.files).length > 0;
  };
  const run = async (key: string, list: EanItem[]) => {
    setBusy(key);
    try {
      await onDownload?.(list);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <EanRow
              key={item.id}
              item={item}
              setItems={onChange}
              duplicate={(counts.get(parseEan(item.ean) ?? '') ?? 0) > 1}
              disabled={disabled}
              onExpand={onExpand}
              download={
                onDownload && {
                  run: () => run(item.id, [item]),
                  busy: busy === item.id,
                  disabled: busy !== null || !ready(item),
                }
              }
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => onChange((prev) => [...prev, newEanItem()])}
          disabled={disabled}
        >
          <Plus /> Ajouter un EAN
        </Button>
        {onDownload && (
          <Button
            onClick={() => run('all', items.filter(ready))}
            disabled={busy !== null || !items.some(ready)}
          >
            {busy === 'all' ? <Loader2 className="animate-spin" /> : <Download />}
            Télécharger tout
          </Button>
        )}
      </div>
    </div>
  );
}

function EanRow({
  item,
  setItems,
  duplicate,
  disabled,
  onExpand,
  download,
}: {
  item: EanItem;
  setItems: SetItems;
  duplicate: boolean;
  disabled?: boolean;
  onExpand: (f: File) => void;
  download?: { run: () => void; busy: boolean; disabled: boolean };
}) {
  const [over, setOver] = useState(false);
  const [scanning, setScanning] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);

  const images = imagesOf(item.files);
  const error = !item.ean.trim()
    ? null
    : !parseEan(item.ean)
      ? 'Caractères interdits : \\ / : * ? " < > |'
      : duplicate
        ? 'EAN déjà saisi dans un autre bloc'
        : null;

  // Mises à jour fonctionnelles : un scan de dossier peut finir après d'autres saisies.
  const patch = (fn: (it: EanItem) => EanItem) =>
    setItems((prev) => prev.map((it) => (it.id === item.id ? fn(it) : it)));
  const add = (added: Scanned[]) =>
    patch((it) => ({
      ...it,
      files: [...new Map([...it.files, ...added].map((f) => [f.path, f])).values()],
    }));
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) add(scanFileList(e.target.files));
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        setScanning(true);
        try {
          add(await scanDataTransfer(e.dataTransfer));
        } finally {
          setScanning(false);
        }
      }}
      className={cn(
        'space-y-3 rounded-2xl border-2 border-dashed p-4 transition-colors',
        over ? 'border-primary bg-primary/10' : 'border-border bg-card/60',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <Input
            value={item.ean}
            onChange={(e) => patch((it) => ({ ...it, ean: e.target.value }))}
            placeholder="EAN"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            className="font-mono"
          />
          {error && <p className="text-destructive text-xs">{error}</p>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Retirer ce bloc"
          onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
        >
          <X />
        </Button>
      </div>

      {images.length > 0 && (
        <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto">
          {images.map((s) => (
            <Thumbnail key={s.path} file={s.file} onExpand={onExpand} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => filesInput.current?.click()} disabled={scanning}>
          <ImagePlus /> Images
        </Button>
        <Button variant="secondary" size="sm" onClick={() => dirInput.current?.click()} disabled={scanning}>
          <FolderPlus /> Dossier
        </Button>
        {item.files.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => patch((it) => ({ ...it, files: [] }))}>
            <Trash2 /> Vider
          </Button>
        )}
        <span className="text-muted-foreground ml-auto text-sm">
          {scanning
            ? 'Lecture…'
            : images.length > 0
              ? `${images.length} image${images.length > 1 ? 's' : ''}`
              : 'ou glissez-les ici'}
        </span>
      </div>

      {download && (
        <Button variant="secondary" className="w-full" onClick={download.run} disabled={download.disabled}>
          {download.busy ? <Loader2 className="animate-spin" /> : <Download />}
          Télécharger
        </Button>
      )}

      <input
        ref={filesInput}
        type="file"
        multiple
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={onPick}
      />
      <input
        ref={dirInput}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: '' } as Record<string, string>)}
        onChange={onPick}
      />
    </div>
  );
}
