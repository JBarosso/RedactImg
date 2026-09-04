export type Ref = {
  line: number;
  raw: string;
  code: string | null;
  ean: string | null;
  label: string;
  warnings: string[];
};

export type ScannedFile = { path: string; file?: File };
export type MatchedOn = 'code' | 'ean' | 'both';

export type ParseResult = {
  refs: Ref[];
  invalid: { line: number; raw: string; reason: string }[];
  duplicates: { line: number; raw: string; firstLine: number }[];
};

export type Task<F extends ScannedFile = ScannedFile> = {
  ref: Ref;
  file: F;
  matchedOn: MatchedOn;
};

export type MatchResult<F extends ScannedFile = ScannedFile> = {
  tasks: Task<F>[];
  missing: { ref: Ref; onlyAmbiguous: boolean }[];
  unused: F[];
  ambiguous: { file: F; refs: { ref: Ref; matchedOn: MatchedOn }[] }[];
  ignored: (F & { reason: string })[];
};

export type PlannedOutput<F extends ScannedFile = ScannedFile> = Task<F> & {
  name: string;
  namedFromEan: boolean;
};

export type OutputPlan<F extends ScannedFile = ScannedFile> = {
  outputs: PlannedOutput<F>[];
  collisions: { stem: string; refs: Ref[]; files: F[] }[];
  withoutEan: PlannedOutput<F>[];
};

export function normalize(s: string): string;
export function normalizeId(id: string): string;
export function tokenize(name: string): string[];
export function splitPath(path: string): { dir: string; base: string; ext: string };
export function parseReferences(text: string): ParseResult;
export function matchFiles<F extends ScannedFile>(
  files: F[],
  refs: Ref[],
  opts?: { firstOnly?: boolean },
): MatchResult<F>;
export function planOutputs<F extends ScannedFile>(
  tasks: Task<F>[],
  opts?: { ext?: string },
): OutputPlan<F>;
