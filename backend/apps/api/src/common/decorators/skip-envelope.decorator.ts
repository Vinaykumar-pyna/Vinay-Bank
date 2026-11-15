import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/**
 * Opt a handler out of the `{ success, data }` envelope, for example when it
 * streams a file or returns XML/HTML.
 */
export const SkipEnvelope = () => SetMetadata(SKIP_ENVELOPE_KEY, true);
