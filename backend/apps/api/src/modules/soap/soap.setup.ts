import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Router, type Request } from 'express';
import { listen } from 'soap';
import type { TypedConfigService } from '../../config/config.types';
import { bankingWsdl } from './banking.wsdl';
import { SoapBankingService } from './soap-banking.service';

export const SOAP_PATH = '/soap/banking';

/**
 * Mounts the SOAP endpoint on the underlying Express app. node-soap adds its
 * route only once the WSDL is parsed (asynchronously), so it is given its own
 * Router, mounted right away: that keeps it ahead of Nest's "route not found"
 * handler, which app.init() adds later.
 *   WSDL:     GET  /soap/banking?wsdl
 *   Requests: POST /soap/banking (SOAP 1.1, WS-Security UsernameToken)
 */
export function mountSoapServices(app: NestExpressApplication): void {
  const config = app.get<TypedConfigService>(ConfigService);
  const banking = app.get(SoapBankingService);
  const port = config.get('port', { infer: true });
  const location = `${config.get('soap', { infer: true }).publicUrl || `http://localhost:${port}`}${SOAP_PATH}`;

  // node-soap calls these with (args, callback, headers, req); returning a promise is supported.
  const services = {
    VinayBankService: {
      VinayBankPort: {
        GetAccountBalance: (args: Record<string, unknown>) => banking.getAccountBalance(args),
        GetMiniStatement: (args: Record<string, unknown>) => banking.getMiniStatement(args),
        ValidateIfsc: (args: Record<string, unknown>) => banking.validateIfsc(args),
      },
    },
  };

  const router = Router();
  app.use(router);
  const server = listen(router, {
    path: SOAP_PATH,
    services,
    xml: bankingWsdl(location),
  });
  server.authenticate = (security: unknown, _process: unknown, req?: unknown) =>
    banking.authenticate(
      security as Parameters<SoapBankingService['authenticate']>[0],
      (req as Request | undefined)?.ip,
    );
  new Logger('Soap').log(`SOAP service at ${location} (WSDL: ${location}?wsdl)`);
}
