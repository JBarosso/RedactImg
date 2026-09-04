import { useRef, useState } from 'react';
import { FolderOpen, FolderPlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { scanDataTransfer, scanFileList, type Scanned } from '@/lib/scan';
import { cn } from '@/lib/utils';

type Props = {
  files: Scanned[];
  images: number;
  onAdd: (files: Scanned[]) => void;
  onClear: () => void;
  disabled?: boolean;
};

export function Dropzone({ files, images, onAdd, onClear, disabled }: Props) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (disabled) return;
    setBusy(true);
    try {
      onAdd(await scanDataTransfer(event.dataTransfer));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={cn(
        'rounded-3xl border-2 border-dashed p-8 text-center transition-colors',
        over ? 'border-primary bg-primary/10' : 'border-border bg-card/60',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
        <FolderOpen className="size-8" />
      </div>

      <p className="text-lg font-semibold">Déposez ici vos dossiers d'images</p>
      <p className="text-muted-foreground mt-1 text-sm">
        Les sous-dossiers sont parcourus automatiquement. JPEG et PNG.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy}>
          <FolderPlus /> Choisir un dossier
        </Button>
        {files.length > 0 && (
          <Button variant="ghost" onClick={onClear} disabled={busy}>
            <Trash2 /> Vider
          </Button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        // `webkitdirectory` n'est pas dans les types React mais reste le seul
        // moyen d'ouvrir un sélecteur de dossier hors glisser-déposer.
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files) onAdd(scanFileList(e.target.files));
          e.target.value = '';
        }}
      />

      <p className="text-muted-foreground mt-5 text-sm">
        {busy
          ? 'Lecture des dossiers…'
          : files.length === 0
            ? 'Aucun fichier chargé'
            : `${files.length} fichier${files.length > 1 ? 's' : ''} lu${files.length > 1 ? 's' : ''}, dont ${images} image${images > 1 ? 's' : ''}`}
      </p>
    </div>
  );
}
