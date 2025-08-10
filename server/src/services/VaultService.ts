import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  VaultConfig,
  EncryptedSecret,
  SecretMetadata,
  ApprovalStatus,
  AuditEntry,
  AuditEventType,
  AuditFilter,
  IVaultService,
  SecretKeySchema,
  SecretValueSchema
} from '../types';

interface VaultData {
  version: number;
  secrets: Record<string, EncryptedSecret>;
}

export class VaultService extends EventEmitter implements IVaultService {
  private readonly config: Required<VaultConfig>;
  private masterKey: Buffer | null = null;
  private secrets: Map<string, EncryptedSecret> = new Map();
  private decryptedCache: Map<string, { value: string; cachedAt: number }> = new Map();
  private auditLog: AuditEntry[] = [];
  private approvalStatus: ApprovalStatus = {
    approved: false,
    expiresAt: null,
    oneTime: false
  };
  private initialized = false;
  private approvalTimer?: NodeJS.Timeout;

  constructor(config: Partial<VaultConfig> = {}) {
    super();
    
    this.config = {
      vaultPath: config.vaultPath || '/etc/vault',
      autoSave: config.autoSave !== false,
      maxSecretSize: config.maxSecretSize || 1024 * 1024, // 1MB
      maxKeyLength: config.maxKeyLength || 255,
      auditLogMaxSize: config.auditLogMaxSize || 10000
    };
  }

