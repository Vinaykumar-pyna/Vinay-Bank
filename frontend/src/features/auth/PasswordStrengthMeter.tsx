import { ProgressBar } from 'react-bootstrap';
import { passwordStrength } from '@/lib/validation';

export function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = passwordStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2" aria-live="polite">
      <ProgressBar
        now={(strength.score + 1) * 20}
        variant={strength.variant}
        style={{ height: 6 }}
        aria-label="Password strength"
      />
      <div className={`small mt-1 text-${strength.variant}-emphasis`}>
        Password strength: {strength.label}
      </div>
    </div>
  );
}
