export type TocEntry = {
  id: string;
  title: string;
  page: number;
  printedPage: string | null;
  level: number;
  kind: string;
};

const normalized = (text: string) => text.replace(/\s+/g, '').toLocaleLowerCase();

export function visibleToc(entries: TocEntry[], query: string, detailed: boolean): TocEntry[] {
  const term = normalized(query);
  if (!term) return detailed ? entries : entries.filter(entry => entry.level <= 2);
  // Keep a matching heading's ancestors so repeated titles remain distinguishable.
  const included = new Set<string>();
  const ancestors: TocEntry[] = [];
  for (const entry of entries) {
    while (ancestors.length && ancestors[ancestors.length - 1].level >= entry.level) ancestors.pop();
    if (normalized(entry.title).includes(term)) {
      included.add(entry.id);
      ancestors.forEach(parent => included.add(parent.id));
    }
    ancestors.push(entry);
  }
  return entries.filter(entry => included.has(entry.id));
}

export function currentTocId(entries: TocEntry[], page: number, selectedId?: string): string | undefined {
  const selected = selectedId ? entries.find(entry => entry.id === selectedId) : undefined;
  if (selected?.page === page) return selected.id;
  let current: TocEntry | undefined;
  for (const entry of entries) {
    if (entry.page > page) break;
    current = entry;
  }
  return current?.id;
}
