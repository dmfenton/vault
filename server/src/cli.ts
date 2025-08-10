#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BootstrapService } from './services/BootstrapService';
import fetch from 'node-fetch';
import * as readline from 'readline/promises';

const program = new Command();

program
  .name('vault-cli')
  .description('Vault CLI for bootstrap and management operations')
  .version('2.0.0');

/**
 * Bootstrap command for initial setup
 */
program
  .command('bootstrap')
  .description('Initialize vault with bootstrap tokens')
  .option('-d, --data-dir <dir>', 'Data directory', './vault-data')
  .action(async (options) => {
    console.log('🔐 Vault Bootstrap Setup\n');
    
    const bootstrapService = new BootstrapService(options.dataDir);
    await bootstrapService.initialize();
    
    // Generate all bootstrap tokens
    console.log('Generating bootstrap tokens...\n');
    
    // 1. Startup token for server restarts
    await bootstrapService.generateStartupToken();
    
    // 2. Recovery codes for emergency access
    await bootstrapService.generateRecoveryCodes();
    
    // 3. Pairing token for initial phone setup
    await bootstrapService.generatePairingToken();
    
    console.log('\n✅ Bootstrap setup complete!');
    console.log('\nNext steps:');
    console.log('1. Start the vault server: npm run server:start');
    console.log('2. Enter the pairing token in your mobile app');
    console.log('3. Save the recovery codes in a secure location');
  });

/**
 * Unlock command for server restarts
 */
program
  .command('unlock')
  .description('Unlock vault after server restart')
  .option('-t, --token <token>', 'Startup token')
  .option('-f, --file <file>', 'Read token from file')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
  .action(async (options) => {
    try {
      let token = options.token;
      
      // Read token from file if specified
      if (options.file) {
        const tokenData = await fs.readFile(options.file, 'utf-8');
        const parsed = JSON.parse(tokenData);
        token = parsed.token;
      }
      
      // Prompt for token if not provided
      if (!token) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        token = await rl.question('Enter startup token: ');
        rl.close();
      }
      
      // Send unlock request
      const response = await fetch(`${options.server}/bootstrap/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log('✅', result.message);
        console.log(`⏱️  ${result.note}`);
      } else {
        console.error('❌', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Failed to unlock vault:', error);
      process.exit(1);
    }
  });

/**
 * Recover command for emergency access
 */
program
  .command('recover')
  .description('Emergency vault access using recovery code')
  .option('-c, --code <code>', 'Recovery code')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
  .action(async (options) => {
    try {
      let code = options.code;
      
      // Prompt for code if not provided
      if (!code) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        code = await rl.question('Enter recovery code (XXXX-XXXX-XXXX): ');
        rl.close();
      }
      
      // Send recovery request
      const response = await fetch(`${options.server}/bootstrap/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log('✅', result.message);
        console.log('⚠️ ', result.warning);
        console.log(`⏱️  ${result.note}`);
      } else {
        console.error('❌', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('Failed to recover vault:', error);
      process.exit(1);
    }
  });

/**
 * Status command to check vault status
 */
program
  .command('status')
  .description('Check vault status')
  .option('-s, --server <url>', 'Server URL', 'http://localhost:3000')
  .action(async (options) => {
    try {
      const response = await fetch(`${options.server}/health`);
      const status = await response.json();
      
      console.log('🔐 Vault Status\n');
      console.log(`Status: ${status.status === 'healthy' ? '✅ Healthy' : '❌ Unhealthy'}`);
      console.log(`Vault initialized: ${status.vault.initialized ? 'Yes' : 'No'}`);
      console.log(`Secrets count: ${status.vault.secretCount}`);
      console.log(`Vault approved: ${status.vault.approved ? 'Yes' : 'No'}`);
      console.log(`Phone connected: ${status.notification.connected ? 'Yes' : 'No'}`);
      
      if (status.vault.approvalStatus) {
        const approval = status.vault.approvalStatus;
        if (approval.expiresAt) {
          const expires = new Date(approval.expiresAt);
          const remaining = Math.floor((expires.getTime() - Date.now()) / 1000);
          console.log(`Approval expires in: ${remaining} seconds`);
        }
      }
    } catch (error) {
      console.error('Failed to get vault status:', error);
      process.exit(1);
    }
  });

/**
 * Init command for first-time setup
 */
program
  .command('init')
  .description('Initialize vault for first-time use')
  .option('-d, --data-dir <dir>', 'Data directory', './vault-data')
  .action(async (options) => {
    console.log('🚀 Initializing Vault System\n');
    
    // Create data directory
    await fs.mkdir(options.dataDir, { recursive: true });
    await fs.chmod(options.dataDir, 0o700);
    
    // Initialize bootstrap service
    const bootstrapService = new BootstrapService(options.dataDir);
    await bootstrapService.initialize();
    
    console.log('📁 Created data directory:', options.dataDir);
    
    // Generate initial tokens
    console.log('\n🔑 Generating initial access tokens...\n');
    
    const { token: startupToken } = await bootstrapService.generateStartupToken();
    const recoveryCodes = await bootstrapService.generateRecoveryCodes();
    
    // Save initialization info
    const initInfo = {
      initialized: new Date().toISOString(),
      dataDir: options.dataDir,
      startupTokenPath: path.join(options.dataDir, 'bootstrap', '.startup-token')
    };
    
    await fs.writeFile(
      path.join(options.dataDir, '.vault-init'),
      JSON.stringify(initInfo, null, 2)
    );
    
    console.log('\n✅ Vault initialized successfully!\n');
    console.log('IMPORTANT: Save the recovery codes shown above in a secure location!');
    console.log('\nTo start the vault server:');
    console.log('  npm run server:start\n');
    console.log('To unlock after restart:');
    console.log(`  vault-cli unlock --token ${startupToken}\n`);
    console.log('To pair your phone:');
    console.log('  1. Start the server');
    console.log('  2. Run: vault-cli bootstrap');
    console.log('  3. Enter the pairing token in your mobile app');
  });

program.parse();