  async initialize(): Promise<void> {
    // Create vault directories
    await fs.mkdir(this.config.vaultPath, { recursive: true });
    await fs.mkdir(path.join(this.config.vaultPath, 'backups'), { recursive: true });
    
    // Load or generate master key
    const keyPath = path.join(this.config.vaultPath, 'master.key');
    
    try {
      const keyData = await fs.readFile(keyPath, 'utf8');
      this.masterKey = Buffer.from(keyData, 'hex');
    } catch {
      // Generate new master key with proper permissions
      this.masterKey = crypto.randomBytes(32);
      await fs.writeFile(keyPath, this.masterKey.toString('hex'), { mode: 0o600 });
      
      // Extra chmod for Unix systems
      if (process.platform !== 'win32') {
        const fsSync = await import('fs');
        fsSync.chmodSync(keyPath, 0o600);
      }
    }
    
    this.initialized = true;
    
    // Try to load existing vault
    try {
      await this.load();
    } catch {
      // Start with empty vault
      this.secrets = new Map();
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Check if this is first run (no master key exists)
   */
  isFirstRun(): boolean {
    return !this.initialized || !this.masterKey;
  }
  
  /**
   * Initialize vault on first phone pairing
   */
  async initializeOnFirstPairing(): Promise<void> {
    if (!this.isFirstRun()) {
      throw new Error('Vault already initialized');
    }
    
    console.log('🔐 Initializing vault with new master key...');
    
    // Generate and save master key
    const key = randomBytes(32);
    this.masterKey = key;
    
    const keyPath = path.join(this.config.vaultPath, '.master.key');
    await fs.mkdir(path.dirname(keyPath), { recursive: true });
    await fs.writeFile(keyPath, key.toString('hex'), { mode: 0o600 });
    
    this.initialized = true;
    this.secrets = new Map();
    
    console.log('✅ Vault initialized successfully');
    
    this.emit('vault_initialized', { 
      message: 'Vault initialized on first pairing' 
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.masterKey) {
      throw new Error('Vault not initialized - pair a phone first');
    }
  }

  async addSecret(key: string, value: string): Promise<void> {
    this.ensureInitialized();
    
    // Validate inputs
    const validatedKey = SecretKeySchema.parse(key);
    const validatedValue = SecretValueSchema.parse(value);
    
    if (this.secrets.has(validatedKey)) {
      throw new Error('Secret already exists');
    }
    
    const encrypted = this.encrypt(validatedValue);
    const secret: EncryptedSecret = {
      data: encrypted,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    };
    
    this.secrets.set(validatedKey, secret);
    
    if (this.config.autoSave) {
      await this.save();
    }
    
    this.logAudit({
      event: AuditEventType.SECRET_ADDED,
      key: validatedKey,
      success: true
    });
    
    this.emit('secret_added', { key: validatedKey });
  }

  async getSecret(key: string): Promise<string> {
    this.ensureInitialized();
    
    if (!this.isApproved()) {
      this.logAudit({
        event: AuditEventType.ACCESS_DENIED,
        key,
        success: false,
        reason: 'Approval required'
      });
      throw new Error('Approval required');
    }
    
    const validatedKey = SecretKeySchema.parse(key);
    
    if (!this.secrets.has(validatedKey)) {
      this.logAudit({
        event: AuditEventType.ACCESS_DENIED,
        key: validatedKey,
        success: false,
        reason: 'Secret not found'
      });
      throw new Error('Secret not found');
    }
    
    // Check cache
    const cached = this.decryptedCache.get(validatedKey);
    if (cached && Date.now() - cached.cachedAt < 60000) { // 1 minute cache
      this.handleOneTimeApproval();
      return cached.value;
    }
    
    // Decrypt secret
    const secret = this.secrets.get(validatedKey)!;
    const decrypted = this.decrypt(secret.data);
    
    // Update cache
    this.decryptedCache.set(validatedKey, {
      value: decrypted,
      cachedAt: Date.now()
    });
    
    // Update access time
    secret.accessedAt = new Date().toISOString();
    
    this.logAudit({
      event: AuditEventType.ACCESS_GRANTED,
      key: validatedKey,
      success: true
    });
    
    this.handleOneTimeApproval();
    
    return decrypted;
  }

  async updateSecret(key: string, value: string): Promise<void> {
    this.ensureInitialized();
    
    const validatedKey = SecretKeySchema.parse(key);
    const validatedValue = SecretValueSchema.parse(value);
    
    if (!this.secrets.has(validatedKey)) {
      throw new Error('Secret not found');
    }
    
    const encrypted = this.encrypt(validatedValue);
    const existing = this.secrets.get(validatedKey)!;
    
    this.secrets.set(validatedKey, {
      ...existing,
      data: encrypted,
      modifiedAt: new Date().toISOString()
    });
    
    // Clear from cache
    this.decryptedCache.delete(validatedKey);
    
    if (this.config.autoSave) {
      await this.save();
    }
    
    this.logAudit({
      event: AuditEventType.SECRET_UPDATED,
      key: validatedKey,
      success: true
    });
    
    this.emit('secret_updated', { key: validatedKey });
  }

  async deleteSecret(key: string): Promise<void> {
    this.ensureInitialized();
    
    const validatedKey = SecretKeySchema.parse(key);
    
    if (!this.secrets.has(validatedKey)) {
      throw new Error('Secret not found');
    }
    
    this.secrets.delete(validatedKey);
    this.decryptedCache.delete(validatedKey);
    
    if (this.config.autoSave) {
      await this.save();
    }
    
    this.logAudit({
      event: AuditEventType.SECRET_DELETED,
      key: validatedKey,
      success: true
    });
    
    this.emit('secret_deleted', { key: validatedKey });
  }

  hasSecret(key: string): boolean {
    try {
      const validatedKey = SecretKeySchema.parse(key);
      return this.secrets.has(validatedKey);
    } catch {
      return false;
    }
  }

  listSecrets(): string[] {
    return Array.from(this.secrets.keys());
  }

  getSecretMetadata(key: string): SecretMetadata | null {
    const secret = this.secrets.get(key);
    if (!secret) return null;
    
    return {
      key,
      createdAt: new Date(secret.createdAt),
      modifiedAt: new Date(secret.modifiedAt),
      accessedAt: secret.accessedAt ? new Date(secret.accessedAt) : undefined,
      size: secret.data.length
    };
  }

  grantApproval(options: { duration?: number; oneTime?: boolean } = {}): void {
    // Clear existing timer
    if (this.approvalTimer) {
      clearTimeout(this.approvalTimer);
      this.approvalTimer = undefined;
    }
    
    if (options.oneTime) {
      this.approvalStatus = {
        approved: true,
        oneTime: true,
        expiresAt: null,
        grantedAt: new Date()
      };
    } else if (options.duration) {
      const expiresAt = Date.now() + (options.duration * 1000);
      this.approvalStatus = {
        approved: true,
        oneTime: false,
        expiresAt,
        grantedAt: new Date()
      };
      
      // Set timer to revoke approval
      this.approvalTimer = setTimeout(() => {
        this.revokeApproval();
      }, options.duration * 1000);
    }
    
    this.logAudit({
      event: AuditEventType.VAULT_UNLOCKED,
      success: true,
      metadata: { duration: options.duration, oneTime: options.oneTime }
    });
    
    this.emit('approval_granted', this.approvalStatus);
  }

  revokeApproval(): void {
    if (this.approvalTimer) {
      clearTimeout(this.approvalTimer);
      this.approvalTimer = undefined;
    }
    
    this.approvalStatus = {
      approved: false,
      expiresAt: null,
      oneTime: false
    };
    
    // Clear decrypted cache for security
    this.decryptedCache.clear();
    
    this.logAudit({
      event: AuditEventType.VAULT_LOCKED,
      success: true
    });
    
    this.emit('approval_revoked');
  }

  isApproved(): boolean {
    if (!this.approvalStatus.approved) {
      return false;
    }
    
    if (this.approvalStatus.expiresAt && Date.now() > this.approvalStatus.expiresAt) {
      this.revokeApproval();
      return false;
    }
    
    return true;
  }

  getApprovalStatus(): ApprovalStatus {
    return { ...this.approvalStatus };
  }

  private handleOneTimeApproval(): void {
    if (this.approvalStatus.oneTime) {
      this.revokeApproval();
    }
  }

  async rotateKey(): Promise<void> {
    this.ensureInitialized();
    
    // Always require approval for key rotation
    if (!this.isApproved()) {
      throw new Error('Approval required for key rotation');
    }
    
    // Create backup
    await this.createBackup();
    
    // Generate new key
    const oldKey = this.masterKey!;
    this.masterKey = crypto.randomBytes(32);
    
    // Re-encrypt all secrets
    const reencryptedSecrets = new Map<string, EncryptedSecret>();
    
    for (const [key, secret] of this.secrets) {
      // Decrypt with old key
      const decrypted = this.decrypt(secret.data, oldKey);
      // Encrypt with new key
      const encrypted = this.encrypt(decrypted);
      
      reencryptedSecrets.set(key, {
        ...secret,
        data: encrypted,
        rotatedAt: new Date().toISOString()
      });
    }
    
    this.secrets = reencryptedSecrets;
    
    // Save new key with restricted permissions
    const keyPath = path.join(this.config.vaultPath, 'master.key');
    await fs.writeFile(keyPath, this.masterKey.toString('hex'), { mode: 0o600 });
    
    if (process.platform !== 'win32') {
      const fsSync = await import('fs');
      fsSync.chmodSync(keyPath, 0o600);
    }
    
    // Save rotated vault
    await this.save();
    
    // Clear cache
    this.decryptedCache.clear();
    
    this.logAudit({
      event: AuditEventType.KEY_ROTATED,
      success: true,
      metadata: { secretCount: this.secrets.size }
    });
    
    this.emit('key_rotated', { secretCount: this.secrets.size });
  }

  getMasterKeyHash(): string {
    if (!this.masterKey) return '';
    return crypto.createHash('sha256').update(this.masterKey).digest('hex');
  }

  async save(): Promise<void> {
    this.ensureInitialized();
    
    const vaultFile = path.join(this.config.vaultPath, 'secrets.json');
    
    const vaultData: VaultData = {
      version: 2,
      secrets: Object.fromEntries(this.secrets)
    };
    
    await fs.writeFile(vaultFile, JSON.stringify(vaultData, null, 2), { mode: 0o600 });
  }

  async load(): Promise<void> {
    const vaultFile = path.join(this.config.vaultPath, 'secrets.json');
    
    try {
      const data = await fs.readFile(vaultFile, 'utf8');
      const vaultData = JSON.parse(data) as VaultData;
      
      this.secrets = new Map(Object.entries(vaultData.secrets || {}));
    } catch (error) {
      throw new Error(`Failed to load vault: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getAuditLog(filter?: AuditFilter): AuditEntry[] {
    let log = [...this.auditLog];
    
    if (filter?.from) {
      log = log.filter(entry => entry.timestamp >= filter.from!);
    }
    
    if (filter?.to) {
      log = log.filter(entry => entry.timestamp <= filter.to!);
    }
    
    if (filter?.event) {
      log = log.filter(entry => entry.event === filter.event);
    }
    
    if (filter?.key) {
      log = log.filter(entry => entry.key === filter.key);
    }
    
    if (filter?.success !== undefined) {
      log = log.filter(entry => entry.success === filter.success);
    }
    
    if (filter?.page && filter?.limit) {
      const start = (filter.page - 1) * filter.limit;
      const end = start + filter.limit;
      log = log.slice(start, end);
    }
    
    return log;
  }

  getSecretCount(): number {
    return this.secrets.size;
  }

  getCacheSize(): number {
    return this.decryptedCache.size;
  }

  getVaultSize(): number {
    let size = 0;
    for (const secret of this.secrets.values()) {
      size += secret.data.length;
    }
    return size;
  }

  // Private methods

  private encrypt(data: string, key?: Buffer): string {
    const masterKey = key || this.masterKey;
    if (!masterKey) throw new Error('No encryption key available');
    
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    
    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const authTag = cipher.getAuthTag();
    
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decrypt(encryptedData: string, key?: Buffer): string {
    const masterKey = key || this.masterKey;
    if (!masterKey) throw new Error('No decryption key available');
    
    const buffer = Buffer.from(encryptedData, 'base64');
    
    const iv = buffer.subarray(0, 16);
    const authTag = buffer.subarray(16, 32);
    const encrypted = buffer.subarray(32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  }

  private logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>): void {
    const auditEntry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      ...entry
    };
    
    this.auditLog.push(auditEntry);
    
    // Keep only last N entries
    if (this.auditLog.length > this.config.auditLogMaxSize) {
      this.auditLog = this.auditLog.slice(-this.config.auditLogMaxSize);
    }
    
    this.emit('audit_logged', auditEntry);
  }

  private async createBackup(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupFile = path.join(this.config.vaultPath, 'backups', `vault-${timestamp}.json`);
    
    const vaultFile = path.join(this.config.vaultPath, 'secrets.json');
    
    try {
      await fs.copyFile(vaultFile, backupFile);
    } catch {
      // If no vault file exists yet, create empty backup
      await fs.writeFile(backupFile, JSON.stringify({ version: 2, secrets: {} }));
    }
  }
}