import { ApiError, type ApiErrorCode } from '../errors';

export type PostgrestErrorLike = { code?: string; message: string; details?: string | null; hint?: string | null };
export type AuthErrorLike = { name?: string; message: string; status?: number; code?: string };

const SESSION_ENDED = 'Your session has ended. Please log in again.';

const CUSTOM_SQLSTATE: Record<string, [number, ApiErrorCode]> = {
  PT401: [401, 'UNAUTHENTICATED'],
  PT403: [403, 'FORBIDDEN'],
  PT404: [404, 'NOT_FOUND'],
  PT409: [409, 'INSUFFICIENT_STOCK'],
  PT422: [422, 'VALIDATION_FAILED'],
};

const isNetworkFailure = (message: string) => /failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(message);

export const parseFieldErrors = (details: string | null | undefined): Record<string, string> => {
  if (!details) return {};
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    }
  } catch {
  }
  return {};
};

export const postgrestToApiError = (error: PostgrestErrorLike, httpStatus: number): ApiError => {
  const code = error.code ?? '';
  const custom = CUSTOM_SQLSTATE[code];
  if (custom) return new ApiError(custom[0], custom[1], error.message, parseFieldErrors(error.details));

  if (httpStatus === 0 || isNetworkFailure(error.message)) return new ApiError(0, 'NETWORK_ERROR', 'Network error');
  if (httpStatus === 401 || code === 'PGRST301' || code === 'PGRST303') return new ApiError(401, 'UNAUTHENTICATED', SESSION_ENDED);
  if (httpStatus === 403 || code === '42501') return new ApiError(403, 'FORBIDDEN', "You don't have access to this.");
  if (code === '22P02' || code === 'PGRST116') return new ApiError(404, 'NOT_FOUND', 'This request no longer exists.');
  if (httpStatus === 429) return new ApiError(429, 'RATE_LIMITED', 'Too many requests');
  return new ApiError(httpStatus >= 400 ? httpStatus : 500, 'SERVER_ERROR', error.message || 'Unexpected server error');
};

export const authToApiError = (error: AuthErrorLike): ApiError => {
  const { code, status = 0, name = '', message } = error;
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }
  if (code === 'email_not_confirmed') {
    return new ApiError(403, 'EMAIL_NOT_CONFIRMED', "This account hasn't been activated yet. Contact General Affair.");
  }
  if (code === 'user_banned') {
    return new ApiError(403, 'ACCOUNT_LOCKED', 'This account has been disabled. Contact General Affair.');
  }
  if (status === 429 || code === 'over_request_rate_limit') {
    return new ApiError(429, 'RATE_LIMITED', 'Too many login attempts');
  }
  if (name === 'AuthRetryableFetchError' || isNetworkFailure(message)) return new ApiError(0, 'NETWORK_ERROR', 'Network error');
  if (code === 'session_not_found' || code === 'refresh_token_not_found' || status === 401) {
    return new ApiError(401, 'UNAUTHENTICATED', SESSION_ENDED);
  }
  return new ApiError(status >= 400 ? status : 500, 'SERVER_ERROR', message || 'Unexpected server error');
};
