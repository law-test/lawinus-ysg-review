import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import officialCaseData from './official-cases.json' with {type:'json'};
import {mergeOfficialCases,officialCaseAssetUrl,validateOfficialCases} from './official-case-sources.ts';

const officialCases=validateOfficialCases(officialCaseData);

export type ReviewConfig = { supabaseUrl: string; supabasePublishableKey: string; storageBucket: string; datasetId: string };
export type ReviewNote = { id: string; datasetId: string; anchorType: string; page: number|null; noteId: string|null; sourceId: string|null; x: number|null; y: number|null; quote: string; text: string; visibility: 'private'|'shared'; status: 'open'|'resolved'; revision: number; displayName: string; createdAt: string; updatedAt: string; editable: boolean };
type NoteResult = { notes: ReviewNote[]; truncated: boolean };
type SessionResult = { user: { displayName: string; mode: 'guest'|'account' } };
let config: ReviewConfig | undefined;
let client: SupabaseClient | undefined;
let configPromise: Promise<ReviewConfig> | undefined;
let sessionPromise: Promise<SessionResult> | undefined;

export function validateReviewConfig(value: unknown): ReviewConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('사이트 연결 설정이 올바르지 않습니다.');
  const v = value as Record<string, unknown>;
  const url = typeof v.supabaseUrl === 'string' ? v.supabaseUrl.replace(/\/$/, '') : '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) throw new Error('Supabase 연결 주소를 설정해 주세요.');
  const key = typeof v.supabasePublishableKey === 'string' ? v.supabasePublishableKey : '';
  // A public browser may contain a publishable/legacy anon key, never a secret/service-role key.
  if (key.startsWith('sb_secret_')) throw new Error('비공개 서버 키를 브라우저에 설정할 수 없습니다.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon' || key.split('.').length !== 3) throw new Error();
    } catch { throw new Error('공개용 Supabase publishable 또는 anon 키를 설정해 주세요.'); }
  }
  const storageBucket = typeof v.storageBucket === 'string' ? v.storageBucket : 'ysg-review-documents';
  const datasetId = typeof v.datasetId === 'string' ? v.datasetId : 'ysg-20261023';
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(storageBucket) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(datasetId)) throw new Error('자료 저장소·기준본 식별자가 올바르지 않습니다.');
  return { supabaseUrl: url, supabasePublishableKey: key, storageBucket, datasetId };
}

export function loadReviewConfig(): Promise<ReviewConfig> {
  if (config) return Promise.resolve(config);
  return configPromise ??= (async () => {
    const response = await fetch(new URL('./config.json', document.baseURI), { cache: 'no-store' });
    if (!response.ok) throw new Error('사이트 연결 설정을 불러오지 못했습니다.');
    config = validateReviewConfig(await response.json());
    client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
        storageKey: `paper-review-${new URL(config.supabaseUrl).hostname}-${config.datasetId}` },
    });
    return config;
  })().catch(error => { config = undefined; configPromise = undefined; throw error; });
}

function connection() {
  if (!config || !client) throw new Error('사이트 연결 설정이 아직 준비되지 않았습니다.');
  return { config, client };
}

// Share the same anonymous visitor session with common-document editing.
// This does not create a second Supabase client or independent auth storage.
export async function getReviewConnection() {
  await loadReviewConfig();
  return connection();
}

function errorMessage(error: { message?: string; code?: string }): Error {
  if (error.code === 'PT409') return new Error('다른 화면에서 메모가 변경됐습니다. 새로 불러온 뒤 다시 수정해 주세요.');
  if (error.code === 'PT404') return new Error('수정할 수 있는 메모가 없습니다. 메모를 작성한 브라우저에서 다시 열어 주세요.');
  if (error.code === 'PT401' || error.code === 'PGRST301' || error.code === 'PGRST302') return new Error('메모 이용 정보가 만료됐습니다. 다시 연결한 뒤 저장해 주세요.');
  if (error.code === 'PT400' || error.code === 'PT413') return new Error(error.message || '입력 내용을 확인해 주세요.');
  return new Error('메모 저장소에 연결하지 못했습니다. 저장되지 않았으므로 잠시 뒤 다시 시도해 주세요.');
}

