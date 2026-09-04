import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileArchive,
  HardDriveDownload,
  Moon,
  Play,
  Sun,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dropzone } from '@/components/Dropzone';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ReportPanel, Stat, type Section } from '@/components/ReportPanel';
import { matchFiles, parseReferences, planOutputs } from '@/lib/matching.js';
import type { MatchedOn } from '@/lib/matching.js';
import { runBatch, type BatchFailure } from '@/lib/pool';
import { createWriter, hasFileSystemAccess } from '@/lib/output';
import type { Scanned } from '@/lib/scan';
import { useSettings, useTheme } from '@/lib/settings';

const MATCHED_ON: Record<MatchedOn, string> = {
  code: 'code interne',
  ean: 'EAN',
  both: 'code + EAN',
};

type RunResult = {
  written: number;
  failures: BatchFailure[];
  target: string;
  cancelled: boolean;
};

export default function App() {
  const { settings, set, reset } = useSettings();
  const { dark, toggle } = useTheme();
  const [files, setFiles] = useState<Scanned[]>([]);
  const [refsText, setRefsText] = useState('');
  const [tab, setTab] = useState('preparer');
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const abort = useRef<AbortController | null>(null);

  const parsed = useMemo(() => parseReferences(refsText), [refsText]);
  const match = useMemo(
    () => matchFiles(files, parsed.refs, { firstOnly: settings.firstOnly }),
    [files, parsed.refs, settings.firstOnly],
  );
  const plan = useMemo(
    () => planOutputs(match.tasks, { ext: settings.format }),
    [match.tasks, settings.format],
  );

  const running = progress !== null;
  const problems =
    match.missing.length + match.ambiguous.length + plan.collisions.length + parsed.invalid.length;

  const sections: Section[] = useMemo(
    () => [
      {
        id: 'introuvables',
        title: 'Références introuvables',
        hint: "Aucune image exploitable n'a été trouvée pour ces lignes.",
        tone: 'bad',
        headers: ['Code interne', 'EAN', 'Ligne', 'Cause'],
        rows: match.missing.map((m) => [
          m.ref.code ?? '',
          m.ref.ean ?? '',
          String(m.ref.line),
          m.onlyAmbiguous
            ? 'Des fichiers correspondaient, mais tous étaient ambigus'
            : 'Aucun fichier correspondant',
        ]),
      },
      {
        id: 'ambigues',
        title: 'Correspondances ambiguës',
        hint: 'Ces fichiers correspondent à plusieurs références. Ils ont été écartés du traitement.',
        tone: 'bad',
        headers: ['Fichier', 'Références concernées'],
        rows: match.ambiguous.map((a) => [
          a.file.path,
          a.refs.map((h) => `${h.ref.label} (${MATCHED_ON[h.matchedOn]})`).join('  +  '),
        ]),
      },
      {
        id: 'collisions-ean',
        title: 'Références partageant un même EAN',
        hint: "Elles produiraient le même fichier de sortie. Écartées pour ne rien écraser.",
        tone: 'bad',
        headers: ['EAN', 'Références', 'Fichiers concernés'],
        rows: plan.collisions.map((c) => [
          c.stem,
          c.refs.map((r) => `${r.label} (ligne ${r.line})`).join(', '),
          c.files.map((f) => f.path).join(', '),
        ]),
      },
      {
        id: 'echecs',
        title: 'Images en échec',
        hint: "Le fichier a bien été trouvé mais n'a pas pu être traité.",
        tone: 'bad',
        headers: ['Fichier source', 'Sortie prévue', 'Erreur'],
        rows: (result?.failures ?? []).map((f) => [f.source, f.name, f.error]),
      },
      {
        id: 'inutilisees',
        title: 'Images non utilisées',
        hint: "Présentes dans les dossiers, elles ne correspondent à aucune référence.",
        tone: 'warn',
        headers: ['Fichier'],
        rows: match.unused.map((f) => [f.path]),
      },
      {
        id: 'lignes',
        title: 'Lignes ignorées dans la liste',
        hint: 'Doublons et lignes sans identifiant exploitable.',
        tone: 'info',
        headers: ['Ligne', 'Contenu', 'Motif'],
        rows: [
          ...parsed.duplicates.map((d) => [
            String(d.line),
            d.raw,
            `Doublon de la ligne ${d.firstLine}`,
          ]),
          ...parsed.invalid.map((i) => [String(i.line), i.raw, i.reason]),
        ],
      },
      {
        id: 'sans-ean',
        title: 'Fichiers nommés sur le code interne',
        hint: "Ces lignes n'avaient pas d'EAN : la sortie porte le code interne à la place.",
        tone: 'info',
        headers: ['Fichier produit', 'Ligne', 'Source'],
        rows: plan.withoutEan.map((o) => [o.name, String(o.ref.line), o.file.path]),
      },
    ],
    [match, plan, parsed, result],
  );

  const start = async () => {
    let writer;
    try {
      writer = await createWriter();
    } catch {
      return; // sélecteur de dossier fermé par l'utilisateur
    }

    const controller = new AbortController();
    abort.current = controller;
    setResult(null);
    setProgress({ done: 0, total: plan.outputs.length, label: '' });
    setTab('rapport');

    const items = plan.outputs.map((o) => ({
      name: o.name,
      file: o.file.file as File,
      source: o.file.path,
    }));

    let written = 0;
    const failures = await runBatch(
      items,
      settings,
      {
        write: async (item, blob) => {
          await writer.write(item.name, blob);
          written += 1;
        },
        onProgress: (done, label) => setProgress({ done, total: items.length, label }),
      },
      controller.signal,
    );

    // Même après une annulation : ce qui est déjà encodé n'est pas jeté.
    await writer.finish();
    setProgress(null);
    setResult({ written, failures, target: writer.label, cancelled: controller.signal.aborted });
  };

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-4 pb-40 pt-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="./icon-192.png" alt="" className="size-12 rounded-2xl shadow-sm" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">RedacImg</h1>
            <p className="text-muted-foreground text-sm">
              Retrouve, redimensionne et exporte vos images produit.
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Changer de thème">
          {dark ? <Sun /> : <Moon />}
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 rounded-2xl">
          <TabsTrigger value="preparer" className="rounded-xl">Préparer</TabsTrigger>
          <TabsTrigger value="reglages" className="rounded-xl">Réglages</TabsTrigger>
          <TabsTrigger value="rapport" className="rounded-xl">
            Rapport{problems > 0 && ` (${problems})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preparer" className="space-y-5">
          <Dropzone
            files={files}
            images={match.tasks.length + match.unused.length + match.ambiguous.length}
            onAdd={(added) =>
              setFiles((current) => {
                const byPath = new Map(current.map((f) => [f.path, f]));
                for (const f of added) byPath.set(f.path, f);
                return [...byPath.values()];
              })
            }
            onClear={() => setFiles([])}
            disabled={running}
          />

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle>Liste des références</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={refsText}
                onChange={(e) => setRefsText(e.target.value)}
                disabled={running}
                spellCheck={false}
                rows={8}
                placeholder={'PRETJ5\t7040353498027\nPRETR3\t7040353500027'}
                className="max-h-72 overflow-y-auto rounded-2xl font-mono text-sm"
              />
              <p className="text-muted-foreground text-sm">
                Un produit par ligne : code interne et EAN, séparés par une tabulation ou des
                espaces. Collez directement depuis Excel.
              </p>
            </CardContent>
          </Card>

          {plan.outputs.length > 0 && (
            <Card className="rounded-3xl">
              <CardHeader>
                <CardTitle>Aperçu du lot — {plan.outputs.length} image(s)</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 font-mono text-sm">
                  {plan.outputs.slice(0, 6).map((o) => (
                    <li key={o.name} className="flex flex-wrap items-center gap-2">
                      <span className="text-primary font-semibold">{o.name}</span>
                      <span className="text-muted-foreground">← {o.file.path}</span>
                      <span className="bg-muted rounded-full px-2 py-0.5 text-xs">
                        {MATCHED_ON[o.matchedOn]}
                      </span>
                    </li>
                  ))}
                </ul>
                {plan.outputs.length > 6 && (
                  <p className="text-muted-foreground mt-2 text-sm">
                    … et {plan.outputs.length - 6} autre(s).
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reglages">
          <SettingsPanel settings={settings} set={set} reset={reset} />
        </TabsContent>

        <TabsContent value="rapport" className="space-y-5">
          {result && (
            <Card className="rounded-3xl">
              <CardContent className="flex flex-wrap items-center gap-3 py-5">
                {result.cancelled ? (
                  <AlertTriangle className="text-destructive size-6 shrink-0" />
                ) : (
                  <CheckCircle2 className="text-primary size-6 shrink-0" />
                )}
                <p className="font-medium">
                  {result.cancelled ? 'Lot annulé — ' : 'Terminé — '}
                  {result.written} image(s) écrite(s) dans {result.target}
                  {result.failures.length > 0 && `, ${result.failures.length} en échec`}.
                </p>
              </CardContent>
            </Card>
          )}
          <ReportPanel sections={sections} />
        </TabsContent>
      </Tabs>

      <div className="bg-background/85 fixed inset-x-0 bottom-0 border-t backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          {running ? (
            <>
              <div className="min-w-56 flex-1">
                <Progress value={(progress.done / Math.max(1, progress.total)) * 100} />
                <p className="text-muted-foreground mt-2 truncate text-sm">
                  {progress.done} / {progress.total} — {progress.label || 'démarrage…'}
                </p>
              </div>
              <Button variant="destructive" onClick={() => abort.current?.abort()}>
                <X /> Annuler
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-1 flex-wrap gap-2">
                <Stat label="images à traiter" value={plan.outputs.length} tone="info" />
                <Stat label="références lues" value={parsed.refs.length} tone="info" />
                <Stat label="points à vérifier" value={problems} tone={problems ? 'bad' : 'info'} />
              </div>
              <div className="flex items-center gap-3">
                {!hasFileSystemAccess && (
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <FileArchive className="size-4" /> Sortie en ZIP
                  </span>
                )}
                <Button size="lg" onClick={start} disabled={plan.outputs.length === 0}>
                  {hasFileSystemAccess ? <HardDriveDownload /> : <Play />}
                  Lancer le traitement
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
