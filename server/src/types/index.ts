import { z } from 'zod';

// ============= Core Types =============

export interface VaultConfig {
  vaultPath: string;
  autoSave: boolean;
  maxSecretSize: number;
  maxKeyLength: number;
  auditLogMaxSize: number;
}

export interface NotificationConfig {
  phoneId: string;
  serverUrl: string;
  maxQueueSize: number;
  reconnectIntervalMs: number;
  defaultTimeoutMs: number;
}

// ============= Secret Types =============

export interface EncryptedSecret {
  data: string;
  createdAt: string;
  modifiedAt: string;
  accessedAt?: string;
  rotatedAt?: string;
}

export interface SecretMetadata {
  key: string;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt?: Date;
  size: number;
}

// ============= Approval Types =============

export enum ApprovalType {
  SECRET_ACCESS = 'secret_access',
  KEY_ROTATION = 'key_rotation',
  VAULT_EXPORT = 'vault_export',
  BULK_OPERATION = 'bulk_operation'
}

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  requestedAt: Date;
  expiresAt: Date;
  metadata: Record<string, unknown>;
  secretKey?: string;
  hostname: string;
  ipAddress?: string;
}

export interface ApprovalResponse {
  approved: boolean;
  duration?: number; // seconds
  oneTime?: boolean;
  reason?: string;
  respondedAt: Date;
}

export interface ApprovalStatus {
  approved: boolean;
  expiresAt: number | null;
  oneTime: boolean;
  grantedAt?: Date;
  grantedBy?: string;
}

// ============= Audit Types =============

export enum AuditEventType {
  ACCESS_GRANTED = 'access_granted',
  ACCESS_DENIED = 'access_denied',
  SECRET_ADDED = 'secret_added',
  SECRET_UPDATED = 'secret_updated',
  SECRET_DELETED = 'secret_deleted',
  KEY_ROTATED = 'key_rotated',
  VAULT_LOCKED = 'vault_locked',
  VAULT_UNLOCKED = 'vault_unlocked',
  EXPORT_REQUESTED = 'export_requested'
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  event: AuditEventType;
  success: boolean;
  key?: string;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditFilter {
  from?: Date;
  to?: Date;
  event?: AuditEventType;
  key?: string;
  success?: boolean;
  page?: number;
  limit?: number;
}

// ============= Notification Types =============

export enum NotificationType {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success',
  APPROVAL_REQUEST = 'approval_request',
  APPROVAL_RESPONSE = 'approval_response'
}

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  title?: string;
  body: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  requestId?: string;
  nonce?: string;
  signature?: string;
}

export interface PhoneConnection {
  id: string;
  connectedAt: Date;
  lastPing?: Date;
  isActive: boolean;
}

// ============= API Types =============

export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

export interface ApiSuccess<T = unknown> {
  data?: T;
  message?: string;
}

// ============= Validation Schemas =============

export const SecretKeySchema = z.string()
  .min(1, 'Secret key cannot be empty')
  .max(255, 'Secret key too long')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Secret key can only contain alphanumeric characters, underscore and dash')
  .refine(key => !key.includes('..') && !key.includes('/') && !key.includes('\\'), {
    message: 'Secret key cannot contain path traversal characters'
  });

export const SecretValueSchema = z.string()
  .min(1, 'Secret value cannot be empty')
  .max(1024 * 1024, 'Secret value too large (max 1MB)');

export const AddSecretSchema = z.object({
  key: SecretKeySchema,
  value: SecretValueSchema
});

export const UpdateSecretSchema = z.object({
  value: SecretValueSchema
});

export const ApprovalRequestSchema = z.object({
  type: z.nativeEnum(ApprovalType),
  secretKey: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

export const ApprovalResponseSchema = z.object({
  approved: z.boolean(),
  duration: z.number().min(1).max(86400).optional(), // max 24 hours
  oneTime: z.boolean().optional(),
  reason: z.string().optional()
});

// ============= Service Interfaces =============

export interface IVaultService {
  initialize(): Promise<void>;
  isInitialized(): boolean;
  
  // Secret operations
  addSecret(key: string, value: string): Promise<void>;
  getSecret(key: string): Promise<string>;
  updateSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  hasSecret(key: string): boolean;
  listSecrets(): string[];
  getSecretMetadata(key: string): SecretMetadata | null;
  
  // Approval management
  grantApproval(options: { duration?: number; oneTime?: boolean }): void;
  revokeApproval(): void;
  isApproved(): boolean;
  getApprovalStatus(): ApprovalStatus;
  
  // Key management
  rotateKey(): Promise<void>;
  getMasterKeyHash(): string;
  
  // Persistence
  save(): Promise<void>;
  load(): Promise<void>;
  
  // Audit
  getAuditLog(filter?: AuditFilter): AuditEntry[];
  
  // Metrics
  getSecretCount(): number;
  getCacheSize(): number;
  getVaultSize(): number;
}

export interface INotificationService {
  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
  
  // Approval flow
  requestApproval(request: Omit<ApprovalRequest, 'id' | 'requestedAt' | 'expiresAt'>): Promise<ApprovalResponse>;
  handleApprovalResponse(response: ApprovalResponse & { requestId: string }): void;
  
  // Notifications
  sendNotification(message: Omit<NotificationMessage, 'id' | 'timestamp'>): Promise<void>;
  sendInfo(body: string): Promise<void>;
  sendWarning(body: string): Promise<void>;
  sendError(body: string): Promise<void>;
  sendSuccess(body: string): Promise<void>;
  
  // Queue management
  getQueueSize(): number;
  clearQueue(): void;
  
  // Rate limiting
  enableRateLimit(max: number, windowMs: number): void;
  disableRateLimit(): void;
}

// ============= Express Extensions =============

declare global {
  namespace Express {
    interface Request {
      vaultService?: IVaultService;
      notificationService?: INotificationService;
      auditEntry?: Partial<AuditEntry>;
    }
  }
}