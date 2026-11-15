import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './configuration';

/** ConfigService bound to our AppConfig shape; `get('mongo', { infer: true })` is fully typed. */
export type TypedConfigService = ConfigService<AppConfig, true>;
