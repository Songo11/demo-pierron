import { STORAGE_KEYS } from '../../../shared/core/config';
import { loadJson, saveJson } from './webStorage';

const MAX_HISTORY_ITEMS = 50;

export type HistoryItem = {
  id: string;
  title: string;
  meta: string;
  time: string;
};

export async function loadHistory(): Promise<HistoryItem[]> {
  return loadJson<HistoryItem[]>(STORAGE_KEYS.history, []);
}

export async function addHistoryItem(
  title: string,
  meta: string
): Promise<HistoryItem[]> {
  const current = await loadHistory();

  const next: HistoryItem[] = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      meta,
      time: new Date().toLocaleString(),
    },
    ...current,
  ].slice(0, MAX_HISTORY_ITEMS);

  await saveJson(STORAGE_KEYS.history, next);
  return next;
}

export async function clearHistory(): Promise<void> {
  await saveJson(STORAGE_KEYS.history, []);
}
