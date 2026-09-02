import type { AppLocale } from '../../../../shared/core/config';

import { ar } from './ar';
import { az } from './az';
import { be } from './be';
import { bg } from './bg';
import { cs } from './cs';
import { de } from './de';
import { el } from './el';
import { en } from './en';
import { es } from './es';
import { et } from './et';
import { fa } from './fa';
import { fi } from './fi';
import { fr } from './fr';
import { hr } from './hr';
import { hu } from './hu';
import { is } from './is';
import { it } from './it';
import { ja } from './ja';
import { ka } from './ka';
import { ko } from './ko';
import { ku } from './ku';
import { lt } from './lt';
import { md } from './md';
import { ms } from './ms';
import { nl } from './nl';
import { id } from './id';
import { sl } from './sl';
import { so } from './so';
import { no } from './no';
import { pl } from './pl';
import { pt } from './pt';
import { ro } from './ro';
import { ru } from './ru';
import { sk } from './sk';
import { sq } from './sq';
import { sr } from './sr';
import { sv } from './sv';
import { sw } from './sw';
import { ta } from './ta';
import { ha } from './ha';
import { hi } from './hi';
import { ur } from './ur';
import { th } from './th';
import { tl } from './tl';
import { tr } from './tr';
import { vi } from './vi';
import { zh } from './zh';
import type { Translations } from './pl';

export type { Translations } from './pl';
export { pl };

const LOCALES: Record<AppLocale, Translations> = {
  pl,
  en,
  de,
  es,
  pt,
  ru,
  zh,
  ja,
  cs,
  sq,
  sr,
  fa,
  vi,
  ms,
  ar,
  ro,
  fr,
  sv,
  fi,
  hu,
  el,
  bg,
  tr,
  hr,
  no,
  ko,
  sk,
  lt,
  be,
  et,
  md,
  it,
  sw,
  ta,
  ha,
  th,
  tl,
  nl,
  id,
  sl,
  so,
  hi,
  ur,
  az,
  is,
  ka,
  ku,
};

export const DEFAULT_LOCALE: AppLocale = 'pl';

