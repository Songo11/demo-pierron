import type { AppLocale } from '../../shared/core/config';
import {
  getInfoLocaleUi,
  loadAuthorWordBody,
  loadProjectInfoBody,
} from '../../shared/content/infoLocaleContent.ts';

import { en } from './en';
import { pl, type Translations } from './pl';

export type { Translations };
export { pl };

export const DEFAULT_LOCALE: AppLocale = 'pl';

/** All locales selectable in settings; pl/en are eager, others load on demand. */
const APP_LOCALES = [
  'pl',
  'en',
  'de',
  'es',
  'pt',
  'ru',
  'zh',
  'ja',
  'cs',
  'sq',
  'sr',
  'fa',
  'vi',
  'ms',
  'ar',
  'ro',
  'fr',
  'sv',
  'fi',
  'hu',
  'el',
  'bg',
  'tr',
  'hr',
  'no',
  'ko',
  'sk',
  'lt',
  'be',
  'et',
  'md',
  'it',
  'sw',
  'ta',
  'ha',
  'th',
  'tl',
  'nl',
  'id',
  'sl',
  'so',
  'hi',
  'ur',
  'az',
  'is',
  'ka',
  'ku',
] as const satisfies readonly AppLocale[];

/**
 * Lazy loaders for non-pl/en packs (shared with mobile).
 * Explicit map so webpack/turbopack can code-split without pulling all locales into the main graph.
 */
const LAZY_LOADERS: Partial<
  Record<AppLocale, () => Promise<Record<string, unknown>>>
> = {
  de: () => import('../../mobile/PierronMobile/src/i18n/de'),
  es: () => import('../../mobile/PierronMobile/src/i18n/es'),
  pt: () => import('../../mobile/PierronMobile/src/i18n/pt'),
  ru: () => import('../../mobile/PierronMobile/src/i18n/ru'),
  zh: () => import('../../mobile/PierronMobile/src/i18n/zh'),
  ja: () => import('../../mobile/PierronMobile/src/i18n/ja'),
  cs: () => import('../../mobile/PierronMobile/src/i18n/cs'),
  sq: () => import('../../mobile/PierronMobile/src/i18n/sq'),
  sr: () => import('../../mobile/PierronMobile/src/i18n/sr'),
  fa: () => import('../../mobile/PierronMobile/src/i18n/fa'),
  vi: () => import('../../mobile/PierronMobile/src/i18n/vi'),
  ms: () => import('../../mobile/PierronMobile/src/i18n/ms'),
  ar: () => import('../../mobile/PierronMobile/src/i18n/ar'),
  ro: () => import('../../mobile/PierronMobile/src/i18n/ro'),
  fr: () => import('../../mobile/PierronMobile/src/i18n/fr'),
  sv: () => import('../../mobile/PierronMobile/src/i18n/sv'),
  fi: () => import('../../mobile/PierronMobile/src/i18n/fi'),
  hu: () => import('../../mobile/PierronMobile/src/i18n/hu'),
  el: () => import('../../mobile/PierronMobile/src/i18n/el'),
  bg: () => import('../../mobile/PierronMobile/src/i18n/bg'),
  tr: () => import('../../mobile/PierronMobile/src/i18n/tr'),
  hr: () => import('../../mobile/PierronMobile/src/i18n/hr'),
  no: () => import('../../mobile/PierronMobile/src/i18n/no'),
  ko: () => import('../../mobile/PierronMobile/src/i18n/ko'),
  sk: () => import('../../mobile/PierronMobile/src/i18n/sk'),
  lt: () => import('../../mobile/PierronMobile/src/i18n/lt'),
  be: () => import('../../mobile/PierronMobile/src/i18n/be'),
  et: () => import('../../mobile/PierronMobile/src/i18n/et'),
  md: () => import('../../mobile/PierronMobile/src/i18n/md'),
  it: () => import('../../mobile/PierronMobile/src/i18n/it'),
  sw: () => import('../../mobile/PierronMobile/src/i18n/sw'),
  ta: () => import('../../mobile/PierronMobile/src/i18n/ta'),
  ha: () => import('../../mobile/PierronMobile/src/i18n/ha'),
  th: () => import('../../mobile/PierronMobile/src/i18n/th'),
  tl: () => import('../../mobile/PierronMobile/src/i18n/tl'),
  nl: () => import('../../mobile/PierronMobile/src/i18n/nl'),
  id: () => import('../../mobile/PierronMobile/src/i18n/id'),
  sl: () => import('../../mobile/PierronMobile/src/i18n/sl'),
  so: () => import('../../mobile/PierronMobile/src/i18n/so'),
  hi: () => import('../../mobile/PierronMobile/src/i18n/hi'),
  ur: () => import('../../mobile/PierronMobile/src/i18n/ur'),
  az: () => import('../../mobile/PierronMobile/src/i18n/az'),
  is: () => import('../../mobile/PierronMobile/src/i18n/is'),
  ka: () => import('../../mobile/PierronMobile/src/i18n/ka'),
  ku: () => import('../../mobile/PierronMobile/src/i18n/ku'),
};

