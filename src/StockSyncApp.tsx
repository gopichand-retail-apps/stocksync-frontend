import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiClientError } from './api/client';
import { useContent } from './content-context';
import { isMock } from './config/mock-mode';
import { LoginScreen } from './features/auth/LoginScreen';
import { roleOptionsForCodes } from './features/auth/role-options';
import { AuthenticatedWorkspace } from './features/workspace/AuthenticatedWorkspace';

function errorMessage(error: unknown, translate: (key: string) => string, messages: Record<string, string>): string {
  if (error instanceof ApiClientError) {
    const key = `errors.${error.code}`;
    return Object.hasOwn(messages, key) ? translate(key) : translate('errors.requestFailed');
  }
  return translate('errors.requestFailed');
}

export function StockSyncApp() {
  const { model, t } = useContent();
  const dataMode = isMock ? 'mock' : 'live';
  useEffect(() => {
    document.documentElement.dataset.mode = dataMode;
    return () => {
      delete document.documentElement.dataset.mode;
    };
  }, [dataMode]);
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.getSession, retry: false, staleTime: 60_000 });
  const user = sessionQuery.data?.user ?? null;
  const syntheticRolesQuery = useQuery({
    queryKey: ['synthetic-roles'],
    queryFn: api.listSyntheticRoles,
    enabled: !user && !sessionQuery.isPending && !sessionQuery.error,
    retry: false,
    staleTime: 60_000,
  });
  const roleOptions = useMemo(
    () => (syntheticRolesQuery.data ? roleOptionsForCodes(model, syntheticRolesQuery.data) : []),
    [model, syntheticRolesQuery.data],
  );
  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.login(credentials.email, credentials.password),
    onSuccess: (session) => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      queryClient.setQueryData(['session'], session);
    },
  });

  if (sessionQuery.isPending && !sessionQuery.data) {
    return (
      <main className="boot-screen" role="status">
        {t('app.connecting')}
      </main>
    );
  }
  if (!user) {
    return (
      <LoginScreen
        connectionError={Boolean(sessionQuery.error || syntheticRolesQuery.error)}
        error={loginMutation.error ? errorMessage(loginMutation.error, t, model.messages) : null}
        isPending={loginMutation.isPending}
        roleOptions={roleOptions}
        rolesPending={syntheticRolesQuery.isPending && !sessionQuery.error}
        onLogin={(credentials) => loginMutation.mutate(credentials)}
        onRetry={() => {
          void sessionQuery.refetch();
          void syntheticRolesQuery.refetch();
        }}
      />
    );
  }

  return <AuthenticatedWorkspace user={user} />;
}
