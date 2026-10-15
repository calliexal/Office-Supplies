import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, isApiError, type LoginInput, type User } from '@/api';
import { setUnauthorizedHandler } from '@/api/session';
import { queryKeys } from '@/api/queries';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous'; user: null };

type AuthContextValue = AuthState & {
  login: (input: LoginInput) => Promise<User>;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const meQuery = useQuery<User | null>({
    queryKey: queryKeys.me,
    queryFn: async ({ signal }) => {
      try {
        return await api.auth.me({ signal });
      } catch (error) {
        if (isApiError(error) && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });

  const clearSession = useCallback(() => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] });
    queryClient.setQueryData<User | null>(queryKeys.me, null);
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      navigate('/login', { replace: true, state: { reason: 'expired' } });
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession, navigate]);

  const loginMutation = useMutation({
    mutationFn: api.auth.login,
    onSuccess: (user) => queryClient.setQueryData<User | null>(queryKeys.me, user),
  });

  const logoutMutation = useMutation({
    mutationFn: api.auth.logout,
    onSettled: () => {
      clearSession();
      navigate('/login', { replace: true });
    },
  });

  const value = useMemo<AuthContextValue>(() => {
    const user = meQuery.data ?? null;
    const state: AuthState =
      user !== null
        ? { status: 'authenticated', user }
        : meQuery.isPending
          ? { status: 'loading', user: null }
          : { status: 'anonymous', user: null };
    return {
      ...state,
      login: loginMutation.mutateAsync,
      logout: async () => {
        await logoutMutation.mutateAsync().catch(() => undefined);
      },
      isLoggingOut: logoutMutation.isPending,
    };
  }, [meQuery.data, meQuery.isPending, loginMutation.mutateAsync, logoutMutation]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};

export const useCurrentUser = (): User => {
  const auth = useAuth();
  if (auth.status !== 'authenticated') throw new Error('useCurrentUser used outside an authenticated route');
  return auth.user;
};