const EAGER: Partial<Record<AppLocale, Translations>> = {
  pl,
  en,
};

const lazyCache = new Map<AppLocale, Translations>();
const inflight = new Map<AppLocale, Promise<Translations>>();

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Overlay locale pack on English so missing keys never crash UI at runtime. */
function mergeTranslations(base: Translations, overlay: Record<string, unknown>): Translations {
  const result: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  for (const key of Object.keys(overlay)) {
    const overVal = overlay[key];
    if (overVal === undefined) continue;
    const baseVal = result[key];
    if (isRecord(baseVal) && isRecord(overVal)) {
      result[key] = mergeTranslations(
        baseVal as Translations,
        overVal
      );
    } else {
      result[key] = overVal;
    }
  }
  return result as Translations;
}

function pickLocalePack(
  mod: Record<string, unknown>,
  locale: AppLocale
): Record<string, unknown> | null {
  const pack = mod[locale];
  if (isRecord(pack)) return pack;
  return null;
}

/** Force Info o projekcie / Słowo od autora from shared locale bodies + titles. */
async function withInfoLocaleContent(
  base: Translations,
  locale: AppLocale
): Promise<Translations> {
  const ui = getInfoLocaleUi(locale);
  const [projectInfoBody, authorWordBody] = await Promise.all([
    loadProjectInfoBody(locale),
    loadAuthorWordBody(locale),
  ]);
  return {
    ...base,
    settings: {
      ...base.settings,
      infoMenuTitle: ui.infoMenuTitle,
      infoMenuSubtitle: ui.infoMenuSubtitle,
      projectInfoTitle: ui.projectInfoTitle,
      authorWordTitle: ui.authorWordTitle,
      projectInfoBody,
      authorWordBody,
    },
  };
}

/** Sync translations — returns eager pl/en, cached lazy packs, or English fallback. */
export function getTranslations(locale: AppLocale): Translations {
  return EAGER[locale] ?? lazyCache.get(locale) ?? en;
}

/**
 * Async translations — dynamically imports mobile locale packs for non-pl/en.
 * Always overlays project-info / author-word bodies from shared/content (per locale).
 */
export async function loadTranslations(locale: AppLocale): Promise<Translations> {
  const cached = lazyCache.get(locale);
  if (cached) return cached;

  const pending = inflight.get(locale);
  if (pending) return pending;

  const promise = (async () => {
    try {
      let base: Translations = EAGER[locale] ?? en;

      if (locale !== 'pl' && locale !== 'en') {
        const loader = LAZY_LOADERS[locale];
        if (loader) {
          try {
            const mod = await loader();
            const pack = pickLocalePack(mod, locale);
            if (pack) base = mergeTranslations(en, pack);
          } catch {
            // Keep English UI strings; info bodies still applied below.
          }
        }
      }

      const merged = await withInfoLocaleContent(base, locale);
      lazyCache.set(locale, merged);
      return merged;
    } finally {
      inflight.delete(locale);
    }
  })();

  inflight.set(locale, promise);
  return promise;
}
