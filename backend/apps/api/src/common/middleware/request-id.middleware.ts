import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export type RequestWithId = Request & { id?: string };

/**
 * First middleware in the chain: assigns a correlation id to every request,
 * reusing a well-formed incoming X-Request-Id (for example from nginx or another
 * service) and echoing it back. Registered before body parsing, so even early
 * failures such as malformed JSON carry a request id.
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
