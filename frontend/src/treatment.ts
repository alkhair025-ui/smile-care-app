// Merge built-in tooth conditions with per-tenant custom treatment types.
import { colors, toothColors, toothLabels } from '@/src/theme';

export type TreatmentType = { key: string; label: string; color: string };

// Built-in condition keys shown by default (order preserved).
export const BUILTIN_CONDITIONS = ['healthy', 'caries', 'filling', 'crown', 'rct', 'extracted', 'implant', 'missing'];

// Built-in conditions that render with a dark background → need white text.
const DARK_BUILTIN = ['extracted', 'implant'];

export function buildTreatmentMaps(custom: TreatmentType[] = []) {
  const colorMap: Record<string, string> = { ...toothColors };
  const labelMap: Record<string, string> = { ...toothLabels };
  (custom || []).forEach((t) => {
    if (!t || !t.key) return;
    colorMap[t.key] = t.color;
    labelMap[t.key] = t.label;
  });
  const conditions = [...BUILTIN_CONDITIONS, ...(custom || []).map((t) => t.key)];
  return { colorMap, labelMap, conditions };
}

function isLightHex(hex: string) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

// Text color for a tooth cell — preserves existing built-in behavior exactly,
// and picks readable text for custom colors based on luminance.
export function toothTextColor(condition: string, color: string) {
  if (DARK_BUILTIN.includes(condition)) return '#fff';
  if (toothColors[condition]) return colors.onSurface; // other built-ins keep dark text
  return isLightHex(color) ? colors.onSurface : '#fff';
}
