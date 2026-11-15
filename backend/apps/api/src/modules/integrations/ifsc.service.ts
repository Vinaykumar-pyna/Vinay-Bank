import { HttpService } from '@nestjs/axios';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { BANK_NAME } from '../../common/constants/app.constants';
import { findBranchByIfsc, isOwnIfsc } from '../../common/constants/branches';
import { AppException } from '../../common/exceptions/app.exception';
import { ErrorCode } from '../../common/exceptions/error-codes';
import { IFSC_PATTERN } from '../../common/validators/banking.validators';
import type { AppConfig } from '../../config/configuration';

export interface IfscDetails {
  ifsc: string;
  bank: string;
  branch: string;
  city?: string;
  state?: string;
  address?: string;
  rails: { imps: boolean; neft: boolean; rtgs: boolean; upi: boolean };
  /** LIVE: fetched now; CACHE: fetched earlier; INTERNAL: our own branch; OFFLINE: directory unreachable */
  source: 'LIVE' | 'CACHE' | 'INTERNAL' | 'OFFLINE';
}

interface RazorpayIfscResponse {
  BANK: string;
  BRANCH: string;
  CITY?: string;
  STATE?: string;
  ADDRESS?: string;
  IMPS?: boolean;
  NEFT?: boolean;
  RTGS?: boolean;
  UPI?: boolean;
}

/** Known bank codes, used to name the bank when the live directory is unreachable. */
const BANK_CODES: Record<string, string> = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  KKBK: 'Kotak Mahindra Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  IDIB: 'Indian Bank',
  BKID: 'Bank of India',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  IDFB: 'IDFC First Bank',
  FDRL: 'Federal Bank',
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2000;

/**
 * Resolves IFSC codes to bank and branch details using Razorpay's public IFSC
 * directory (an outside data source), with:
 *  - a timeout, so a slow third party cannot hang our requests
 *  - an in-memory cache (IFSC data rarely changes)
 *  - graceful degradation to a built-in bank list when the API is unavailable
 */
@Injectable()
export class IfscService {
  private readonly logger = new Logger(IfscService.name);
  private readonly cache = new Map<string, { value: IfscDetails; expiresAt: number }>();
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly http: HttpService,
    config: ConfigService<AppConfig, true>,
  ) {
    const integrations = config.get('integrations', { infer: true });
    this.baseUrl = integrations.ifscApiUrl.replace(/\/$/, '');
    this.timeoutMs = integrations.httpTimeoutMs;
  }

  async lookup(rawIfsc: string): Promise<IfscDetails> {
    const ifsc = rawIfsc.trim().toUpperCase();
    if (!IFSC_PATTERN.test(ifsc)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Enter a valid 11-character IFSC code');
    }

    if (isOwnIfsc(ifsc)) {
      const branch = findBranchByIfsc(ifsc);
      if (!branch) throw this.notFound();
      return {
        ifsc,
        bank: BANK_NAME,
        branch: branch.name,
        city: branch.city,
        state: branch.state,
        address: branch.address,
        rails: { imps: true, neft: true, rtgs: true, upi: true },
        source: 'INTERNAL',
      };
    }

    const cached = this.cache.get(ifsc);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.value, source: 'CACHE' };

    try {
      const response = await firstValueFrom(
        this.http.get<RazorpayIfscResponse>(`${this.baseUrl}/${encodeURIComponent(ifsc)}`, {
          timeout: this.timeoutMs,
        }),
      );
      const data = response.data;
      const details: IfscDetails = {
        ifsc,
        bank: data.BANK,
        branch: data.BRANCH,
        city: data.CITY,
        state: data.STATE,
        address: data.ADDRESS,
        rails: {
          imps: data.IMPS ?? true,
          neft: data.NEFT ?? true,
          rtgs: data.RTGS ?? true,
          upi: data.UPI ?? false,
        },
        source: 'LIVE',
      };
      this.remember(ifsc, details);
      return details;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 404) throw this.notFound();
      this.logger.warn(
        `IFSC directory unavailable (${(error as Error).message}); using offline data`,
      );
      const bank = BANK_CODES[ifsc.slice(0, 4)];
      if (!bank) {
        throw new AppException(
          ErrorCode.EXTERNAL_SERVICE_ERROR,
          'We could not verify this IFSC right now. Please try again in a few minutes.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      return {
        ifsc,
        bank,
        branch: 'Branch details unavailable',
        rails: { imps: true, neft: true, rtgs: true, upi: false },
        source: 'OFFLINE',
      };
    }
  }

  private remember(ifsc: string, details: IfscDetails): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      // Simple eviction of the oldest entry (Map preserves insertion order).
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(ifsc, { value: details, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private notFound(): AppException {
    return new AppException(
      ErrorCode.NOT_FOUND,
      'No bank branch found for this IFSC code',
      HttpStatus.NOT_FOUND,
    );
  }
}
