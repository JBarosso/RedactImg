import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULTS,
  FORMAT_LABEL,
  MODE_LABEL,
  type OutputFormat,
  type ResizeMode,
  type Settings,
} from '@/lib/settings';

type Props = {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
};

export function SettingsPanel({ settings, set, reset }: Props) {
  const lossy = settings.format === 'jpg' || settings.format === 'webp';

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Dimensions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="w">Largeur (px)</Label>
              <Input
                id="w"
                type="number"
                min={1}
                max={20000}
                value={settings.width}
                onChange={(e) => set('width', clamp(e.target.value, DEFAULTS.width))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="h">Hauteur (px)</Label>
              <Input
                id="h"
                type="number"
                min={1}
                max={20000}
                value={settings.height}
                onChange={(e) => set('height', clamp(e.target.value, DEFAULTS.height))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mode de redimensionnement</Label>
            <Select value={settings.mode} onValueChange={(v) => set('mode', v as ResizeMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABEL) as ResizeMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {MODE_LABEL[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bg">Couleur de fond</Label>
            <div className="flex items-center gap-3">
              <input
                id="bg"
                type="color"
                value={settings.background}
                onChange={(e) => set('background', e.target.value)}
                className="border-input size-10 cursor-pointer rounded-[8px] border bg-transparent p-1"
              />
              <span className="text-muted-foreground text-sm">
                Utilisée pour les marges, et pour aplatir les PNG transparents.
              </span>
            </div>
          </div>

          <Toggle
            label="Autoriser l'agrandissement"
            hint="Une image plus petite que la cible sera étirée. Désactivé, elle garde sa taille."
            checked={settings.allowUpscale}
            onChange={(v) => set('allowUpscale', v)}
          />
        </CardContent>
      </Card>

      <Card className="rounded-3xl">
        <CardHeader>
          <CardTitle>Sortie</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Format</Label>
            <Select value={settings.format} onValueChange={(v) => set('format', v as OutputFormat)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(FORMAT_LABEL) as OutputFormat[]).map((format) => (
                  <SelectItem key={format} value={format}>
                    {FORMAT_LABEL[format]}
                    {format === 'tif' && ' — par défaut'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {lossy && (
            <div className="space-y-2">
              <Label htmlFor="q">Qualité {FORMAT_LABEL[settings.format]} : {settings.quality}</Label>
              <input
                id="q"
                type="range"
                min={40}
                max={100}
                value={settings.quality}
                onChange={(e) => set('quality', Number(e.target.value))}
                className="accent-primary w-full"
              />
            </div>
          )}

          {settings.format === 'tif' && (
            <Toggle
              label="Compression Deflate"
              hint="Sans perte. Désactivez pour un TIFF brut, lisible partout mais bien plus lourd."
              checked={settings.tiffDeflate}
              onChange={(v) => set('tiffDeflate', v)}
            />
          )}

          <Toggle
            label="Une seule image par référence"
            hint="Quand plusieurs fichiers correspondent, ne traiter que le premier."
            checked={settings.firstOnly}
            onChange={(v) => set('firstOnly', v)}
          />

          <Button variant="ghost" onClick={reset} className="w-full">
            <RotateCcw /> Réinitialiser les réglages
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="bg-muted/50 flex items-start justify-between gap-4 rounded-2xl p-4">
      <div className="space-y-1">
        <Label>{label}</Label>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/** Un champ vidé ne doit pas produire NaN puis une image de 0 pixel. */
function clamp(value: string, fallback: number) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20000) : fallback;
}
