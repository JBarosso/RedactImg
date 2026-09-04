import { Download, PartyPopper } from 'lucide-react';
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
};

const TONE = {
  bad: 'bg-destructive/15 text-destructive',
  warn: 'bg-secondary text-secondary-foreground',
  info: 'bg-accent text-accent-foreground',
} as const;

export function ReportPanel({ sections }: { sections: Section[] }) {
  const shown = sections.filter((s) => s.rows.length > 0);

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
    <div className="space-y-5">
      {shown.map((section) => (
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
          <CardContent>
            <div className="max-h-80 overflow-auto rounded-2xl border">
              <Table>
                <TableHeader className="bg-muted/60 sticky top-0">
                  <TableRow>
                    {section.headers.map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {section.rows.map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className={j === 0 ? 'font-medium' : ''}>
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

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
