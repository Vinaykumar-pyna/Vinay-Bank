import type { ReactNode } from 'react';
import { Logo } from '@/components/common/Logo';
import { ThemeToggle } from '@/components/common/ThemeToggle';

const highlights = [
  ['bi-lightning-charge', 'Instant IMPS, NEFT and RTGS transfers'],
  ['bi-credit-card-2-front', 'Virtual debit cards with spending controls'],
  ['bi-bell', 'Real-time alerts for every rupee'],
];

/** Split layout for sign-in and registration: brand panel on large screens, form everywhere. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-wrapper">
      <aside className="auth-aside flex-column justify-content-between p-5">
        <Logo light size={36} />
        <div style={{ maxWidth: 460 }}>
          <h2 className="display-6 fw-bold mb-3">Banking built on trust.</h2>
          <p className="opacity-75 mb-4">
            One secure place for your accounts, payments and cards, protected by the same controls
            banks use internally.
          </p>
          <ul className="list-unstyled d-grid gap-3 mb-0">
            {highlights.map(([icon, text]) => (
              <li key={text} className="d-flex align-items-center gap-3">
                <span className="icon-tile" style={{ background: 'rgba(255,255,255,0.15)' }}>
                  <i className={`bi ${icon}`} aria-hidden="true" />
                </span>
                <span className="fw-medium">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="small opacity-75 mb-0">
          <i className="bi bi-shield-lock me-2" aria-hidden="true" />
          AES-256 encryption, two-factor sign-in and real-time fraud monitoring.
        </p>
      </aside>

      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <Logo className="d-lg-none" />
            <ThemeToggle className="ms-auto" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
