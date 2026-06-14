import express, { Application, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { IVaultService, INotificationService } from './types';
import secretsRouter from './routes/secrets';
import vaultRouter from './routes/vault';
import pairingRouter from './routes/pairing';
import testRouter from './routes/test';
import notificationsRouter from './routes/notifications';
import { createBootstrapRouter } from './routes/bootstrap';
import { errorHandler } from './middleware/errorHandler';
import { createAuthMiddleware } from './middleware/auth';
import { BootstrapService } from './services/BootstrapService';
import { PushNotificationService } from './services/PushNotificationService';

export interface AppConfig {
  vaultService: IVaultService;
  notificationService: INotificationService;
  bootstrapService?: BootstrapService;
  pushService?: PushNotificationService;
  /** Bearer token required for all sensitive HTTP endpoints. */
  apiToken: string;
}

export function createApp({
  vaultService,
  notificationService,
  bootstrapService,
  pushService,
  apiToken
}: AppConfig): Application {
  const app = express();

  // Trust the first proxy hop so req.ip reflects the real client when behind a
  // reverse proxy/load balancer (also makes rate limiting per-client correct).
  app.set('trust proxy', 1);

  // Middleware
  app.use(express.json({ limit: '1mb' }));

  // Attach services to request
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.vaultService = vaultService;
    req.notificationService = notificationService;
    req.pushService = pushService;
    next();
  });

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per minute
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Authentication for sensitive endpoints
  const requireAuth = createAuthMiddleware(apiToken);

  // Global rate limiting (defence-in-depth against brute force / abuse)
  app.use(limiter);

  // Public routes (no API token):
  //  - /health is needed by monitoring before any token is provisioned
  //  - /pairing and /bootstrap are the first-run / recovery flows and are
  //    gated by their own one-time tokens instead of the API token.
  app.use('/pairing', pairingRouter);

  // Protected routes (require API token)
  app.use('/secrets', requireAuth, secretsRouter);
  app.use('/notifications', requireAuth, notificationsRouter);
  app.use('/rotate-key', requireAuth);
  app.use('/lock', requireAuth);
  app.use('/audit', requireAuth);
  app.use('/export', requireAuth);
  app.use('/', vaultRouter); // exposes public /health plus the protected paths above

  // Test routes: disabled by default. Require an explicit opt-in AND a
  // non-production environment so the approval bypass can never be reached
  // accidentally in a real deployment.
  if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_ROUTES === 'true') {
    app.use('/test', requireAuth, testRouter);
  }

  // Bootstrap routes (if service provided)
  if (bootstrapService) {
    const bootstrapRouter = createBootstrapRouter(bootstrapService);
    app.use('/bootstrap', bootstrapRouter);
  }
  
  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({ 
      error: 'Not found',
      path: req.path,
      method: req.method 
    });
  });
  
  // Error handler (must be last)
  app.use(errorHandler);
  
  return app;
}

export default createApp;