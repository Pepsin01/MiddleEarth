/** Talks to the server. Every function returns the parsed answer or throws an ApiError with a readable message. */
import type { Character, CollectionName, MapDef, Overlay, Place, Saga, SagaBundle, SagaSummary, SessionInfo, StoryEvent } from '../shared/schema.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  // Requests that change data must carry this header (see server/auth.ts).
  if (method !== 'GET') headers['X-Chronicle'] = '1';
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is it still running?');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data: unknown = isJson ? await res.json() : null;
  if (!res.ok) {
    const failure = (data ?? {}) as { error?: string; details?: string[] };
    throw new ApiError(res.status, failure.error ?? `The server answered with an error (${res.status}).`, failure.details);
  }
  return data as T;
}

const saga = (sagaId: string) => `/api/sagas/${encodeURIComponent(sagaId)}`;

type ItemOf = { places: Place; characters: Character; overlays: Overlay; events: StoryEvent };

export const api = {
  session: () => request<SessionInfo>('GET', '/api/session'),
  login: (password: string) => request<SessionInfo>('POST', '/api/login', { password }),
  logout: () => request<{ ok: true }>('POST', '/api/logout'),

  maps: () => request<MapDef[]>('GET', '/api/maps'),
  sagas: () => request<SagaSummary[]>('GET', '/api/sagas'),
  bundle: (sagaId: string) => request<SagaBundle>('GET', saga(sagaId)),

  createSaga: (input: Partial<Saga>) => request<Saga>('POST', '/api/sagas', input),
  saveSaga: (value: Saga) => request<Saga>('PUT', saga(value.id), value),

  create: <N extends CollectionName>(sagaId: string, collection: N, input: Partial<ItemOf[N]>, position?: number) =>
    request<ItemOf[N]>('POST', `${saga(sagaId)}/${collection}${position === undefined ? '' : `?position=${position}`}`, input),
  update: <N extends CollectionName>(sagaId: string, collection: N, id: string, input: Partial<ItemOf[N]>, position?: number) =>
    request<ItemOf[N]>('PUT', `${saga(sagaId)}/${collection}/${encodeURIComponent(id)}${position === undefined ? '' : `?position=${position}`}`, input),
  remove: (sagaId: string, collection: CollectionName, id: string, cascade = false) =>
    request<{ ok: true }>('DELETE', `${saga(sagaId)}/${collection}/${encodeURIComponent(id)}${cascade ? '?cascade=1' : ''}`),
  uploadPicture: (file: Blob, name: string) => {
    const form = new FormData();
    form.append('file', file, name);
    return request<{ file: string }>('POST', '/api/media/upload', form);
  },
  fetchPicture: (url: string) => request<{ file: string; source: string }>('POST', '/api/media/fetch', { url }),
  reorder: (sagaId: string, episodeId: string, ids: string[]) =>
    request<{ ok: true }>('PUT', `${saga(sagaId)}/episodes/${encodeURIComponent(episodeId)}/order`, { ids }),
};

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.details.length ? `${error.message}\n${error.details.join('\n')}` : error.message;
  return error instanceof Error ? error.message : String(error);
}
