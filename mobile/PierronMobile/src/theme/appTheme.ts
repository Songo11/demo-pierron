/** Polish flag red (Pantone 186 C approx.) */
export const POLISH_FLAG_RED = '#DC143C';

export type AppColorScheme = 'dark' | 'light';

export type AppThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentOnAccent: string;
  accentSoft: string;
  tabBarBg: string;
  tabActive: string;
  tabInactive: string;
  success: string;
  warning: string;
  error: string;
  errorSoft: string;
  link: string;
  inputBg: string;
  inputBorder: string;
  switchTrackOff: string;
  switchTrackOn: string;
  primaryButtonBg: string;
  primaryButtonText: string;
  secondaryButtonBorder: string;
};

const DARK: AppThemeColors = {
  background: '#121212',
  surface: '#1b1b1b',
  surfaceAlt: '#141414',
  surfaceElevated: '#1f1f1f',
  border: '#2a2a2a',
  borderStrong: '#333333',
  text: '#ffffff',
  textSecondary: '#bdbdbd',
  textMuted: '#9ca3af',
  accent: '#FFD700',
  accentOnAccent: '#121212',
  accentSoft: '#333333',
  tabBarBg: '#121212',
  tabActive: '#FFD700',
  tabInactive: '#888888',
  success: '#4ade80',
  warning: '#ffb74d',
  error: '#fca5a5',
  errorSoft: '#ffb3b3',
  link: '#7dd3fc',
  inputBg: '#121212',
  inputBorder: '#333333',
  switchTrackOff: '#444444',
  switchTrackOn: '#FFD700',
  primaryButtonBg: '#FFD700',
  primaryButtonText: '#000000',
  secondaryButtonBorder: '#555555',
};

/** Light menu: white background + Polish flag red accents */
const LIGHT: AppThemeColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#FFF8F8',
  surfaceElevated: '#FFF5F5',
  border: '#E0B8C2',
  borderStrong: '#CF9DAA',
  text: '#1A1A1A',
  textSecondary: '#5C5C5C',
  textMuted: '#757575',
  accent: POLISH_FLAG_RED,
  accentOnAccent: '#FFFFFF',
  accentSoft: '#FFE8EC',
  tabBarBg: '#FFFFFF',
  tabActive: POLISH_FLAG_RED,
  tabInactive: '#888888',
  success: '#15803d',
  warning: '#c2410c',
  error: '#B91032',
  errorSoft: '#DC143C',
  link: '#DC143C',
  inputBg: '#FFFFFF',
  inputBorder: '#CF9DAA',
  switchTrackOff: '#E0E0E0',
  switchTrackOn: POLISH_FLAG_RED,
  primaryButtonBg: POLISH_FLAG_RED,
  primaryButtonText: '#FFFFFF',
  secondaryButtonBorder: '#DC143C',
};

export function getAppThemeColors(scheme: AppColorScheme): AppThemeColors {
  return scheme === 'light' ? LIGHT : DARK;
}

export function isAppColorScheme(value: unknown): value is AppColorScheme {
  return value === 'dark' || value === 'light';
}
