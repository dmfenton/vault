import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { 
  AddSecretSchema, 
  UpdateSecretSchema, 
  SecretKeySchema,
  ApprovalType 
} from '../types';
import { validateBody, validateParams } from '../middleware/validation';
import { NotFoundError } from '../middleware/errorHandler';

const router = Router();

// List all secrets
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secrets = req.vaultService!.listSecrets();
    res.json({
      secrets,
      count: secrets.length
    });
  } catch (error) {
    next(error);
  }
});

// Add new secret
router.post('/', 
  validateBody(AddSecretSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key, value } = req.body;
      await req.vaultService!.addSecret(key, value);
      
      res.status(201).json({ 
        message: 'Secret added successfully',
        key 
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Secret already exists') {
        res.status(409).json({ error: error.message });
      } else {
        next(error);
      }
    }
  }
);

// Get secret (requires approval)
router.get('/:key',
  validateParams(z.object({ key: SecretKeySchema })),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { key } = req.params;
      
      if (!req.vaultService!.hasSecret(key)) {
        throw new NotFoundError('Secret not found');
      }
      
      // Check if already approved
      if (!req.vaultService!.isApproved()) {
        // Request approval
        const approval = await req.notificationService!.requestApproval({
          type: ApprovalType.SECRET_ACCESS,
          secretKey: key,
          hostname: req.hostname,
          ipAddress: req.ip,
          metadata: {
            userAgent: req.get('user-agent'),
            timestamp: new Date().toISOString()
          }
        });
        
        if (!approval.approved) {
          res.status(403).json({ 
            error: 'Access denied by user',
            reason: approval.reason 
          });
          return;
        }
        
        // Grant approval to vault
        if (approval.oneTime) {
          req.vaultService!.grantApproval({ oneTime: true });
        } else {
          req.vaultService!.grantApproval({ duration: approval.duration });
        }
      }
      
      const value = await req.vaultService!.getSecret(key);
      res.json({ 
        key,
        value 
      });
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        res.status(408).json({ error: 'Request timeout' });
      } else {
        next(error);
      }
    }
  }
);

// Update secret
router.put('/:key',
  validateParams(z.object({ key: SecretKeySchema })),
  validateBody(UpdateSecretSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      
      if (!req.vaultService!.hasSecret(key)) {
        throw new NotFoundError('Secret not found');
      }
      
      await req.vaultService!.updateSecret(key, value);
      
      res.json({ 
        message: 'Secret updated successfully',
        key 
      });
      
    } catch (error) {
      next(error);
    }
  }
);

// Delete secret
router.delete('/:key',
  validateParams(z.object({ key: SecretKeySchema })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { key } = req.params;
      
      if (!req.vaultService!.hasSecret(key)) {
        throw new NotFoundError('Secret not found');
      }
      
      await req.vaultService!.deleteSecret(key);
      
      // Notify about deletion
      await req.notificationService!.sendInfo(`Secret '${key}' was deleted`);
      
      res.json({ 
        message: 'Secret deleted successfully',
        key 
      });
      
    } catch (error) {
      next(error);
    }
  }
);

export default router;