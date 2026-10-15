import { Check, Eye, EyeOff } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { isApiError, toUserMessage, USING_MOCK_API } from '@/api';
import { MOCK_PASSWORD, mockUsers } from '@/api/mock/data';
import { figmaAssets } from '@/assets/figma';
import { useAuth } from '@/auth/AuthProvider';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';
import { SUPPORT_EMAIL } from '@/config';
import { cn } from '@/lib/cn';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your work email.').email('Enter a valid email address, e.g. name@company.com.'),
  password: z.string().min(1, 'Enter your password.'),
});
type Field = keyof z.infer<typeof loginSchema>;
type FieldErrors = Partial<Record<Field, string>>;

const validate = (values: Record<Field, string>): FieldErrors => {
  const result = loginSchema.safeParse(values);
  if (result.success) return {};
  const errors: FieldErrors = {};
  result.error.issues.forEach((issue) => {
    const key = issue.path[0] as Field;
    errors[key] ??= issue.message;
  });
  return errors;
};

const inputClass = (invalid: boolean) =>
  cn(
    'h-[57px] w-full rounded-[11px] border-3 bg-sky px-[21px] text-[15px] text-navy placeholder:text-navy/60 focus:outline-none focus:ring-2 focus:ring-brand/60',
    invalid ? 'border-danger' : 'border-navy',
  );

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';
  const sessionExpired = (location.state as { reason?: string } | null)?.reason === 'expired';

  const [values, setValues] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showResetHelp, setShowResetHelp] = useState(false);
  const ids = { email: useId(), password: useId(), emailError: useId(), passwordError: useId(), resetHelp: useId() };

  const errors = validate(values);
  const visibleError = (field: Field) => (touched[field] ? errors[field] : undefined);

  const onChange = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFormError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched({ email: true, password: true });
    if (Object.keys(errors).length > 0) {
      document.getElementById(errors.email ? ids.email : ids.password)?.focus();
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await login({ email: values.email, password: values.password, remember });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormError(
        isApiError(error) && error.code === 'INVALID_CREDENTIALS'
          ? 'That email and password combination didn’t match. Check both and try again.'
          : toUserMessage(error),
      );
      setValues((current) => ({ ...current, password: '' }));
      document.getElementById(ids.password)?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-sky">
      <img src={figmaAssets.loginWaveLeft} alt="" aria-hidden className="pointer-events-none absolute left-[-20.49%] top-[48.24%] w-[64.58%] max-w-none select-none" />
      <div aria-hidden className="pointer-events-none absolute left-[29.44%] top-[35.45%] flex aspect-[1239/1245] w-[86.06%] select-none items-center justify-center">
        <img src={figmaAssets.loginWaveRight} alt="" className="w-[75.05%] max-w-none -rotate-[47.26deg]" />
      </div>

      <header className="relative z-10 flex items-start justify-between px-6 pt-6 sm:px-[46px] sm:pt-11">
        <Logo size="md" />
        <span aria-hidden className="hidden size-[66px] place-items-center rounded-full bg-brand shadow-fab sm:grid">
          <img src={figmaAssets.iconPower} alt="" width={36} height={36} />
        </span>
      </header>

      <main className="relative z-10 flex justify-center px-4 pb-16 pt-10 sm:pt-[114px]">
        <form
          noValidate
          onSubmit={onSubmit}
          aria-labelledby="login-title"
          className="w-full max-w-[496px] rounded-[26px] bg-white px-6 pb-[41px] pt-[59px] sm:px-[25px]"
        >
          <h1 id="login-title" className="px-3 font-display text-[32px] font-bold text-navy">
            Log In
          </h1>
          <hr className="mt-2 border-navy/70" />

          {(sessionExpired || formError) && (
            <p role="alert" className="mx-[5px] mt-5 rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
              {formError ?? 'Your session has ended. Please log in again.'}
            </p>
          )}

          <div className="mt-[31px] space-y-[21px] px-[5px]">
            <div>
              <label htmlFor={ids.email} className="ml-4 block text-[15px] font-semibold text-navy">
                Email
              </label>
              <input
                id={ids.email}
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@company.com"
                value={values.email}
                onChange={(event) => onChange('email', event.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                aria-invalid={!!visibleError('email')}
                aria-describedby={visibleError('email') ? ids.emailError : undefined}
                className={cn('mt-2', inputClass(!!visibleError('email')))}
              />
              {visibleError('email') && (
                <p id={ids.emailError} className="ml-4 mt-1 text-xs text-danger">
                  {visibleError('email')}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={ids.password} className="ml-4 block text-[15px] font-semibold text-navy">
                Password
              </label>
              <div className="relative mt-2">
                <input
                  id={ids.password}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="*******"
                  value={values.password}
                  onChange={(event) => onChange('password', event.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                  aria-invalid={!!visibleError('password')}
                  aria-describedby={visibleError('password') ? ids.passwordError : undefined}
                  className={cn(inputClass(!!visibleError('password')), 'pr-14')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-navy hover:bg-navy/5"
                >
                  {showPassword ? <EyeOff className="size-6" aria-hidden /> : <Eye className="size-6" aria-hidden />}
                </button>
              </div>
              {visibleError('password') && (
                <p id={ids.passwordError} className="ml-4 mt-1 text-xs text-danger">
                  {visibleError('password')}
                </p>
              )}
            </div>
          </div>

          <div className="mt-[19px] flex items-center justify-between px-[21px]">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-navy">
              <span className="relative grid size-5 place-items-center">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="peer size-5 cursor-pointer appearance-none rounded-sm border border-navy bg-sky checked:bg-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
                <Check className="pointer-events-none absolute hidden size-4 text-white peer-checked:block" strokeWidth={3} aria-hidden />
              </span>
              Remember Me
            </label>
            {SUPPORT_EMAIL ? (
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Password%20reset`} className="text-xs font-medium text-sky-link hover:underline">
                Forgot Password?
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setShowResetHelp((value) => !value)}
                aria-expanded={showResetHelp}
                aria-controls={ids.resetHelp}
                className="text-xs font-medium text-sky-link hover:underline"
              >
                Forgot Password?
              </button>
            )}
          </div>
          {showResetHelp && (
            <p id={ids.resetHelp} className="mx-[21px] mt-2 text-xs text-ink-500">
              Ask your administrator to reset your password, then log in with the new one.
            </p>
          )}

          <div className="mt-9 px-0">
            <Button type="submit" size="lg" className="w-full font-semibold" loading={submitting}>
              Log In
            </Button>
          </div>

          {USING_MOCK_API && (
            <p className="mt-5 rounded-lg bg-sky px-4 py-3 text-xs text-ink-500">
              Demo mode: <span className="font-semibold text-navy">{mockUsers[0]?.email}</span> /{' '}
              <span className="font-semibold text-navy">{MOCK_PASSWORD}</span>
            </p>
          )}
        </form>
      </main>
    </div>
  );
};
