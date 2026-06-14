import request from 'supertest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createApp } from '../src/app';
import { VaultService } from '../src/services/VaultService';
import {
  INotificationService,
  ApprovalResponse,
  NotificationMessage,
  ApprovalRequest
} from '../src/types';

const API_TOKEN = 'test-token-1234567890';
const auth = { Authorization: `Bearer ${API_TOKEN}` };

/**
 * Mock notification service that auto-approves every request. Lets us exercise
 * the HTTP approval flow without a real phone/WebSocket.
 */
function createMockNotificationService(
  response: Partial<ApprovalResponse> = {}
): INotificationService {
  return {
    connect: async () => true,
    disconnect: () => undefined,
    isConnected: () => true,
    requestApproval: async (
      _req: Omit<ApprovalRequest, 'id' | 'requestedAt' | 'expiresAt'>
    ): Promise<ApprovalResponse> => ({
      approved: true,
      duration: 300,
      respondedAt: new Date(),
      ...response
    }),
    handleApprovalResponse: () => undefined,
    sendNotification: async (_m: Omit<NotificationMessage, 'id' | 'timestamp'>) => undefined,
    sendInfo: async () => undefined,
    sendWarning: async () => undefined,
    sendError: async () => undefined,
    sendSuccess: async () => undefined,
    getQueueSize: () => 0,
    clearQueue: () => undefined,
    enableRateLimit: () => undefined,
    disableRateLimit: () => undefined
  };
}

describe('App (HTTP API)', () => {
  let vaultService: VaultService;
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(__dirname, 'test-app-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    await fs.mkdir(testDir, { recursive: true });
    vaultService = new VaultService({ vaultPath: testDir, autoSave: false });
    await vaultService.initialize();
  });

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  function makeApp(notificationService = createMockNotificationService()) {
    return createApp({ vaultService, notificationService, apiToken: API_TOKEN });
  }

  describe('Authentication', () => {
    test('rejects requests to /secrets without a token', async () => {
      const res = await request(makeApp()).get('/secrets');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test('rejects requests with a wrong token', async () => {
      const res = await request(makeApp())
        .get('/secrets')
        .set('Authorization', 'Bearer wrong-token');
      expect(res.status).toBe(401);
    });

    test('allows requests with the correct token', async () => {
      const res = await request(makeApp()).get('/secrets').set(auth);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ secrets: [], count: 0 });
    });

    test('protects /audit, /rotate-key, /lock and /export', async () => {
      const app = makeApp();
      expect((await request(app).get('/audit')).status).toBe(401);
      expect((await request(app).post('/lock')).status).toBe(401);
      expect((await request(app).post('/rotate-key')).status).toBe(401);
      expect((await request(app).post('/export')).status).toBe(401);
    });

    test('leaves /health public', async () => {
      const res = await request(makeApp()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });
  });

  describe('Secret access approval flow', () => {
    test('returns a secret value after approval', async () => {
      await vaultService.addSecret('api_key', 'super-secret');
      const res = await request(makeApp()).get('/secrets/api_key').set(auth);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: 'api_key', value: 'super-secret' });
    });

    test('denies access when the phone denies approval', async () => {
      await vaultService.addSecret('api_key', 'super-secret');
      const denier = createMockNotificationService({ approved: false, reason: 'nope' });
      const res = await request(makeApp(denier)).get('/secrets/api_key').set(auth);
      expect(res.status).toBe(403);
    });

    test('approval is scoped: approving one secret does not unlock another', async () => {
      await vaultService.addSecret('secret_a', 'value-a');
      await vaultService.addSecret('secret_b', 'value-b');

      // Approve access to secret_a only.
      const res = await request(makeApp()).get('/secrets/secret_a').set(auth);
      expect(res.status).toBe(200);

      // The vault must NOT consider secret_b approved off the back of secret_a.
      expect(vaultService.isApproved('secret_b')).toBe(false);
      expect(vaultService.isApproved('secret_a')).toBe(true);
    });
  });

  describe('Test routes', () => {
    test('are disabled by default (no ENABLE_TEST_ROUTES)', async () => {
      const res = await request(makeApp())
        .post('/test/grant-approval')
        .set(auth)
        .send({ duration: 300 });
      expect(res.status).toBe(404);
    });
  });
});
