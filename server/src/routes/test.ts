import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validation';

const router = Router();

// Schema for test approval
const TestApprovalSchema = z.object({
  duration: z.number().min(1).max(3600).optional().default(300),
  oneTime: z.boolean().optional().default(false)
});

/**
 * Test/Debug endpoints - only enabled in development mode
 * These allow testing the full flow with curl
 */

/**
 * GET /test/pending-approvals
 * Get any pending approval requests
 */
router.get('/pending-approvals', (req: Request, res: Response) => {
  // In a real implementation, we'd track pending requests
  // For now, we'll check the notification service queue
  const notificationService = req.notificationService!;
  
  res.json({
    message: 'Check notification service for pending approvals',
    connected: notificationService.isConnected(),
    queueSize: notificationService.getQueueSize()
  });
});

/**
 * POST /test/grant-approval
 * Directly grant approval to the vault (bypasses phone requirement)
 * ONLY FOR TESTING - should be disabled in production
 */
router.post('/grant-approval',
  validateBody(TestApprovalSchema),
  (req: Request, res: Response) => {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ 
        error: 'Test endpoints are disabled in production' 
      });
      return;
    }
    
    const { duration, oneTime } = req.body;
    
    // Grant approval directly
    req.vaultService!.grantApproval({ duration, oneTime });
    
    res.json({
      success: true,
      message: 'Approval granted for testing',
      duration: oneTime ? 'one-time' : `${duration} seconds`,
      approvalStatus: req.vaultService!.getApprovalStatus()
    });
  }
);

/**
 * POST /test/revoke-approval
 * Revoke any existing approval
 */
router.post('/revoke-approval', (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ 
      error: 'Test endpoints are disabled in production' 
    });
    return;
  }
  
  req.vaultService!.revokeApproval();
  
  res.json({
    success: true,
    message: 'Approval revoked',
    approvalStatus: req.vaultService!.getApprovalStatus()
  });
});

/**
 * POST /test/simulate-phone
 * Simulate a phone connection and approval
 */
router.post('/simulate-phone', async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ 
      error: 'Test endpoints are disabled in production' 
    });
    return;
  }
  
  try {
    // Mark notification service as connected
    (req.notificationService as any).connected = true;
    
    res.json({
      success: true,
      message: 'Phone simulation active',
      note: 'Use /test/grant-approval to approve requests'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /test/status
 * Get complete system status for testing
 */
router.get('/status', (req: Request, res: Response) => {
  const vaultService = req.vaultService!;
  const notificationService = req.notificationService!;
  
  res.json({
    environment: process.env.NODE_ENV || 'development',
    vault: {
      initialized: vaultService.isInitialized(),
      firstRun: vaultService.isFirstRun(),
      approved: vaultService.isApproved(),
      approvalStatus: vaultService.getApprovalStatus(),
      secretCount: vaultService.getSecretCount(),
      cacheSize: vaultService.getCacheSize()
    },
    notification: {
      connected: notificationService.isConnected(),
      queueSize: notificationService.getQueueSize()
    },
    testEndpoints: process.env.NODE_ENV !== 'production' ? 'enabled' : 'disabled'
  });
});

export default router;