import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validation';

const router = Router();

// Pairing request schema
const PairingRequestSchema = z.object({
  deviceInfo: z.object({
    platform: z.string(),
    version: z.string(),
    deviceId: z.string().optional(),
    deviceName: z.string().optional()
  })
});

/**
 * POST /pairing/connect
 * Connect a phone to the vault
 * - On first run: Initializes vault and allows pairing without authentication
 * - After initialization: Requires existing phone approval
 */
router.post('/connect',
  validateBody(PairingRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { deviceInfo } = req.body;
      
      // Check if this is first run
      if (req.vaultService!.isFirstRun()) {
        console.log('🎉 First phone pairing - initializing vault...');
        
        // Initialize vault with new master key
        await req.vaultService!.initializeOnFirstPairing();
        
        // Store device info (in a real app, you'd persist this)
        console.log('📱 Phone paired:', deviceInfo);
        
        res.json({
          success: true,
          message: 'Vault initialized and phone paired successfully!',
          firstRun: true,
          deviceInfo,
          instructions: [
            'Vault is now initialized with a new master key',
            'Your phone is now the primary authentication device',
            'Consider generating recovery codes for emergency access',
            'The vault will lock when the server restarts'
          ]
        });
        
      } else {
        // Vault already initialized - check if phone is connected
        if (!req.notificationService!.isConnected()) {
          // No phone connected, allow new pairing
          console.log('📱 Pairing new phone:', deviceInfo);
          
          res.json({
            success: true,
            message: 'Phone paired successfully',
            firstRun: false,
            deviceInfo
          });
          
        } else {
          // Phone already connected - require approval
          res.status(403).json({
            error: 'A phone is already connected',
            message: 'Disconnect the existing phone or get approval to pair a new device'
          });
        }
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /pairing/status
 * Check pairing status
 */
router.get('/status', (req: Request, res: Response) => {
  const isFirstRun = req.vaultService!.isFirstRun();
  const isInitialized = req.vaultService!.isInitialized();
  const phoneConnected = req.notificationService!.isConnected();
  
  res.json({
    firstRun: isFirstRun,
    initialized: isInitialized,
    phoneConnected,
    needsPairing: isFirstRun || !phoneConnected,
    status: isFirstRun ? 'awaiting_first_pairing' : 
            !phoneConnected ? 'awaiting_reconnection' :
            'ready'
  });
});

/**
 * POST /pairing/disconnect
 * Disconnect current phone (requires approval)
 */
router.post('/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check approval
    if (!req.vaultService!.isApproved()) {
      res.status(403).json({ 
        error: 'Approval required to disconnect phone' 
      });
      return;
    }
    
    // Disconnect phone
    req.notificationService!.disconnect();
    
    res.json({
      success: true,
      message: 'Phone disconnected successfully'
    });
    
  } catch (error) {
    next(error);
  }
});

export default router;