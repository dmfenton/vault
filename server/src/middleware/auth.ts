import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Constant-time comparison of two strings that does not leak length via early
 * return beyond the unavoidable length check.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Creates an Express middleware that requires a valid bearer API token.
 *
 * The token must be supplied via the `Authorization: Bearer <token>` header
 * (or the `x-vault-token` header for convenience). Requests without a valid
 * token are rejected with 401 before reaching any vault logic.
 *
 * If `token` is empty the middleware fails closed (rejects everything) so that
 * a misconfigured deployment never silently exposes the vault.
 */
export function createAuthMiddleware(token: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!token) {
      res.status(503).json({
        error: 'Server auth token not configured',
        code: 'AUTH_NOT_CONFIGURED'
      });
      return;
    }

    const header = req.get('authorization') || '';
    const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const provided = bearer || req.get('x-vault-token') || '';

    if (!provided || !safeEqual(provided, token)) {
      res.status(401).json({
        error: 'Unauthorized',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    next();
  };
}

export { safeEqual };
