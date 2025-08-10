import { EventEmitter } from 'events';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface DeviceRegistration {
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  pushToken?: string;  // FCM token for Android, APNs token for iOS
  subscription?: PushSubscription;  // Web Push subscription
  registeredAt: Date;
}

export class PushNotificationService extends EventEmitter {
  private devices: Map<string, DeviceRegistration> = new Map();
  
  /**
   * Register a device for push notifications
   */
  async registerDevice(registration: DeviceRegistration): Promise<void> {
    this.devices.set(registration.deviceId, registration);
    console.log(`📱 Registered device for push: ${registration.deviceId} (${registration.platform})`);
  }
  
  /**
   * Unregister a device
   */
  unregisterDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    console.log(`📱 Unregistered device: ${deviceId}`);
  }
  
  /**
   * Send push notification to all registered devices
   */
  async sendPushNotification(notification: {
    title: string;
    body: string;
    data?: Record<string, any>;
    priority?: 'high' | 'normal';
  }): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [deviceId, device] of this.devices) {
      promises.push(this.sendToDevice(device, notification));
    }
    
    await Promise.allSettled(promises);
  }
  
  /**
   * Send notification to specific device
   */
  private async sendToDevice(
    device: DeviceRegistration,
    notification: any
  ): Promise<void> {
    try {
      switch (device.platform) {
        case 'ios':
          await this.sendAPNs(device, notification);
          break;
        case 'android':
          await this.sendFCM(device, notification);
          break;
        case 'web':
          await this.sendWebPush(device, notification);
          break;
      }
      
      this.emit('notification_sent', { deviceId: device.deviceId, platform: device.platform });
    } catch (error) {
      console.error(`Failed to send push to ${device.deviceId}:`, error);
      this.emit('notification_failed', { deviceId: device.deviceId, error });
    }
  }
  
  /**
   * Send via Firebase Cloud Messaging (Android)
   */
  private async sendFCM(device: DeviceRegistration, notification: any): Promise<void> {
    if (!device.pushToken) {
      throw new Error('No FCM token for device');
    }
    
    // In production, you'd use the FCM HTTP v1 API
    // For now, we'll simulate it
    console.log(`📤 FCM Push to ${device.deviceId}:`, notification.title);
    
    // Simulated FCM API call
    if (process.env.FCM_SERVER_KEY) {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${process.env.FCM_SERVER_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: device.pushToken,
          priority: notification.priority || 'high',
          notification: {
            title: notification.title,
            body: notification.body,
            sound: 'default'
          },
          data: notification.data || {}
        })
      });
      
      if (!response.ok) {
        throw new Error(`FCM error: ${response.status}`);
      }
    }
  }
  
  /**
   * Send via Apple Push Notification service (iOS)
   */
  private async sendAPNs(device: DeviceRegistration, notification: any): Promise<void> {
    if (!device.pushToken) {
      throw new Error('No APNs token for device');
    }
    
    // In production, you'd use the APNs HTTP/2 API
    console.log(`📤 APNs Push to ${device.deviceId}:`, notification.title);
    
    // Simulated APNs call
    // In real implementation, you'd use a library like node-apn or @parse/node-apn
  }
  
  /**
   * Send via Web Push API
   */
  private async sendWebPush(device: DeviceRegistration, notification: any): Promise<void> {
    if (!device.subscription) {
      throw new Error('No web push subscription for device');
    }
    
    console.log(`📤 Web Push to ${device.deviceId}:`, notification.title);
    
    // In production, you'd use the web-push library
    // For now, we'll simulate it
  }
  
  /**
   * Send approval request as push notification
   */
  async sendApprovalRequest(request: {
    id: string;
    type: string;
    secretKey?: string;
    hostname: string;
    ipAddress: string;
  }): Promise<void> {
    const title = 'Vault Approval Required';
    let body = `${request.type} request from ${request.hostname}`;
    
    if (request.secretKey) {
      body = `Access to "${request.secretKey}" requested from ${request.hostname}`;
    }
    
    await this.sendPushNotification({
      title,
      body,
      data: {
        type: 'approval_request',
        requestId: request.id,
        ...request
      },
      priority: 'high'
    });
  }
  
  /**
   * Get registered devices
   */
  getDevices(): DeviceRegistration[] {
    return Array.from(this.devices.values());
  }
  
  /**
   * Check if any devices are registered
   */
  hasDevices(): boolean {
    return this.devices.size > 0;
  }
}