export function initializeReviewSession(): Promise<SessionResult> {
  return sessionPromise ??= (async (): Promise<SessionResult> => {
    await loadReviewConfig();
    const { client } = connection();
    const restore = await client.auth.getSession();
    if (restore.error) throw new Error('이 브라우저의 메모 이용 정보를 복원하지 못했습니다. 다시 연결해 주세요.');
    let session = restore.data.session;
    if (!session) {
      const signed = await client.auth.signInAnonymously();
      if (signed.error || !signed.data.session) throw new Error('메모 이용 정보를 만들지 못했습니다. 운영자가 Supabase 익명 로그인을 활성화했는지 확인해 주세요.');
      session = signed.data.session;
    }
    const user = session.user;
    return { user: { displayName: `방문자 ${user.id.replace(/-/g, '').slice(-6).toUpperCase()}`, mode: user.is_anonymous ? 'guest' : 'account' } };
  })().finally(() => { sessionPromise = undefined; });
}

export function assetUrl(id: string): string {
  const { config, client } = connection();
  const officialUrl=officialCaseAssetUrl(id,officialCases,document.baseURI);
  if(officialUrl)return officialUrl;
  let key: string;
  if (id === 'human' || id === 'thesis') key = 'human.pdf';
  else if (id === 'manifest' || id === 'profile') key = `${id}.json`;
  else if (/^s-[a-zA-Z0-9_-]{1,100}$/.test(id)) key = `assets/${id}`;
  else throw new Error('허용되지 않은 자료 식별자입니다.');
  return client.storage.from(config.storageBucket).getPublicUrl(`${config.datasetId}/${key}`).data.publicUrl;
}

async function publicJson(id: 'manifest'|'profile') {
  const r = await fetch(assetUrl(id), { cache: 'no-cache', credentials: 'omit' });
  if (!r.ok) throw new Error('자료가 아직 등록되지 않았거나 불러올 수 없습니다.');
  const value=await r.json();
  return id==='manifest'?mergeOfficialCases(value,officialCases,connection().config.datasetId):value;
}

