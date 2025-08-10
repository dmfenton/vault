import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateBody } from '../middleware/validation';

const router = Router();

// Schema for device registration
const DeviceRegistrationSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(['ios', 'android', 'web']),
  pushToken: z.string().optional(),
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string()
    })
  }).optional()
});

/**
 * POST /notifications/register
 * Register a device for push notifications
 */
router.post('/register',
  validateBody(DeviceRegistrationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const registration = {
        ...req.body,
        registeredAt: new Date()
      };
      
      // Register with push service
      if (req.pushService) {
        await req.pushService.registerDevice(registration);
      }
      
      res.json({
        success: true,
        message: 'Device registered for push notifications',
        deviceId: registration.deviceId
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /notifications/unregister/:deviceId
 * Unregister a device
 */
router.delete('/unregister/:deviceId', (req: Request, res: Response) => {
  const { deviceId } = req.params;
  
  if (req.pushService) {
    req.pushService.unregisterDevice(deviceId);
  }
  
  res.json({
    success: true,
    message: 'Device unregistered',
    deviceId
  });
});

/**
 * GET /notifications/devices
 * Get all registered devices (admin endpoint)
 */
router.get('/devices', (req: Request, res: Response) => {
  if (!req.vaultService!.isApproved()) {
    res.status(403).json({ 
      error: 'Approval required' 
    });
    return;
  }
  
  const devices = req.pushService ? req.pushService.getDevices() : [];
  
  res.json({
    devices,
    count: devices.length
  });
});

/**
 * POST /notifications/test
 * Send a test notification
 */
router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.pushService) {
      res.status(501).json({ 
        error: 'Push notifications not configured' 
      });
      return;
    }
    
    await req.pushService.sendPushNotification({
      title: 'Test Notification',
      body: 'This is a test push notification from your vault server',
      data: { type: 'test' },
      priority: 'normal'
    });
    
    res.json({
      success: true,
      message: 'Test notification sent',
      deviceCount: req.pushService.getDevices().length
    });
  } catch (error) {
    next(error);
  }
});

export default router;