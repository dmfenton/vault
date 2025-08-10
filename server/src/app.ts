import express, { Application, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { IVaultService, INotificationService } from './types';
import secretsRouter from './routes/secrets';
import vaultRouter from './routes/vault';
import { createBootstrapRouter } from './routes/bootstrap';
import { errorHandler } from './middleware/errorHandler';
import { BootstrapService } from './services/BootstrapService';

export interface AppConfig {
  vaultService: IVaultService;
  notificationService: INotificationService;
  bootstrapService?: BootstrapService;
}

export function createApp({ vaultService, notificationService, bootstrapService }: AppConfig): Application {
  const app = express();
  
  // Middleware
  app.use(express.json({ limit: '1mb' }));
  
  // Attach services to request
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.vaultService = vaultService;
    req.notificationService = notificationService;
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
  
  // Apply rate limiting to /secrets routes
  app.use('/secrets', limiter);
  
  // Routes
  app.use('/secrets', secretsRouter);
  app.use('/', vaultRouter);
  
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