function requestBody(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== 'string' || new TextEncoder().encode(init.body).length > 64000) throw new Error('메모 요청 내용이 올바르지 않거나 너무 큽니다.');
  let parsed: unknown;
  try { parsed = JSON.parse(init.body); } catch { throw new Error('메모 요청 내용을 확인해 주세요.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('메모 요청 내용을 확인해 주세요.');
  return parsed as Record<string, unknown>;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { client } = connection();
  const { data, error } = await client.rpc(name, args);
  if (error) throw errorMessage(error);
  if (data === null) throw new Error('메모 저장소에서 결과를 확인하지 못했습니다. 목록을 새로 불러와 주세요.');
  return data as T;
}

export async function api(path: string, init?: RequestInit): Promise<any> {
  await loadReviewConfig();
  const { config } = connection();
  const url = new URL(path, 'https://paper.invalid');
  if (url.origin !== 'https://paper.invalid') throw new Error('허용되지 않은 요청입니다.');
  const method = (init?.method || 'GET').toUpperCase();
  if (method === 'GET' && url.pathname === '/api/session') return initializeReviewSession();
  if (method === 'GET' && url.pathname === '/api/manifest') return publicJson('manifest');
  if (method === 'GET' && url.pathname === '/api/profile') return publicJson('profile');
  if (method === 'GET' && url.pathname === '/api/notes') {
    const status = url.searchParams.get('status');
    if (status !== null && status !== 'open' && status !== 'resolved') throw new Error('메모 상태가 올바르지 않습니다.');
    return rpc<NoteResult>('paper_review_list_notes', { p_dataset_id: config.datasetId, p_status: status, p_export: false });
  }
  if (method === 'POST' && url.pathname === '/api/notes') {
    const input = requestBody(init);
    await initializeReviewSession();
    return rpc('paper_review_create_note', { p_dataset_id: config.datasetId, p_input: input });
  }
  const match = /^\/api\/notes\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(url.pathname);
  if (match && (method === 'PATCH' || method === 'DELETE')) {
    const input = requestBody(init);
    await initializeReviewSession();
    return rpc(method === 'PATCH' ? 'paper_review_update_note' : 'paper_review_delete_note', {
      p_dataset_id: config.datasetId, p_id: match[1], p_input: input,
    });
  }
  throw new Error('지원하지 않는 요청입니다.');
}

export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\s\x00-\x1f]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function renderNotesExport(notes: ReviewNote[], format: 'md'|'csv'|'json', datasetId: string) {
  if (notes.length > 20000) throw new Error('한 번에 내보낼 수 있는 메모 수(20,000개)를 초과했습니다.');
  if (format === 'json') return { mime: 'application/json;charset=utf-8', text: JSON.stringify({ version: 2, datasetId, exportedAt: new Date().toISOString(), notes }, null, 2) };
  if (format === 'csv') {
    const fields = ['기준본', '메모ID', 'PDF쪽', '각주', '자료', '선택문', '메모', '작성자', '공유', '상태', '작성시각', '수정시각'];
    const rows = notes.map(n => [n.datasetId, n.id, n.page, n.noteId, n.sourceId, n.quote, n.text, n.displayName, n.visibility, n.status, n.createdAt, n.updatedAt]);
    return { mime: 'text/csv;charset=utf-8', text: '\ufeff' + [fields, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n') };
  }
  if (format !== 'md') throw new Error('지원하지 않는 내보내기 형식입니다.');
  const rows = notes.map(n => `## ${n.page ? `PDF ${n.page}쪽` : '전체'}${n.noteId ? ` · 각주 ${n.noteId}` : ''}\n\n기준본: ${n.datasetId} | 메모 ID: ${n.id}${n.sourceId ? ` | 자료: ${n.sourceId}` : ''}\n\n작성자: ${n.displayName.replace(/[\r\n]/g, ' ')} | ${n.visibility === 'private' ? '나만 보기' : '공유'} | ${n.status === 'resolved' ? '해결' : '미해결'}\n\n${n.quote ? n.quote.split('\n').map(line => '> ' + line).join('\n') + '\n\n' : ''}${n.text}\n\n---\n`);
  return { mime: 'text/markdown;charset=utf-8', text: '# 논문 검토 메모\n\n' + rows.join('\n') };
}

export type PreparedNotesExport = {
  url: string;
  fileName: string;
  mime: string;
  format: 'md'|'csv'|'json';
  count: number;
  dispose: () => void;
};

// Keep this URL alive while a visible download link is available. Preparing the
// file does not mean the browser has saved it; the user activates the link.
export function prepareNotesExport(notes: ReviewNote[], format: 'md'|'csv'|'json', datasetId: string): PreparedNotesExport {
  const output = renderNotesExport(notes, format, datasetId);
  const url = URL.createObjectURL(new Blob([output.text], { type: output.mime }));
  let disposed = false;
  return {
    url, fileName: `paper-review-${datasetId}.${format}`, mime: output.mime, format, count: notes.length,
    dispose() {
      if (disposed) return;
      disposed = true;
      URL.revokeObjectURL(url);
    },
  };
}

export async function exportNotes(format: 'md'|'csv'|'json'): Promise<PreparedNotesExport> {
  await loadReviewConfig();
  const { config } = connection();
  const result = await rpc<NoteResult>('paper_review_list_notes', { p_dataset_id: config.datasetId, p_status: null, p_export: true });
  if (result.truncated) throw new Error('메모 전체를 확보하지 못했으므로 내보내지 않았습니다.');
  return prepareNotesExport(result.notes, format, config.datasetId);
}
