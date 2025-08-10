import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApprovalType, AuditEventType, AuditFilter } from '../types';

const router = Router();

// Health check
router.get('/health', (req: Request, res: Response) => {
  const vaultHealthy = req.vaultService!.isInitialized();
  const notificationHealthy = req.notificationService!.isConnected();
  const healthy = vaultHealthy && notificationHealthy;
  
  const status = {
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    vault: {
      initialized: vaultHealthy,
      secretCount: req.vaultService!.getSecretCount(),
      vaultSize: req.vaultService!.getVaultSize(),
      cacheSize: req.vaultService!.getCacheSize(),
      approved: req.vaultService!.isApproved(),
      approvalStatus: req.vaultService!.getApprovalStatus()
    },
    notification: {
      connected: notificationHealthy,
      queueSize: req.notificationService!.getQueueSize()
    }
  };
  
  res.status(healthy ? 200 : 503).json(status);
});

// Rotate encryption key
router.post('/rotate-key', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Request approval
    const approval = await req.notificationService!.requestApproval({
      type: ApprovalType.KEY_ROTATION,
      hostname: req.hostname,
      ipAddress: req.ip,
      metadata: {
        secretCount: req.vaultService!.getSecretCount(),
        vaultSize: req.vaultService!.getVaultSize(),
        timestamp: new Date().toISOString()
      }
    });
    
    if (!approval.approved) {
      res.status(403).json({ 
        error: 'Key rotation denied by user',
        reason: approval.reason 
      });
      return;
    }
    
    // Grant temporary approval for rotation
    req.vaultService!.grantApproval({ duration: 60 });
    
    await req.vaultService!.rotateKey();
    
    await req.notificationService!.sendSuccess(
      `Key rotation completed successfully for ${req.vaultService!.getSecretCount()} secrets`
    );
    
    res.json({ 
      message: 'Key rotation completed successfully',
      secretsRotated: req.vaultService!.getSecretCount(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    if (error instanceof Error) {
      await req.notificationService!.sendError(`Key rotation failed: ${error.message}`);
    }
    next(error);
  }
});

// Lock vault immediately
router.post('/lock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    req.vaultService!.revokeApproval();
    
    await req.notificationService!.sendInfo('Vault locked manually');
    
    res.json({ 
      message: 'Vault locked successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    next(error);
  }
});

// Get audit log
const AuditQuerySchema = z.object({
  from: z.string().optional().transform(val => val ? new Date(val) : undefined),
  to: z.string().optional().transform(val => val ? new Date(val) : undefined),
  page: z.string().optional().transform(val => val ? parseInt(val) : undefined),
  limit: z.string().optional().transform(val => val ? parseInt(val) : undefined),
  event: z.string().optional().transform(val => {
    if (!val) return undefined;
    // Validate it's a valid AuditEventType
    if (Object.values(AuditEventType).includes(val as AuditEventType)) {
      return val as AuditEventType;
    }
    throw new Error(`Invalid event type: ${val}`);
  }),
  key: z.string().optional(),
  success: z.string().optional().transform(val => val === 'true' ? true : val === 'false' ? false : undefined)
});

router.get('/audit',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate query params
      const parsed = AuditQuerySchema.parse(req.query);
      const filter: AuditFilter = parsed;
      const entries = req.vaultService!.getAuditLog(filter);
      
      res.json({
        entries,
        count: entries.length,
        query: parsed
      });
      
    } catch (error) {
      next(error);
    }
  }
);

// Export vault metadata
router.post('/export', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Request approval
    const approval = await req.notificationService!.requestApproval({
      type: ApprovalType.VAULT_EXPORT,
      hostname: req.hostname,
      ipAddress: req.ip,
      metadata: {
        timestamp: new Date().toISOString(),
        secretCount: req.vaultService!.getSecretCount()
      }
    });
    
    if (!approval.approved) {
      res.status(403).json({ 
        error: 'Export denied by user',
        reason: approval.reason 
      });
      return;
    }
    
    const exportData = {
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      secretCount: req.vaultService!.getSecretCount(),
      vaultSize: req.vaultService!.getVaultSize(),
      keys: req.vaultService!.listSecrets(),
      metadata: req.vaultService!.listSecrets().map(key => 
        req.vaultService!.getSecretMetadata(key)
      ).filter(Boolean)
    };
    
    await req.notificationService!.sendInfo(`Vault exported with ${exportData.secretCount} secrets`);
    
    res.json({ 
      message: 'Vault exported successfully',
      data: exportData 
    });
    
  } catch (error) {
    next(error);
  }
});

export default router;