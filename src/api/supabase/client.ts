import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const AUTH_STORAGE_KEY = 'atk-auth';
const REMEMBER_FLAG_KEY = 'atk-auth-remember';

const attempt = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const isRemembered = () => attempt(() => window.localStorage.getItem(REMEMBER_FLAG_KEY) === '1', false);

const authStorage = {
  getItem: (key: string) => attempt(() => window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key), null),
  setItem: (key: string, value: string) =>
    attempt(() => {
      const [target, other] = isRemembered()
        ? [window.localStorage, window.sessionStorage]
        : [window.sessionStorage, window.localStorage];
      target.setItem(key, value);
      other.removeItem(key);
    }, undefined),
  removeItem: (key: string) =>
    attempt(() => {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }, undefined),
};

export const setRememberSession = (remember: boolean) =>
  attempt(() => {
    if (remember) window.localStorage.setItem(REMEMBER_FLAG_KEY, '1');
    else window.localStorage.removeItem(REMEMBER_FLAG_KEY);
  }, undefined);

const readConfig = () => {
  const url = import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env, or VITE_USE_MOCK=true.',
    );
  }
  if (key.startsWith('sb_secret_') || /service_role/.test(key)) {
    throw new Error('Refusing to start: a Supabase SECRET key was put in a public env variable. Use the publishable key.');
  }
  return { url, key };
};

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (client) return client;
  const { url, key } = readConfig();
  client = createClient(url, key, {
    auth: {
      storage: authStorage,
      storageKey: AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
};
