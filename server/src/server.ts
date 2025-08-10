#!/usr/bin/env node

import 'dotenv/config';
import { createApp } from './app';
import { VaultService } from './services/VaultService';
import { NotificationService } from './services/NotificationService';
import { BootstrapService } from './services/BootstrapService';
import WebSocket from 'ws';
import { createServer } from 'http';

async function startServer(): Promise<void> {
  console.log('🔐 Starting Vault Server (TypeScript Edition)...');
  
  const dataDir = process.env.VAULT_DATA_DIR || './vault-data';
  
  // Initialize services
  const vaultService = new VaultService({
    vaultPath: dataDir,
    autoSave: true
  });
  
  const notificationService = new NotificationService({
    phoneId: process.env.PHONE_ID || 'default-phone',
    serverUrl: process.env.SERVER_URL || 'http://localhost:3000'
  });
  
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
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('📱 Phone connected');
    
    // Replace notification service websocket with the new connection
    (notificationService as any).websocket = ws;
    (notificationService as any).connected = true;
    
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        (notificationService as any).handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('📱 Phone disconnected');
      (notificationService as any).handleDisconnect();
    });
  });
  
  // Connect notification service
  console.log('📡 Setting up notification service...');
  await notificationService.connect();
  
  // Create Express app
  const app = createApp({ vaultService, notificationService, bootstrapService });
  
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