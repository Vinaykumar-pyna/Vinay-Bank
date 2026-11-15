import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { AppConfig } from '../../config/configuration';

export interface ForexRate {
  currency: string;
  name: string;
  /** Units of the currency for one rupee */
  perRupee: number;
  /** Rupees for one unit of the currency */
  rupeesPerUnit: number;
}

export interface ForexRates {
  base: 'INR';
  /** Reference date published by the source (ECB working days) */
  date: string;
  /** LIVE: fetched now; CACHE: fetched earlier; OFFLINE: indicative fallback */
  source: 'LIVE' | 'CACHE' | 'OFFLINE';
  rates: ForexRate[];
}

interface FrankfurterResponse {
  base: string;
  date: string;
  rates: Record<string, number>;
}

const CURRENCIES: Record<string, string> = {
  USD: 'US dollar',
  EUR: 'Euro',
  GBP: 'British pound',
  AUD: 'Australian dollar',
  SGD: 'Singapore dollar',
  JPY: 'Japanese yen',
};

/** Indicative rupees per unit, used only when the live source is unreachable. */
const OFFLINE_RUPEES_PER_UNIT: Record<string, number> = {
  USD: 94.2,
  EUR: 104.2,
  GBP: 124.7,
  AUD: 55.4,
  SGD: 73.2,
  JPY: 0.59,
};

const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Reference exchange rates from the Frankfurter API (European Central Bank
 * data), cached for 30 minutes. If the API is down, the last good answer is
 * served, then indicative rates clearly marked OFFLINE: the page never breaks
 * because a third party is slow.
 */
@Injectable()
export class ForexService {
  private readonly logger = new Logger(ForexService.name);
  private cache?: { fetchedAt: number; rates: ForexRates };
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly http: HttpService,
    config: ConfigService<AppConfig, true>,
  ) {
    const integrations = config.get('integrations', { infer: true });
    this.baseUrl = integrations.forexApiUrl;
    this.timeoutMs = integrations.httpTimeoutMs;
  }

  async rates(): Promise<ForexRates> {
    if (this.cache && Date.now() - this.cache.fetchedAt < CACHE_TTL_MS) {
      return { ...this.cache.rates, source: 'CACHE' };
    }
    try {
      const { data } = await firstValueFrom(
        this.http.get<FrankfurterResponse>(`${this.baseUrl}/latest`, {
          params: { base: 'INR', symbols: Object.keys(CURRENCIES).join(',') },
          timeout: this.timeoutMs,
        }),
      );
      const rates: ForexRates = {
        base: 'INR',
        date: data.date,
        source: 'LIVE',
        rates: Object.entries(CURRENCIES)
          .filter(([code]) => typeof data.rates?.[code] === 'number' && data.rates[code] > 0)
          .map(([code, name]) => ({
            currency: code,
            name,
            perRupee: data.rates[code],
            rupeesPerUnit: Math.round((1 / data.rates[code]) * 10_000) / 10_000,
          })),
      };
      this.cache = { fetchedAt: Date.now(), rates };
      return rates;
    } catch (error) {
      this.logger.warn(`Exchange rates unavailable: ${(error as Error).message}`);
      if (this.cache) return { ...this.cache.rates, source: 'CACHE' };
      return {
        base: 'INR',
        date: new Date().toISOString().slice(0, 10),
        source: 'OFFLINE',
        rates: Object.entries(CURRENCIES).map(([code, name]) => ({
          currency: code,
          name,
          perRupee: Math.round((1 / OFFLINE_RUPEES_PER_UNIT[code]) * 1e6) / 1e6,
          rupeesPerUnit: OFFLINE_RUPEES_PER_UNIT[code],
        })),
      };
    }
  }
}
