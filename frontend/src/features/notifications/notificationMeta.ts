import type { NotificationType } from '@/features/banking/types';

export const NOTIFICATION_META: Record<NotificationType, { icon: string; tone: string }> = {
  TRANSACTION: { icon: 'bi-arrow-left-right', tone: 'primary' },
  SECURITY: { icon: 'bi-shield-lock', tone: 'warning' },
  OTP: { icon: 'bi-chat-dots', tone: 'info' },
  APPROVAL: { icon: 'bi-check2-square', tone: 'success' },
  ACCOUNT: { icon: 'bi-bank', tone: 'secondary' },
  SYSTEM: { icon: 'bi-info-circle', tone: 'secondary' },
};
