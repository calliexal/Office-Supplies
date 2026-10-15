import type { z } from 'zod';
import { ApiError } from './errors';
import { apiErrorBodySchema } from './schemas';
import { notifyUnauthorized } from './session';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
const TIMEOUT_MS = 15_000;
const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type Primitive = string | number | boolean;
export type QueryParams = Record<string, Primitive | null | undefined>;

type RequestOptions<S extends z.ZodTypeAny | undefined> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  schema?: S;
};

const readCookie = (name: string): string | null => {
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

const buildUrl = (path: string, query?: QueryParams) => {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
};

const linkAbortSignals = (external: AbortSignal | undefined, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
  const onExternalAbort = () => controller.abort(external?.reason);
  if (external?.aborted) onExternalAbort();
  external?.addEventListener('abort', onExternalAbort, { once: true });
  const cleanup = () => {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  };
  return { signal: controller.signal, cleanup };
};

const parseErrorResponse = async (response: Response): Promise<ApiError> => {
  const fallbackCode = response.status === 401 ? 'UNAUTHENTICATED' : response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR';
  try {
    const parsed = apiErrorBodySchema.safeParse(await response.json());
    if (parsed.success) {
      const { code, message, fields } = parsed.data.error;
      return new ApiError(response.status, code, message, fields);
    }
  } catch {
  }
  return new ApiError(response.status, fallbackCode, response.statusText || 'Request failed');
};

export async function request<S extends z.ZodTypeAny>(
  path: string,
  options: RequestOptions<S> & { schema: S },
): Promise<z.infer<S>>;
export async function request(path: string, options?: RequestOptions<undefined>): Promise<void>;
export async function request(path: string, options: RequestOptions<z.ZodTypeAny | undefined> = {}) {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (MUTATING.has(method)) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  const { signal, cleanup } = linkAbortSignals(options.signal, TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const isTimeout = error instanceof DOMException && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError';
    throw new ApiError(0, isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR', isTimeout ? 'Request timed out' : 'Network error');
  } finally {
    cleanup();
  }

  if (!response.ok) {
    const apiError = await parseErrorResponse(response);
    if (apiError.isUnauthenticated && !path.startsWith('/auth/')) notifyUnauthorized();
    throw apiError;
  }

  if (!options.schema || response.status === 204) return undefined;

  const json: unknown = await response.json().catch(() => {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'Response is not valid JSON');
  });
  const parsed = options.schema.safeParse(json);
  if (!parsed.success) {
    console.error(`[api] ${method} ${path} response did not match contract`, parsed.error.flatten());
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'Unexpected response from server');
  }
  return parsed.data;
}
