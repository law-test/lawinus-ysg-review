export const TEXT_SIZE_OPTIONS = [100, 125, 150, 175, 200] as const;
export const DEFAULT_TEXT_SIZE = 150;
export const TEXT_SIZE_STORAGE_KEY = 'lawinus-paper-text-size';

export function normalizeTextSize(value: unknown): number {
  const size = typeof value === 'string' ? Number(value) : value;
  return typeof size === 'number' && TEXT_SIZE_OPTIONS.some(option => option === size)
    ? size : DEFAULT_TEXT_SIZE;
}

export function readTextSize(): number {
  try { return normalizeTextSize(localStorage.getItem(TEXT_SIZE_STORAGE_KEY)); }
  catch { return DEFAULT_TEXT_SIZE; }
}

export function applyTextSize(value: number, persist = true): number {
  const size = normalizeTextSize(value);
  document.documentElement.style.setProperty('--review-font-scale', String(size / 100));
  document.documentElement.dataset.textSize = String(size);
  if (persist) {
    try { localStorage.setItem(TEXT_SIZE_STORAGE_KEY, String(size)); }
    catch { /* The current view still changes when browser storage is unavailable. */ }
  }
  return size;
}
