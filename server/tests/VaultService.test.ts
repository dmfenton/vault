import { VaultService } from '../src/services/VaultService';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AuditEventType } from '../src/types';

describe('VaultService', () => {
  let vaultService: VaultService;
  let testDir: string;
  
  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-vault-' + Date.now());
    await fs.mkdir(testDir, { recursive: true });
    
    vaultService = new VaultService({
      vaultPath: testDir,
      autoSave: false
    });
    
    await vaultService.initialize();
  });

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Basic Operations', () => {
    test('should add and retrieve secrets with approval', async () => {
      await vaultService.addSecret('test_key', 'test_value');
      
      // Should fail without approval
      await expect(vaultService.getSecret('test_key'))
        .rejects.toThrow('Approval required');
      
      // Grant approval
      vaultService.grantApproval({ duration: 3600 });
      
      // Should work with approval
      const value = await vaultService.getSecret('test_key');
      expect(value).toBe('test_value');
    });

    test('should update and delete secrets', async () => {
      await vaultService.addSecret('key', 'original');
      await vaultService.updateSecret('key', 'updated');
      
      vaultService.grantApproval({ duration: 3600 });
      const value = await vaultService.getSecret('key');
      expect(value).toBe('updated');
      
      await vaultService.deleteSecret('key');
      expect(vaultService.hasSecret('key')).toBe(false);
    });

    test('should validate secret keys', async () => {
      // Empty key
      await expect(vaultService.addSecret('', 'value'))
        .rejects.toThrow();
      
      // Path traversal
      await expect(vaultService.addSecret('../etc/passwd', 'value'))
        .rejects.toThrow('path traversal');
      
      // Invalid characters
      await expect(vaultService.addSecret('key with spaces', 'value'))
        .rejects.toThrow();
      
      // Valid key
      await expect(vaultService.addSecret('valid_key-123', 'value'))
        .resolves.not.toThrow();
    });

    test('should enforce size limits', async () => {
      // Large value (over 1MB)
      const largeValue = 'x'.repeat(1024 * 1024 + 1);
      await expect(vaultService.addSecret('large', largeValue))
        .rejects.toThrow();
      
      // Long key (over 255 chars)
      const longKey = 'a'.repeat(256);
      await expect(vaultService.addSecret(longKey, 'value'))
        .rejects.toThrow();
    });

    test('should list secret keys', async () => {
      await vaultService.addSecret('key1', 'value1');
      await vaultService.addSecret('key2', 'value2');
      
      const keys = vaultService.listSecrets();
      expect(keys).toEqual(['key1', 'key2']);
    });

    test('should get secret metadata', () => {
      vaultService.addSecret('test', 'value');
      
      const metadata = vaultService.getSecretMetadata('test');
      expect(metadata).toMatchObject({
        key: 'test',
        size: expect.any(Number)
      });
      expect(metadata?.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('Approval System', () => {
    test('should handle one-time approval', async () => {
      await vaultService.addSecret('secret', 'value');
      
      vaultService.grantApproval({ oneTime: true });
      
      // First access works
      await vaultService.getSecret('secret');
      
      // Second access fails
      await expect(vaultService.getSecret('secret'))
        .rejects.toThrow('Approval required');
    });

    test('should expire approval after duration', async () => {
      await vaultService.addSecret('secret', 'value');
      
      vaultService.grantApproval({ duration: 0.1 }); // 100ms
      
      // Immediate access works
      await vaultService.getSecret('secret');
      
      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should fail after expiry
      await expect(vaultService.getSecret('secret'))
        .rejects.toThrow('Approval required');
    });

    test('should revoke approval on demand', async () => {
      await vaultService.addSecret('secret', 'value');
      
      vaultService.grantApproval({ duration: 3600 });
      await vaultService.getSecret('secret'); // Works
      
      vaultService.revokeApproval();
      
      await expect(vaultService.getSecret('secret'))
        .rejects.toThrow('Approval required');
    });

    test('should clear cache on revoke', async () => {
      await vaultService.addSecret('secret', 'value');
      
      vaultService.grantApproval({ duration: 3600 });
      await vaultService.getSecret('secret');
      expect(vaultService.getCacheSize()).toBe(1);
      
      vaultService.revokeApproval();
      expect(vaultService.getCacheSize()).toBe(0);
    });
  });

  describe('Key Rotation', () => {
    test('should rotate encryption key with approval', async () => {
      await vaultService.addSecret('secret1', 'value1');
      await vaultService.addSecret('secret2', 'value2');
      
      // Should fail without approval
      await expect(vaultService.rotateKey())
        .rejects.toThrow('Approval required');
      
      // Grant approval
      vaultService.grantApproval({ duration: 3600 });
      
      const oldHash = vaultService.getMasterKeyHash();
      await vaultService.rotateKey();
      const newHash = vaultService.getMasterKeyHash();
      
      expect(newHash).not.toBe(oldHash);
      
      // Secrets should still be accessible
      expect(await vaultService.getSecret('secret1')).toBe('value1');
      expect(await vaultService.getSecret('secret2')).toBe('value2');
    });

    test('should create backup during rotation', async () => {
      await vaultService.addSecret('test', 'value');
      vaultService.grantApproval({ duration: 3600 });
      await vaultService.rotateKey();
      
      const backupDir = path.join(testDir, 'backups');
      const files = await fs.readdir(backupDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toMatch(/vault-\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('Persistence', () => {
    test('should save and load vault', async () => {
      await vaultService.addSecret('persistent', 'data');
      await vaultService.save();
      
      // Create new instance
      const vaultService2 = new VaultService({ vaultPath: testDir });
      await vaultService2.initialize();
      
      expect(vaultService2.hasSecret('persistent')).toBe(true);
      
      vaultService2.grantApproval({ duration: 3600 });
      const value = await vaultService2.getSecret('persistent');
      expect(value).toBe('data');
    });

    test('should handle corrupted vault gracefully', async () => {
      const vaultFile = path.join(testDir, 'secrets.json');
      await fs.writeFile(vaultFile, 'corrupted data');
      
      const newVault = new VaultService({ vaultPath: testDir });
      await newVault.initialize();
      
      // Should start with empty vault
      expect(newVault.getSecretCount()).toBe(0);
    });
  });

  describe('Audit Log', () => {
    test('should track all operations', async () => {
      await vaultService.addSecret('audited', 'value');
      
      // Failed access
      try {
        await vaultService.getSecret('audited');
      } catch {}
      
      // Successful access
      vaultService.grantApproval({ duration: 3600 });
      await vaultService.getSecret('audited');
      
      // Update
      await vaultService.updateSecret('audited', 'new_value');
      
      // Delete
      await vaultService.deleteSecret('audited');
      
      const log = vaultService.getAuditLog();
      const events = log.map(e => e.event);
      
      expect(events).toContain(AuditEventType.SECRET_ADDED);
      expect(events).toContain(AuditEventType.ACCESS_DENIED);
      expect(events).toContain(AuditEventType.ACCESS_GRANTED);
      expect(events).toContain(AuditEventType.SECRET_UPDATED);
      expect(events).toContain(AuditEventType.SECRET_DELETED);
    });

    test('should filter audit log', () => {
      // Add some events
      vaultService.addSecret('test1', 'value1');
      vaultService.addSecret('test2', 'value2');
      
      const log = vaultService.getAuditLog({
        event: AuditEventType.SECRET_ADDED,
        key: 'test1'
      });
      
      expect(log.length).toBe(1);
      expect(log[0].key).toBe('test1');
    });
  });

  describe('Metrics', () => {
    test('should track vault size', async () => {
      expect(vaultService.getVaultSize()).toBe(0);
      
      await vaultService.addSecret('test', 'value');
      expect(vaultService.getVaultSize()).toBeGreaterThan(0);
      
      await vaultService.addSecret('test2', 'another value');
      const size = vaultService.getVaultSize();
      
      await vaultService.deleteSecret('test');
      expect(vaultService.getVaultSize()).toBeLessThan(size);
    });
  });

  describe('Events', () => {
    test('should emit events for operations', async () => {
      const events: string[] = [];
      
      vaultService.on('secret_added', () => events.push('added'));
      vaultService.on('secret_updated', () => events.push('updated'));
      vaultService.on('secret_deleted', () => events.push('deleted'));
      vaultService.on('approval_granted', () => events.push('granted'));
      vaultService.on('approval_revoked', () => events.push('revoked'));
      
      await vaultService.addSecret('test', 'value');
      await vaultService.updateSecret('test', 'new');
      vaultService.grantApproval({ duration: 1 });
      vaultService.revokeApproval();
      await vaultService.deleteSecret('test');
      
      expect(events).toEqual(['added', 'updated', 'granted', 'revoked', 'deleted']);
    });
  });
});