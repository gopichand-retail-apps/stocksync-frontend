import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowRight, Boxes, CircleUserRound, ShieldCheck, Warehouse } from 'lucide-react';
import type { UserRole } from '../../api/client';
import { useContent } from '../../content-context';
import { dataString } from '../../content-schema';
import type { RoleOption } from './role-options';

const syntheticDemoPassword = 'stock-demo-only';

type LoginScreenProps = {
  isPending: boolean;
  error: string | null;
  connectionError: boolean;
  roleOptions: readonly RoleOption[];
  rolesPending: boolean;
  onLogin: (credentials: { email: string; password: string }) => void;
  onRetry: () => void;
};

export function LoginScreen({
  isPending,
  error,
  connectionError,
  roleOptions,
  rolesPending,
  onLogin,
  onRetry,
}: LoginScreenProps) {
  const { model, t } = useContent();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [emailOverride, setEmailOverride] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const selectedProfile = roleOptions.find((option) => option.role === selectedRole) ?? roleOptions[0] ?? null;
  const activeRole = selectedProfile?.role ?? null;
  const email = emailOverride ?? selectedProfile?.email ?? '';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin({ email: email.trim().toLowerCase(), password });
  }

  function selectProfile(option: RoleOption) {
    setSelectedRole(option.role);
    setEmailOverride(option.email);
    setPassword(syntheticDemoPassword);
  }

  return (
    <main className="login-page">
      <section className="login-visual" aria-label={t('login.visualLabel')}>
        <div className="login-brand">
          <span className="brand-mark">
            <Boxes size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>{t('app.name')}</strong>
            <span>{t('app.caption')}</span>
          </div>
        </div>
        <div className="login-message">
          <p className="page-eyebrow">{t('login.eyebrow')}</p>
          <h1>{t('login.title')}</h1>
          <p>{t('login.description')}</p>
          <div className="network-graphic" aria-label={t('login.networkLabel')}>
            <span className="network-node">
              <Warehouse size={20} aria-hidden="true" />
            </span>
            <span className="network-node">
              <Boxes size={20} aria-hidden="true" />
            </span>
            <span className="network-node">
              <ShieldCheck size={20} aria-hidden="true" />
            </span>
            <span className="network-caption">{t('login.receive')}</span>
            <span className="network-caption">{t('login.move')}</span>
            <span className="network-caption">{t('login.reconcile')}</span>
          </div>
        </div>
        <p className="login-footnote">{t('app.localDemo')}</p>
      </section>

      <section className="login-panel">
        <div className="login-form-wrap">
          <h2>{t('login.signIn')}</h2>
          <p>{t('login.chooseRole')}</p>
          <form onSubmit={handleSubmit}>
            <fieldset className="role-picker">
              <legend className="role-legend">{t('login.roleLegend')}</legend>
              <div className="role-options">
                {roleOptions.map((option) => (
                  <button
                    aria-label={t('login.profileButton', {
                      role: t(`login.role.${option.role}`),
                      summary: option.summary,
                    })}
                    aria-pressed={activeRole === option.role}
                    className="role-option"
                    key={option.role}
                    onClick={() => selectProfile(option)}
                    type="button"
                  >
                    <span>{t(`login.role.${option.role}`)}</span>
                    <small>{option.summary}</small>
                  </button>
                ))}
                {rolesPending && <p role="status">{t('login.rolesLoading')}</p>}
                {!rolesPending && roleOptions.length === 0 && <p role="status">{t('login.rolesUnavailable')}</p>}
              </div>
            </fieldset>
            <div className="login-fields">
              <div>
                <label className="field-label" htmlFor="login-email">
                  {t('login.email')}
                </label>
                <input
                  autoComplete="username"
                  className="login-field"
                  id="login-email"
                  onChange={(event) => setEmailOverride(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="login-password">
                  {t('login.password')}
                </label>
                <input
                  autoComplete="current-password"
                  className="login-field"
                  id="login-password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
            </div>
            {error && (
              <div className="login-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
            <button className="login-submit" disabled={isPending} type="submit">
              {isPending ? t('login.signingIn') : t('login.openWorkspace')}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </form>
          <div className="login-api-status" role={connectionError ? 'alert' : 'note'}>
            {connectionError ? (
              <>
                <strong>{t('login.connectionUnavailable', { port: dataString(model, 'api.port') })}</strong>{' '}
                <button className="inline-link" onClick={onRetry} type="button">
                  {t('login.retry')}
                </button>
              </>
            ) : (
              <>
                <CircleUserRound size={13} aria-hidden="true" /> {t('login.localAccess')}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
