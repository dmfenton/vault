import { IVaultService, INotificationService } from './index';
import { PushNotificationService } from '../services/PushNotificationService';

declare global {
  namespace Express {
    interface Request {
      vaultService?: IVaultService;
      notificationService?: INotificationService;
      pushService?: PushNotificationService;
    }
  }
}