#!/usr/bin/env node

import 'dotenv/config';
import { createApp } from './app';
import { VaultService } from './services/VaultService';
import { NotificationService } from './services/NotificationService';
import { BootstrapService } from './services/BootstrapService';
import { PushNotificationService } from './services/PushNotificationService';
import { safeEqual } from './middleware/auth';
import WebSocket from 'ws';
import { createServer } from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Resolve the API/WebSocket auth token. Prefers VAULT_API_TOKEN from the
 * environment; otherwise loads a persisted token from the data dir, generating
 * (and printing) a new one on first run.
 */
async function resolveApiToken(dataDir: string): Promise<string> {
  if (process.env.VAULT_API_TOKEN) {
    return process.env.VAULT_API_TOKEN;
  }

  const tokenPath = path.join(dataDir, 'api-token');
  try {
    const existing = await fs.readFile(tokenPath, 'utf8');
    const trimmed = existing.trim();
    if (trimmed) {
      return trimmed;
    }
  } catch {
    // No persisted token yet — fall through to generate one.
  }

  const token = crypto.randomBytes(32).toString('base64url');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(tokenPath, token, { mode: 0o600 });
  if (process.platform !== 'win32') {
    const fsSync = await import('fs');
    fsSync.chmodSync(tokenPath, 0o600);
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log('                  API ACCESS TOKEN                      ');
  console.log('════════════════════════════════════════════════════════');
  console.log(`Token: ${token}`);
  console.log(`Saved to: ${tokenPath}`);
  console.log('Send it as:  Authorization: Bearer <token>');
  console.log('WebSocket:   ws://host:3001/?token=<token>');
  console.log('Override with the VAULT_API_TOKEN env var.');
  console.log('════════════════════════════════════════════════════════\n');

  return token;
}

async function startServer(): Promise<void> {
  console.log('🔐 Starting Vault Server (TypeScript Edition)...');

  const dataDir = process.env.VAULT_DATA_DIR || './vault-data';

  // Resolve the auth token used for HTTP (Bearer) and WebSocket connections.
  const apiToken = await resolveApiToken(dataDir);

  // Initialize services
  const vaultService = new VaultService({
    vaultPath: dataDir,
    autoSave: true
  });

  const notificationService = new NotificationService({
    phoneId: process.env.PHONE_ID || 'default-phone',
    serverUrl: process.env.SERVER_URL || 'http://localhost:3000'
  });

  // Optional end-to-end message signing between server and phone.
  if (process.env.VAULT_WS_SHARED_SECRET) {
    notificationService.enableSignatureValidation(process.env.VAULT_WS_SHARED_SECRET);
    console.log('🔏 WebSocket message signature validation enabled');
  }

  const pushService = new PushNotificationService();

  const bootstrapService = new BootstrapService(dataDir);
  
  // Initialize vault and bootstrap
  console.log('📁 Initializing vault...');
  await vaultService.initialize();
  await bootstrapService.initialize();
  console.log(`✅ Vault initialized with ${vaultService.getSecretCount()} secrets`);
  
  // Check if this is first run
  if (vaultService.getSecretCount() === 0 && !notificationService.isConnected()) {
    console.log('\n⚠️  First run detected! No phone connected.');
    console.log('Run one of the following:');
    console.log('  1. vault-cli init     - Complete initialization with recovery codes');
    console.log('  2. vault-cli bootstrap - Generate pairing token for phone');
    console.log('  3. vault-cli unlock   - Use startup token if you have one\n');
  }
  
  // Setup WebSocket server for phone connections
  const wsPort = parseInt(process.env.WS_PORT || '3001');
  const wss = new WebSocket.Server({ port: wsPort });
  console.log(`📱 WebSocket server listening on port ${wsPort}`);
  
  wss.on('connection', (ws: WebSocket, req) => {
    // Authenticate the WebSocket connection. Only a client presenting the API
    // token may act as the approving phone — this is what prevents an attacker
    // from connecting and approving their own secret-access requests.
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const providedToken = requestUrl.searchParams.get('token') || '';
    if (!safeEqual(providedToken, apiToken)) {
      console.warn('🚫 Rejected unauthenticated WebSocket connection from', req.socket.remoteAddress);
      ws.close(4401, 'Unauthorized');
      return;
    }

    console.log('📱 Phone connected (authenticated)');

    // Bind the authenticated socket into the notification service. These members
    // are internal to NotificationService; access them through a typed view.
    const internal = notificationService as unknown as {
      websocket: WebSocket;
      connected: boolean;
      handleMessage(message: unknown): void;
      handleDisconnect(): void;
    };
    internal.websocket = ws;
    internal.connected = true;

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        internal.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    ws.on('close', () => {
      console.log('📱 Phone disconnected');
      internal.handleDisconnect();
    });
  });
  
  // Connect notification service
  console.log('📡 Setting up notification service...');
  await notificationService.connect();
  
  // Create Express app
  const app = createApp({ vaultService, notificationService, bootstrapService, pushService, apiToken });
  
  // Start HTTP server
  const port = parseInt(process.env.PORT || '3000');
  const server = createServer(app);
  
  server.listen(port, () => {
    console.log(`✅ Vault server running on port ${port}`);
    console.log(`📍 Health check: http://localhost:${port}/health`);
    console.log('\n🔒 Server is ready. Secrets are encrypted and require phone approval to access.');
  });
  
  // Event logging
  vaultService.on('approval_granted', (status) => {
    console.log(`🔓 Vault unlocked ${status.oneTime ? '(one-time)' : `for ${status.duration}s`}`);
  });
  
  vaultService.on('approval_revoked', () => {
    console.log('🔒 Vault locked');
  });
  
  vaultService.on('secret_added', ({ key }) => {
    console.log(`➕ Secret added: ${key}`);
  });
  
  vaultService.on('secret_deleted', ({ key }) => {
    console.log(`➖ Secret deleted: ${key}`);
  });
  
  vaultService.on('key_rotated', ({ secretCount }) => {
    console.log(`🔄 Key rotated for ${secretCount} secrets`);
  });
  
  notificationService.on('error', (error: Error) => {
    console.error('❌ Notification error:', error.message);
  });
  
  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
    
    // Lock vault
    vaultService.revokeApproval();
    
    // Save vault
    await vaultService.save();
    
    // Close connections
    notificationService.disconnect();
    wss.close();
    
    server.close(() => {
      console.log('✅ Server shut down');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('⚠️ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught exception:', error);
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
}

// Start the server
startServer().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});