export type CitedPage = {page: number; printed: string};
export type CitedTextSection = {printed: string; start: string; end: string | null};
export type CitationEntry = {pages: CitedPage[]; basis: string; textSections?: CitedTextSection[]};
export type CitationMap = Record<string, Record<string, CitationEntry>>;
type SourceRef = {sourceId: string; [key: string]: any};
type Source = {id: string; pages?: number; highlights?: any[]};

export function citedSourceRefs(note: {id: string; sourceRefs?: SourceRef[]}, map: CitationMap, sources: Source[]): SourceRef[] {
  const refs = [...(note.sourceRefs || [])];
  const known = new Set(sources.map(source => source.id));
  const linked = new Set(refs.map(ref => ref.sourceId));
  for (const sourceId of Object.keys(map[note.id] || {})) {
    if (known.has(sourceId) && !linked.has(sourceId)) {
      refs.push({sourceId}); linked.add(sourceId);
    }
  }
  return refs;
}

export function citedPages(entry?: CitationEntry, total?: number): CitedPage[] {
  const seen = new Set<number>();
  return (entry?.pages || []).filter(item => {
    if (!Number.isInteger(item.page) || item.page < 1 || (total && item.page > total) || seen.has(item.page)) return false;
    seen.add(item.page); return true;
  });
}

export function citationStartPage(entry?: CitationEntry, total?: number, fallback = 1): number {
  // An audited but unmapped citation must not inherit an old, unrelated locator.
  if (entry) return citedPages(entry, total)[0]?.page || 1;
  return Number.isInteger(fallback) && fallback > 0 && (!total || fallback <= total) ? fallback : 1;
}

export function citationHighlights(source: Source | undefined, noteId: string, entry?: CitationEntry) {
  const fullPages = citedPages(entry, source?.pages).map(item => ({page: item.page, kind: 'cited-page', printed: item.printed}));
  const exact = (source?.highlights || []).filter(item => item.noteIds?.includes(noteId)).flatMap(item =>
    (item.rects || []).filter((rect: number[]) => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isFinite) && rect[2] > rect[0] && rect[3] > rect[1])
      .map((rect: number[]) => ({page: item.page, rect, quote: item.quote, kind: 'exact-passage'})));
  return [...fullPages, ...exact];
}

export function citedPageLabel(printed: string): string {
  return /(?:면|쪽|\))$/.test(printed) ? printed : printed + '면';
}

export type CitedTextPart = {text: string; printed?: string; start: number};
export function citedTextParts(text: string, sections: CitedTextSection[] = []): CitedTextPart[] {
  const ranges = sections.flatMap(section => {
    const start = text.indexOf(section.start);
    if (start < 0 || start !== text.lastIndexOf(section.start)) return [];
    const end = section.end === null ? text.length : text.indexOf(section.end, start + section.start.length);
    if (end <= start) return [];
    return [{start, end, printed: section.printed}];
  }).sort((a, b) => a.start - b.start);
  const parts: CitedTextPart[] = []; let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) parts.push({text: text.slice(cursor, range.start), start: cursor});
    parts.push({text: text.slice(range.start, range.end), printed: range.printed, start: range.start});
    cursor = range.end;
  }
  if (cursor < text.length || !parts.length) parts.push({text: text.slice(cursor), start: cursor});
  return parts;
}
