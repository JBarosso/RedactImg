import { useEffect, useRef, useState } from 'react';
import { Download, GripHorizontal, PartyPopper } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { download, toCsv } from '@/lib/output';

export type Section = {
  id: string;
  title: string;
  hint: string;
  headers: string[];
  rows: string[][];
  tone: 'bad' | 'warn' | 'info';
  rowFiles?: (File | null)[];
  /** Si fourni, des cases à cocher et un bouton dl par ligne apparaissent. */
  onDownload?: (files: File[]) => Promise<void>;
};

const TONE = {
  bad: 'bg-destructive/15 text-destructive',
  warn: 'bg-secondary text-secondary-foreground',
  info: 'bg-accent text-accent-foreground',
} as const;

// ── Thumbnail ──────────────────────────────────────────────────────────────
// Crée et révoque son propre object URL. Passe le File (pas l'URL) à onExpand
// pour que la lightbox gère sa propre URL indépendamment.
function useObjectUrl(file: File) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return url;
}

function Thumbnail({ file, onExpand }: { file: File; onExpand: (f: File) => void }) {
  const url = useObjectUrl(file);
  if (!url) return <div className="size-16 rounded-[6px] bg-muted animate-pulse" />;
  return (
    <img
      src={url}
      alt=""
      className="size-16 cursor-zoom-in rounded-[6px] object-cover"
      onClick={() => onExpand(file)}
    />
  );
}

