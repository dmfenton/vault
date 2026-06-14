import { IVaultService, INotificationService, AuditEntry } from './index';
import { PushNotificationService } from '../services/PushNotificationService';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- module augmentation of Express requires the namespace form
  namespace Express {
    interface Request {
      vaultService?: IVaultService;
      notificationService?: INotificationService;
      pushService?: PushNotificationService;
      auditEntry?: Partial<AuditEntry>;
    }
  }
}