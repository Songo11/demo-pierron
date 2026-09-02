/**
 * Tekst „Info o projekcie” (Ustawienia → Informacje).
 * WYŁĄCZNIE wartości MAINNET / produkcyjne — bez wzmianek o sieciach testowych.
 *
 * Pełne tłumaczenia: shared/content/projectInfoBodies/<locale>.ts
 */

import type { AppLocale } from '../../core/config.ts';
import { PROJECT_INFO_BODY as en } from './projectInfoBodies/en.ts';
import { PROJECT_INFO_BODY as pl } from './projectInfoBodies/pl.ts';
import { loadProjectInfoBody } from './infoLocaleContent.ts';

export const PROJECT_INFO_BODY_PL = pl;
export const PROJECT_INFO_BODY_EN = en;

/** Sync helper — only pl/en are eager; prefer `loadProjectInfoBody` for other locales. */
export function getProjectInfoBody(locale: AppLocale): string {
  return locale === 'pl' ? pl : en;
}

export { loadProjectInfoBody };