// ── Lightbox ───────────────────────────────────────────────────────────────
function Lightbox({ file, onClose }: { file: File; onClose: () => void }) {
  const url = useObjectUrl(file);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-[3%]"
      style={{ height: '100svh' }}
      onClick={onClose}
    >
      <img
        src={url}
        alt=""
        style={{ height: '100%', width: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── ResizableTableContainer ────────────────────────────────────────────────
function ResizableTableContainer({ children }: { children: React.ReactNode }) {
  const [height, setHeight] = useState(320);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientY - startY.current;
      setHeight(Math.max(120, Math.min(900, startH.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div>
      <div style={{ height }} className="overflow-auto rounded-2xl border">
        {children}
      </div>
      <div
        onMouseDown={(e) => {
          dragging.current = true;
          startY.current = e.clientY;
          startH.current = height;
          e.preventDefault();
        }}
        className="mt-1 flex cursor-ns-resize items-center justify-center rounded-[6px] py-1 transition-colors hover:bg-muted/60 select-none"
      >
        <GripHorizontal className="text-muted-foreground size-4" />
      </div>
    </div>
  );
}

// ── ReportPanel ────────────────────────────────────────────────────────────
export function ReportPanel({ sections }: { sections: Section[] }) {
  const shown = sections.filter((s) => s.rows.length > 0);
  const [lightboxFile, setLightboxFile] = useState<File | null>(null);
  // selected[sectionId] = Set of row indices
  const [selected, setSelected] = useState<Record<string, Set<number>>>({});

  const toggleRow = (id: string, i: number) => {
    setSelected((prev) => {
      const s = new Set(prev[id] ?? []);
      s.has(i) ? s.delete(i) : s.add(i);
      return { ...prev, [id]: s };
    });
  };

  const toggleAll = (id: string, total: number) => {
    setSelected((prev) => {
      const s = prev[id] ?? new Set<number>();
      const allOn = s.size === total;
      return { ...prev, [id]: allOn ? new Set() : new Set(Array.from({ length: total }, (_, i) => i)) };
    });
  };

  if (shown.length === 0) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="bg-primary/15 text-primary flex size-16 items-center justify-center rounded-2xl">
            <PartyPopper className="size-8" />
          </div>
          <p className="text-lg font-semibold">Rien à signaler</p>
          <p className="text-muted-foreground text-sm">
            Toutes les références ont trouvé leur image, et toutes les images ont servi.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {lightboxFile && <Lightbox file={lightboxFile} onClose={() => setLightboxFile(null)} />}

      <div className="space-y-5">
        {shown.map((section) => {
          const sel = selected[section.id] ?? new Set<number>();
          const hasActions = Boolean(section.onDownload);
          const allChecked = sel.size === section.rows.length;

          return (
            <Card key={section.id} className="rounded-3xl">
              <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    {section.title}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[section.tone]}`}>
                      {section.rows.length}
                    </span>
                  </CardTitle>
                  <p className="text-muted-foreground text-sm">{section.hint}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    download(toCsv([section.headers, ...section.rows]), `redacimg-${section.id}.csv`)
                  }
                >
                  <Download /> CSV
                </Button>
              </CardHeader>

              <CardContent className="space-y-2">
                <ResizableTableContainer>
                  <Table>
                    <TableHeader className="bg-muted/60 sticky top-0">
                      <TableRow>
                        {section.rowFiles && <TableHead className="w-20 min-w-[80px]">Aperçu</TableHead>}
                        {section.headers.map((h) => (
                          <TableHead key={h}>{h}</TableHead>
                        ))}
                        {hasActions && (
                          <TableHead className="bg-muted sticky right-0 w-20">
                            <div className="flex items-center justify-center gap-2">
                              <span>DL</span>
                              <input
                                type="checkbox"
                                checked={allChecked}
                                onChange={() => toggleAll(section.id, section.rows.length)}
                                className="accent-primary cursor-pointer"
                              />
                            </div>
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {section.rows.map((row, i) => {
                        const file = section.rowFiles?.[i] ?? null;
                        return (
                          <TableRow key={i} data-state={sel.has(i) ? 'selected' : undefined}>
                            {section.rowFiles && (
                              <TableCell className="w-20 min-w-[80px] py-2">
                                {file ? (
                                  <Thumbnail file={file} onExpand={setLightboxFile} />
                                ) : null}
                              </TableCell>
                            )}
                            {row.map((cell, j) => (
                              <TableCell key={j} className={j === 0 ? 'font-medium' : ''}>
                                {cell}
                              </TableCell>
                            ))}
                            {hasActions && (
                              <TableCell className={`sticky right-0 ${sel.has(i) ? 'bg-muted' : 'bg-card'}`}>
                                <div className="flex items-center justify-center gap-2">
                                  {file ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-8 shrink-0"
                                      title="Télécharger cette image traitée"
                                      onClick={() => section.onDownload?.([file])}
                                    >
                                      <Download className="size-4" />
                                    </Button>
                                  ) : (
                                    <span className="size-8 shrink-0" />
                                  )}
                                  <input
                                    type="checkbox"
                                    checked={sel.has(i)}
                                    onChange={() => toggleRow(section.id, i)}
                                    className="accent-primary cursor-pointer"
                                  />
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ResizableTableContainer>

                {/* Barre de sélection */}
                {hasActions && sel.size > 0 && (
                  <div className="bg-accent/60 flex items-center justify-between gap-3 rounded-2xl px-4 py-2">
                    <span className="text-sm font-medium">
                      {sel.size} image{sel.size > 1 ? 's' : ''} sélectionnée{sel.size > 1 ? 's' : ''}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        const files = [...sel]
                          .map((i) => section.rowFiles?.[i] ?? null)
                          .filter((f): f is File => f !== null);
                        section.onDownload?.(files);
                      }}
                    >
                      <Download /> Télécharger la sélection
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Button
          variant="outline"
          className="w-full"
          onClick={() =>
            download(
              toCsv(
                shown.flatMap((s) => [[s.title], s.headers, ...s.rows, ['']]),
              ),
              'redacimg-rapport-complet.csv',
            )
          }
        >
          <Download /> Exporter tout le rapport
        </Button>
      </div>
    </>
  );
}

export function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE }) {
  return (
    <div className="bg-card/70 rounded-2xl border px-4 py-3">
      <Badge variant="secondary" className={`mb-1 ${TONE[tone]}`}>
        {value}
      </Badge>
      <p className="text-muted-foreground text-xs leading-tight">{label}</p>
    </div>
  );
}