export function isAppLocale(value: string): value is AppLocale {
  return Object.prototype.hasOwnProperty.call(LOCALES, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Overlay locale pack on English so missing keys never crash UI at runtime. */
function mergeTranslations(base: Translations, overlay: Partial<Translations>): Translations {
  const result = { ...base };
  for (const key of Object.keys(overlay) as (keyof Translations)[]) {
    const overVal = overlay[key];
    if (overVal === undefined) continue;
    const baseVal = base[key];
    if (isRecord(baseVal) && isRecord(overVal)) {
      result[key] = mergeTranslations(
        baseVal as Translations,
        overVal as Partial<Translations>
      ) as Translations[keyof Translations];
    } else {
      result[key] = overVal as Translations[keyof Translations];
    }
  }
  return result;
}

/** `pl` / `en` are complete; other locales fall back to English for missing strings. */
export function getTranslations(locale: AppLocale): Translations {
  if (locale === 'pl') return pl;
  if (locale === 'en') return en;
  const pack = LOCALES[locale];
  return pack ? mergeTranslations(en, pack) : en;
}

export function formatMessage(
  template: string | undefined,
  vars: Record<string, string | number>
): string {
  if (typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`
  );
}

export function clusterLabel(
  t: Translations,
  cluster: import('../../../../shared/core/config').AppCluster
): string {
  const key =
    cluster === 'mainnet-beta'
      ? 'mainnetBeta'
      : (cluster as 'localnet' | 'devnet' | 'testnet');
  return t.clusters[key] ?? cluster;
}

export type LocaleOption = {
  code: AppLocale;
  flag: string;
  countryCode: string;
  name: string;
};

export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: 'pl', flag: '🇵🇱', countryCode: 'PL', name: 'Polski' },
  { code: 'zh', flag: '🇨🇳', countryCode: 'CN', name: '中文' },
  { code: 'ja', flag: '🇯🇵', countryCode: 'JP', name: '日本語' },
  { code: 'tr', flag: '🇹🇷', countryCode: 'TR', name: 'Türkçe' },
  { code: 'hu', flag: '🇭🇺', countryCode: 'HU', name: 'Magyar' },
  { code: 'fa', flag: '🇮🇷', countryCode: 'IR', name: 'فارسی' },
  { code: 'de', flag: '🇩🇪', countryCode: 'DE', name: 'Deutsch' },
  { code: 'ru', flag: '🇷🇺', countryCode: 'RU', name: 'Русский' },
  { code: 'en', flag: '🇬🇧', countryCode: 'GB', name: 'English' },
  { code: 'es', flag: '🇪🇸', countryCode: 'ES', name: 'Español' },
  { code: 'pt', flag: '🇵🇹', countryCode: 'PT', name: 'Português' },
  { code: 'cs', flag: '🇨🇿', countryCode: 'CZ', name: 'Čeština' },
  { code: 'sq', flag: '🇦🇱', countryCode: 'AL', name: 'Shqip' },
  { code: 'sr', flag: '🇷🇸', countryCode: 'RS', name: 'Srpski' },
  { code: 'vi', flag: '🇻🇳', countryCode: 'VN', name: 'Tiếng Việt' },
  { code: 'ms', flag: '🇲🇾', countryCode: 'MY', name: 'Bahasa Melayu' },
  { code: 'ar', flag: '🇸🇦', countryCode: 'SA', name: 'العربية' },
  { code: 'ro', flag: '🇷🇴', countryCode: 'RO', name: 'Română' },
  { code: 'fr', flag: '🇫🇷', countryCode: 'FR', name: 'Français' },
  { code: 'sv', flag: '🇸🇪', countryCode: 'SE', name: 'Svenska' },
  { code: 'fi', flag: '🇫🇮', countryCode: 'FI', name: 'Suomi' },
  { code: 'el', flag: '🇬🇷', countryCode: 'GR', name: 'Ελληνικά' },
  { code: 'bg', flag: '🇧🇬', countryCode: 'BG', name: 'Български' },
  { code: 'hr', flag: '🇭🇷', countryCode: 'HR', name: 'Hrvatski' },
  { code: 'no', flag: '🇳🇴', countryCode: 'NO', name: 'Norsk' },
  { code: 'ko', flag: '🇰🇷', countryCode: 'KR', name: '한국어' },
  { code: 'sk', flag: '🇸🇰', countryCode: 'SK', name: 'Slovenčina' },
  { code: 'lt', flag: '🇱🇹', countryCode: 'LT', name: 'Lietuvių' },
  { code: 'be', flag: '🇧🇾', countryCode: 'BY', name: 'Беларуская' },
  { code: 'et', flag: '🇪🇪', countryCode: 'EE', name: 'Eesti' },
  { code: 'md', flag: '🇲🇩', countryCode: 'MD', name: 'Moldovenească' },
  { code: 'it', flag: '🇮🇹', countryCode: 'IT', name: 'Italiano' },
  { code: 'sw', flag: '🇰🇪', countryCode: 'KE', name: 'Kiswahili' },
  { code: 'ta', flag: '🇮🇳', countryCode: 'IN', name: 'தமிழ்' },
  { code: 'ha', flag: '🇳🇬', countryCode: 'NG', name: 'Hausa' },
  { code: 'th', flag: '🇹🇭', countryCode: 'TH', name: 'ไทย' },
  { code: 'tl', flag: '🇵🇭', countryCode: 'PH', name: 'Tagalog' },
  { code: 'nl', flag: '🇳🇱', countryCode: 'NL', name: 'Nederlands' },
  { code: 'id', flag: '🇮🇩', countryCode: 'ID', name: 'Bahasa Indonesia' },
  { code: 'sl', flag: '🇸🇮', countryCode: 'SI', name: 'Slovenščina' },
  { code: 'so', flag: '🇸🇴', countryCode: 'SO', name: 'Soomaali' },
  { code: 'hi', flag: '🇮🇳', countryCode: 'IN', name: 'हिन्दी' },
  { code: 'ur', flag: '🇵🇰', countryCode: 'PK', name: 'اردو' },
  { code: 'az', flag: '🇦🇿', countryCode: 'AZ', name: 'Azərbaycanca' },
  { code: 'is', flag: '🇮🇸', countryCode: 'IS', name: 'Íslenska' },
  { code: 'ka', flag: '🇬🇪', countryCode: 'GE', name: 'ქართული' },
  { code: 'ku', flag: '🇮🇶', countryCode: 'IQ', name: 'Kurdî' },
];

function findLocaleOption(code: AppLocale): LocaleOption | undefined {
  return LOCALE_OPTIONS.find((item) => item.code === code);
}

export function localeLabel(code: AppLocale): string {
  const option = findLocaleOption(code);
  return option ? `${option.flag} ${option.name}` : code;
}

/** Flag emoji + ISO-style country code, e.g. "🇯🇵 JP". */
export function localeCountryBadge(code: AppLocale): string {
  const option = findLocaleOption(code);
  return option ? `${option.flag} ${option.countryCode}` : code.toUpperCase();
}
