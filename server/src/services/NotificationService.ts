import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import WebSocket from 'ws';
import {
  NotificationConfig,
  NotificationType,
  NotificationMessage,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalType,
  INotificationService,
  PhoneConnection
} from '../types';

interface PendingRequest {
  resolve: (response: ApprovalResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface RateLimitConfig {
  enabled: boolean;
  max: number;
  windowMs: number;
  count: number;
  resetTimer?: NodeJS.Timeout;
}

export class NotificationService extends EventEmitter implements INotificationService {
  private readonly config: Required<NotificationConfig>;
  private websocket: WebSocket | null = null;
  private connected = false;
  private messageQueue: NotificationMessage[] = [];
  private pendingRequests = new Map<string, PendingRequest>();
  private processedNonces = new Set<string>();
  private reconnectTimer?: NodeJS.Timeout;
  private phoneConnection?: PhoneConnection;
  private rateLimit: RateLimitConfig = {
    enabled: false,
    max: 0,
    windowMs: 0,
    count: 0
  };
  private encryptionKey?: string;
  private sharedSecret?: string;

  constructor(config: Partial<NotificationConfig> = {}) {
    super();
    
    this.config = {
      phoneId: config.phoneId || 'default-phone',
      serverUrl: config.serverUrl || 'http://localhost:3000',
      maxQueueSize: config.maxQueueSize || 100,
      reconnectIntervalMs: config.reconnectIntervalMs || 5000,
      defaultTimeoutMs: config.defaultTimeoutMs || 300000 // 5 minutes
    };
  }

  async connect(): Promise<boolean> {
    try {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.connected = true;
        return true;
      }
      
      // Create new WebSocket connection
      this.websocket = new WebSocket(`ws://localhost:3001`);
      
      await new Promise<void>((resolve, reject) => {
        if (!this.websocket) {
          reject(new Error('WebSocket creation failed'));
          return;
        }
        
        this.websocket.once('open', () => {
          this.connected = true;
          this.phoneConnection = {
            id: crypto.randomUUID(),
            connectedAt: new Date(),
            isActive: true
          };
          this.setupWebSocketHandlers();
          resolve();
        });
        
        this.websocket.once('error', reject);
        
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });
      
      await this.flushQueue();
      this.emit('connected', this.phoneConnection);
      return true;
      
    } catch (error) {
      this.connected = false;
      this.scheduleReconnect();
      return false;
    }
  }

  disconnect(): void {
    this.connected = false;
    
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    
    if (this.rateLimit.resetTimer) {
      clearInterval(this.rateLimit.resetTimer);
      this.rateLimit.resetTimer = undefined;
    }
    
    this.phoneConnection = undefined;
    this.emit('disconnected');
  }

  isConnected(): boolean {
    return this.connected && this.websocket !== null && this.websocket.readyState === WebSocket.OPEN;
  }

  async requestApproval(
    request: Omit<ApprovalRequest, 'id' | 'requestedAt' | 'expiresAt'>
  ): Promise<ApprovalResponse> {
    const fullRequest: ApprovalRequest = {
      ...request,
      id: crypto.randomUUID(),
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.defaultTimeoutMs)
    };
    
    const message: NotificationMessage = {
      id: crypto.randomUUID(),
      type: NotificationType.APPROVAL_REQUEST,
      title: this.getApprovalTitle(fullRequest.type),
      body: this.getApprovalBody(fullRequest),
      timestamp: new Date(),
      requestId: fullRequest.id,
      metadata: fullRequest.metadata
    };
    
    // Send notification
    await this.sendMessage(message);
    
    // Wait for response
    return new Promise<ApprovalResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(fullRequest.id);
        reject(new Error('Approval request timed out'));
      }, this.config.defaultTimeoutMs);
      
      this.pendingRequests.set(fullRequest.id, {
        resolve,
        reject,
        timer
      });
    });
  }

  handleApprovalResponse(response: ApprovalResponse & { requestId: string }): void {
    const pending = this.pendingRequests.get(response.requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(response.requestId);
      
      const fullResponse: ApprovalResponse = {
        ...response,
        respondedAt: new Date()
      };
      
      pending.resolve(fullResponse);
      this.emit('approval_received', fullResponse);
    }
  }

  async sendNotification(message: Omit<NotificationMessage, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: NotificationMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date()
    };
    
    return this.sendMessage(fullMessage);
  }

  async sendInfo(body: string): Promise<void> {
    return this.sendNotification({ type: NotificationType.INFO, body });
  }

  async sendWarning(body: string): Promise<void> {
    return this.sendNotification({ type: NotificationType.WARNING, body });
  }

  async sendError(body: string): Promise<void> {
    return this.sendNotification({ type: NotificationType.ERROR, body });
  }

  async sendSuccess(body: string): Promise<void> {
    return this.sendNotification({ type: NotificationType.SUCCESS, body });
  }

  getQueueSize(): number {
    return this.messageQueue.length;
  }

  clearQueue(): void {
    this.messageQueue = [];
  }

  enableRateLimit(max: number, windowMs: number): void {
    this.rateLimit = {
      enabled: true,
      max,
      windowMs,
      count: 0
    };
    
    if (this.rateLimit.resetTimer) {
      clearInterval(this.rateLimit.resetTimer);
    }
    
    this.rateLimit.resetTimer = setInterval(() => {
      this.rateLimit.count = 0;
    }, windowMs);
  }

  disableRateLimit(): void {
    if (this.rateLimit.resetTimer) {
      clearInterval(this.rateLimit.resetTimer);
      this.rateLimit.resetTimer = undefined;
    }
    
    this.rateLimit = {
      enabled: false,
      max: 0,
      windowMs: 0,
      count: 0
    };
  }

  enableEncryption(key: string): void {
    this.encryptionKey = key;
  }

  enableSignatureValidation(secret: string): void {
    this.sharedSecret = secret;
  }

  // Private methods

  private setupWebSocketHandlers(): void {
    if (!this.websocket) return;
    
    this.websocket.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        this.emit('error', new Error('Failed to parse message'));
      }
    });
    
    this.websocket.on('close', () => {
      this.handleDisconnect();
    });
    
    this.websocket.on('error', (error: Error) => {
      this.emit('error', error);
      this.handleDisconnect();
    });
    
    this.websocket.on('ping', () => {
      if (this.phoneConnection) {
        this.phoneConnection.lastPing = new Date();
      }
    });
  }

  private handleMessage(message: any): void {
    try {
      // Validate signature if enabled
      if (this.sharedSecret && !this.validateSignature(message)) {
        throw new Error('Invalid message signature');
      }
      
      // Check for replay attacks
      if (message.nonce && this.processedNonces.has(message.nonce)) {
        throw new Error('Duplicate or expired message');
      }
      
      if (message.nonce) {
        this.processedNonces.add(message.nonce);
        // Clean old nonces periodically
        if (this.processedNonces.size > 1000) {
          this.processedNonces.clear();
        }
      }
      
      // Check timestamp
      if (message.timestamp && Date.now() - new Date(message.timestamp).getTime() > 60000) {
        throw new Error('Message timestamp too old');
      }
      
      // Handle different message types
      switch (message.type) {
        case NotificationType.APPROVAL_RESPONSE:
          this.handleApprovalResponse(message);
          break;
        
        default:
          // Unknown message type
          this.emit('unknown_message', message);
      }
      
    } catch (error) {
      // Silently handle errors to prevent crashes
      if (process.env.NODE_ENV !== 'test') {
        this.emit('error', error instanceof Error ? error : new Error('Unknown error'));
      }
    }
  }

  private handleDisconnect(): void {
    this.connected = false;
    if (this.phoneConnection) {
      this.phoneConnection.isActive = false;
    }
    this.scheduleReconnect();
    this.emit('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      if (!this.connected) {
        await this.connect();
      }
    }, this.config.reconnectIntervalMs);
  }

  private async sendMessage(message: NotificationMessage): Promise<void> {
    // Apply encryption if enabled
    let processedMessage: any = message;
    if (this.encryptionKey && message.body) {
      processedMessage = {
        ...message,
        body: undefined,
        encrypted: this.encrypt(message.body)
      };
    }
    
    // Apply signature if enabled
    if (this.sharedSecret) {
      processedMessage.signature = this.sign(processedMessage);
    }
    
    // Apply rate limiting
    if (this.rateLimit.enabled) {
      if (this.rateLimit.count >= this.rateLimit.max) {
        this.queueMessage(message);
        return;
      }
      this.rateLimit.count++;
    }
    
    // Try WebSocket first
    if (this.isConnected() && this.websocket) {
      try {
        this.websocket.send(JSON.stringify(processedMessage));
        this.emit('message_sent', message);
        return;
      } catch (error) {
        // Fall through to queue
      }
    }
    
    // Queue the message
    this.queueMessage(message);
  }

  private queueMessage(message: NotificationMessage): void {
    if (this.messageQueue.length >= this.config.maxQueueSize) {
      this.messageQueue.shift(); // Remove oldest
    }
    this.messageQueue.push(message);
  }

  private async flushQueue(): Promise<void> {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const message = this.messageQueue.shift();
      if (message) {
        await this.sendMessage(message);
      }
    }
  }

  private getApprovalTitle(type: ApprovalType): string {
    switch (type) {
      case ApprovalType.SECRET_ACCESS:
        return '🔐 Secret Access Request';
      case ApprovalType.KEY_ROTATION:
        return '🔄 Key Rotation Request';
      case ApprovalType.VAULT_EXPORT:
        return '📤 Vault Export Request';
      case ApprovalType.BULK_OPERATION:
        return '📦 Bulk Operation Request';
      default:
        return '🔐 Approval Request';
    }
  }

  private getApprovalBody(request: ApprovalRequest): string {
    const lines = [
      `Host: ${request.hostname}`,
      `Time: ${request.requestedAt.toLocaleString()}`,
      `Type: ${request.type}`
    ];
    
    if (request.secretKey) {
      lines.push(`Secret: ${request.secretKey}`);
    }
    
    if (request.ipAddress) {
      lines.push(`IP: ${request.ipAddress}`);
    }
    
    return lines.join('\n');
  }

  private encrypt(data: string): string {
    if (!this.encryptionKey) return data;
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-gcm',
      Buffer.from(this.encryptionKey, 'hex'),
      iv
    );
    
    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private sign(data: any): string {
    if (!this.sharedSecret) return '';
    
    return crypto
      .createHmac('sha256', this.sharedSecret)
      .update(JSON.stringify(data))
      .digest('hex');
  }

  private validateSignature(message: any): boolean {
    if (!this.sharedSecret || !message.signature) return false;
    
    const { signature, ...data } = message;
    const expectedSignature = this.sign(data);
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}