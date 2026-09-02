import type { AppCluster, AppLocale } from '../../../shared/core/config';
import type { Translations } from './pl';

export type LocaleOption = {
  code: AppLocale;
  flag: string;
  countryCode: string;
  name: string;
};

/** Ta sama lista co mobilka (Ustawienia → Języki). */
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

export function localeCountryBadge(code: AppLocale): string {
  const option = findLocaleOption(code);
  return option ? `${option.flag} ${option.countryCode}` : code.toUpperCase();
}

export function localeLabel(code: AppLocale): string {
  const option = findLocaleOption(code);
  return option ? `${option.flag} ${option.name}` : code;
}

export function clusterLabel(t: Translations, cluster: AppCluster): string {
  const key =
    cluster === 'mainnet-beta' ? 'mainnetBeta' : (cluster as 'localnet' | 'devnet' | 'testnet');
  return t.clusters[key] ?? cluster;
}
