import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validation';
import { BootstrapService } from '../services/BootstrapService';

const router = Router();

// Bootstrap token validation schema
const BootstrapTokenSchema = z.object({
  token: z.string().min(1)
});

// Pairing request schema  
const PairingRequestSchema = z.object({
  token: z.string().min(1),
  deviceInfo: z.object({
    platform: z.string(),
    version: z.string(),
    deviceId: z.string().optional()
  }).optional()
});

/**
 * Initialize bootstrap routes with service
 */
export function createBootstrapRouter(bootstrapService: BootstrapService): Router {
  
  /**
   * Generate a pairing token for initial phone setup
   * This endpoint is only available when no phone is connected
   */
  router.post('/pairing-token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if a phone is already connected
      if (req.notificationService!.isConnected()) {
        res.status(400).json({ 
          error: 'A phone is already connected. Disconnect it first to pair a new device.' 
        });
        return;
      }
      
      const { token, expires } = await bootstrapService.generatePairingToken();
      
      res.json({
        message: 'Pairing token generated. Enter this in your mobile app.',
        token,
        expires: expires.toISOString(),
        expiresIn: '5 minutes'
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Pair a phone using a pairing token
   */
  router.post('/pair', 
    validateBody(PairingRequestSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { token, deviceInfo } = req.body;
        
        // Validate pairing token
        const isValid = await bootstrapService.validateToken(token, 'pairing');
        
        if (!isValid) {
          res.status(401).json({ 
            error: 'Invalid or expired pairing token' 
          });
          return;
        }
        
        // Register the device
        // In a real implementation, you'd store device info
        console.log('Device paired successfully:', deviceInfo);
        
        res.json({
          message: 'Device paired successfully',
          deviceInfo
        });
      } catch (error) {
        next(error);
      }
    }
  );
  
  /**
   * Unlock vault using startup token (for server restarts)
   */
  router.post('/unlock',
    validateBody(BootstrapTokenSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { token } = req.body;
        
        // Validate startup token
        const isValid = await bootstrapService.validateToken(token, 'startup');
        
        if (!isValid) {
          res.status(401).json({ 
            error: 'Invalid startup token' 
          });
          return;
        }
        
        // Grant temporary approval to unlock vault
        req.vaultService!.grantApproval({ duration: 300 }); // 5 minutes
        
        console.log('Vault unlocked via startup token');
        
        res.json({
          message: 'Vault unlocked successfully',
          duration: 300,
          note: 'You have 5 minutes to complete operations or connect your phone'
        });
      } catch (error) {
        next(error);
      }
    }
  );
  
  /**
   * Emergency access using recovery code
   */
  router.post('/recover',
    validateBody(BootstrapTokenSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { token } = req.body;
        
        // Validate recovery code
        const isValid = await bootstrapService.validateToken(token, 'recovery');
        
        if (!isValid) {
          res.status(401).json({ 
            error: 'Invalid or used recovery code' 
          });
          return;
        }
        
        // Grant extended approval for recovery operations
        req.vaultService!.grantApproval({ duration: 1800 }); // 30 minutes
        
        // Log this important security event
        console.warn('SECURITY: Vault accessed via recovery code');
        
        res.json({
          message: 'Recovery access granted',
          duration: 1800,
          warning: 'This recovery code has been consumed and cannot be used again',
          note: 'You have 30 minutes to complete recovery operations'
        });
      } catch (error) {
        next(error);
      }
    }
  );
  
  /**
   * Generate new recovery codes (requires approval)
   */
  router.post('/generate-recovery-codes', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // This requires vault approval
      if (!req.vaultService!.isApproved()) {
        res.status(403).json({ 
          error: 'Approval required to generate recovery codes' 
        });
        return;
      }
      
      const codes = await bootstrapService.generateRecoveryCodes();
      
      res.json({
        message: 'Recovery codes generated successfully',
        warning: 'SAVE THESE CODES IN A SECURE LOCATION! They will not be shown again.',
        codes,
        count: codes.length
      });
    } catch (error) {
      next(error);
    }
  });
  
  /**
   * Generate startup token for server restarts
   */
  router.post('/generate-startup-token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      // This requires vault approval
      if (!req.vaultService!.isApproved()) {
        res.status(403).json({ 
          error: 'Approval required to generate startup token' 
        });
        return;
      }
      
      const { token, path } = await bootstrapService.generateStartupToken();
      
      res.json({
        message: 'Startup token generated successfully',
        path,
        note: 'This token will persist across server restarts',
        usage: `curl -X POST http://localhost:3000/bootstrap/unlock -H "Content-Type: application/json" -d '{"token": "${token}"}'`
      });
    } catch (error) {
      next(error);
    }
  });
  
  return router;
}

export default createBootstrapRouter;