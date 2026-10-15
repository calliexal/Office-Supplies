import { createMockApi } from './mock/mockAdapter';
import { createSupabaseApi } from './supabase/adapter';
import type { AtkApi } from './types';

export const USING_MOCK_API = import.meta.env.VITE_USE_MOCK === 'true';

export const api: AtkApi = USING_MOCK_API ? createMockApi() : createSupabaseApi();

export * from './errors';
export * from './schemas';
export type { AtkApi } from './types';
