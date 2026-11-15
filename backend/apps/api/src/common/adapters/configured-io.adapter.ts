import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that applies the same CORS allow-list as the REST API.
 * (Gateway decorators are evaluated before configuration is loaded, so the
 * origins are injected here instead.)
 */
export class ConfiguredIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly corsOrigins: string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigins, credentials: true },
      // Small, frequent pings keep idle connections alive through proxies such as nginx.
      pingInterval: 25_000,
      pingTimeout: 20_000,
    });
  }
}
