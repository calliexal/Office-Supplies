import { describe, expect, it } from 'vitest';
import { authToApiError, parseFieldErrors, postgrestToApiError } from './errors';

describe('postgrestToApiError', () => {
  it('maps our custom SQLSTATEs and keeps per-item field errors', () => {
    const error = postgrestToApiError(
      { code: 'PT409', message: 'Only 11 pcs of A4 75gsm left.', details: '{"sup-a4":"Only 11 pcs of A4 75gsm left."}' },
      409,
    );
    expect(error).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK', message: 'Only 11 pcs of A4 75gsm left.' });
    expect(error.fields).toEqual({ 'sup-a4': 'Only 11 pcs of A4 75gsm left.' });
    expect(postgrestToApiError({ code: 'PT422', message: 'Add at least one item.' }, 422).code).toBe('VALIDATION_FAILED');
  });

  it('recognises expired sessions, permission errors, bad ids and network failures', () => {
    expect(postgrestToApiError({ code: 'PGRST301', message: 'JWT expired' }, 401).code).toBe('UNAUTHENTICATED');
    expect(postgrestToApiError({ code: '42501', message: 'permission denied' }, 403).code).toBe('FORBIDDEN');
    expect(postgrestToApiError({ code: '22P02', message: 'invalid input syntax for type uuid' }, 400).code).toBe('NOT_FOUND');
    expect(postgrestToApiError({ code: '', message: 'TypeError: Failed to fetch' }, 0).code).toBe('NETWORK_ERROR');
    expect(postgrestToApiError({ code: 'XX000', message: 'boom' }, 500)).toMatchObject({ status: 500, code: 'SERVER_ERROR' });
  });
});

describe('authToApiError', () => {
  it('never reveals which credential was wrong', () => {
    expect(authToApiError({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' })).toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'The email or password is incorrect.',
    });
  });

  it('maps unconfirmed, banned, rate-limited and offline cases', () => {
    expect(authToApiError({ code: 'email_not_confirmed', status: 400, message: 'Email not confirmed' }).code).toBe('EMAIL_NOT_CONFIRMED');
    expect(authToApiError({ code: 'user_banned', status: 400, message: 'User is banned' }).code).toBe('ACCOUNT_LOCKED');
    expect(authToApiError({ status: 429, message: 'Too many requests' }).code).toBe('RATE_LIMITED');
    expect(authToApiError({ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }).code).toBe('NETWORK_ERROR');
  });
});

describe('parseFieldErrors', () => {
  it('ignores free-text and non-string values', () => {
    expect(parseFieldErrors('not json')).toEqual({});
    expect(parseFieldErrors('{"a":"x","b":1}')).toEqual({ a: 'x' });
    expect(parseFieldErrors(null)).toEqual({});
  });
});
