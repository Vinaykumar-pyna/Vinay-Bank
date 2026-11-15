/** Domain events published by the auth module (consumed by notifications, accounts, ...). */
export const AuthEvents = {
  USER_REGISTERED: 'user.registered',
  LOGIN_SUCCEEDED: 'auth.login.succeeded',
  ACCOUNT_LOCKED: 'auth.account.locked',
  PASSWORD_CHANGED: 'auth.password.changed',
  MFA_CHANGED: 'auth.mfa.changed',
} as const;

export interface UserRegisteredEvent {
  userId: string;
}

export interface LoginSucceededEvent {
  userId: string;
  deviceLabel: string;
  ip?: string;
  at: Date;
}

export interface SecurityEvent {
  userId: string;
  at: Date;
  detail?: string;
}
