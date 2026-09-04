import { useEffect, useState } from 'react';

export type ResizeMode = 'contain' | 'cover' | 'pad';
export type OutputFormat = 'tif' | 'jpg' | 'png' | 'webp';

export type Settings = {
  width: number;
  height: number;
  mode: ResizeMode;
  background: string;
  allowUpscale: boolean;
  format: OutputFormat;
  quality: number;        // JPEG / WebP, 1-100
  tiffDeflate: boolean;
  firstOnly: boolean;
};

export const DEFAULTS: Settings = {
  width: 850,
  height: 850,
  mode: 'cover',
  background: '#ffffff',
  allowUpscale: true,
  format: 'tif',
  quality: 90,
  tiffDeflate: true,
  firstOnly: false,
};

export const FORMAT_LABEL: Record<OutputFormat, string> = {
  tif: 'TIFF',
  jpg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
};

export const MODE_LABEL: Record<ResizeMode, string> = {
  pad: 'Ajouter des marges — toutes les images font exactement la taille demandée',
  contain: 'Contenir — pas de marges, la taille finale suit les proportions',
  cover: 'Recadrer — remplit le cadre, les bords qui dépassent sont coupés',
};

const KEY = 'redacimg.settings';

/** Réglages persistés : elle ne les ressaisit pas à chaque session. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      // Fusion avec les défauts : une version antérieure sans un champ reste lisible.
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    } catch {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* quota plein ou stockage bloqué : on continue sans persister */
    }
  }, [settings]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  return { settings, set, reset: () => setSettings(DEFAULTS) };
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('redacimg.theme', dark ? 'dark' : 'light');
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}
