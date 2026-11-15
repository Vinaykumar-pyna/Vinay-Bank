/**
 * Turns a User-Agent header into a short, human-readable device label for the
 * "active sessions" list and login alerts, e.g. "Chrome on Windows".
 */
export function describeUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown device';
  const ua = userAgent;

  const browser =
    (/Edg\//.test(ua) && 'Edge') ||
    (/OPR\/|Opera/.test(ua) && 'Opera') ||
    (/SamsungBrowser\//.test(ua) && 'Samsung Internet') ||
    (/Firefox\//.test(ua) && 'Firefox') ||
    (/Chrome\//.test(ua) && 'Chrome') ||
    (/Safari\//.test(ua) && /Version\//.test(ua) && 'Safari') ||
    (/PostmanRuntime/.test(ua) && 'Postman') ||
    (/curl\//.test(ua) && 'curl') ||
    (/node|undici|axios/i.test(ua) && 'API client') ||
    'Browser';

  const os =
    (/Windows NT/.test(ua) && 'Windows') ||
    (/Android/.test(ua) && 'Android') ||
    (/iPhone|iPad|iPod/.test(ua) && 'iOS') ||
    (/Mac OS X|Macintosh/.test(ua) && 'macOS') ||
    (/CrOS/.test(ua) && 'ChromeOS') ||
    (/Linux/.test(ua) && 'Linux') ||
    null;

  return os ? `${browser} on ${os}` : browser;
}
