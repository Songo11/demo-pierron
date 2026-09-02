/**
 * Tekst „Słowo od autora” (Ustawienia → Informacje).
 * Pełne tłumaczenia: shared/content/authorWordBodies/<locale>.ts
 */

import type { AppLocale } from '../../core/config.ts';
import { AUTHOR_WORD_BODY as en } from './authorWordBodies/en.ts';
import { AUTHOR_WORD_BODY as pl } from './authorWordBodies/pl.ts';
import { loadAuthorWordBody } from './infoLocaleContent.ts';

export const AUTHOR_WORD_BODY_PL = pl;
export const AUTHOR_WORD_BODY_EN = en;

/** Sync helper — only pl/en are eager; prefer `loadAuthorWordBody` for other locales. */
export function getAuthorWordBody(locale: AppLocale): string {
  return locale === 'pl' ? pl : en;
}

export { loadAuthorWordBody };
