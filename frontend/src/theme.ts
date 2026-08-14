// Design tokens — Eayadati (عيادتي)
// Sage/Slate palette, generous iOS-native rhythms.
export const colors = {
  surface: '#FFFFFF',
  onSurface: '#1A211E',
  surfaceSecondary: '#F4F6F5',
  onSurfaceSecondary: '#384541',
  surfaceTertiary: '#E8ECEB',
  onSurfaceTertiary: '#4A5854',
  surfaceInverse: '#232B28',
  onSurfaceInverse: '#FFFFFF',
  brand: '#4A7065',
  brandDark: '#334F46',
  brandSecondary: '#E1E8E6',
  onBrandSecondary: '#334F46',
  brandTertiary: '#F0F4F2',
  onBrandTertiary: '#4A7065',
  success: '#3A6F54',
  warning: '#B58548',
  warningBg: '#FBEFDF',
  error: '#A84A42',
  errorBg: '#F7E4E2',
  info: '#4A5854',
  border: '#E1E8E6',
  borderStrong: '#B0C4BC',
  divider: '#E8ECEB',
  muted: '#6B7876',
  overlay: 'rgba(26, 33, 30, 0.5)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const font = { sm: 12, base: 14, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const fontFamily = {
  regular: 'Tajawal_400',
  medium: 'Tajawal_500',
  bold: 'Tajawal_700',
};

export const shadow = {
  card: {
    shadowColor: '#1A211E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

// Tooth condition color codes
export const toothColors: Record<string, string> = {
  healthy: '#FFFFFF',
  caries: '#A84A42',        // red — decay
  filling: '#4A7065',       // brand — filled
  crown: '#B58548',         // warning — crown
  extracted: '#6B7876',     // muted grey
  missing: '#B0C4BC',       // light grey
  rct: '#8B5CF6',           // treated (violet, allowed for status coding)
  implant: '#334F46',       // dark
};

export const toothLabels: Record<string, string> = {
  healthy: 'سليم',
  caries: 'تسوس',
  filling: 'حشوة',
  crown: 'تاج',
  extracted: 'مقلوع',
  missing: 'مفقود',
  rct: 'علاج عصب',
  implant: 'زرعة',
};
