import { randomBytes, createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface BootstrapToken {
  token: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
  type: 'pairing' | 'recovery' | 'startup';
  metadata?: Record<string, any>;
}

export class BootstrapService {
  private tokens: Map<string, BootstrapToken> = new Map();
  private bootstrapDir: string;
  private startupTokenPath: string;
  private recoveryCodesPath: string;
  
  constructor(dataDir: string = './vault-data') {
    this.bootstrapDir = path.join(dataDir, 'bootstrap');
    this.startupTokenPath = path.join(this.bootstrapDir, '.startup-token');
    this.recoveryCodesPath = path.join(this.bootstrapDir, '.recovery-codes');
  }
  
  async initialize(): Promise<void> {
    // Create bootstrap directory
    await fs.mkdir(this.bootstrapDir, { recursive: true });
    
    // Set restrictive permissions
    await fs.chmod(this.bootstrapDir, 0o700);
    
    // Load any persistent tokens
    await this.loadStartupToken();
  }
  
  /**
   * Generate a one-time pairing token for initial phone setup
   */
  async generatePairingToken(): Promise<{ token: string; expires: Date }> {
    const token = this.generateSecureToken();
    const expires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    this.tokens.set(token, {
      token,
      createdAt: new Date(),
      expiresAt: expires,
      used: false,
      type: 'pairing'
    });
    
    console.log('\n════════════════════════════════════════════════════════');
    console.log('                    PAIRING TOKEN                       ');
    console.log('════════════════════════════════════════════════════════');
    console.log(`Token: ${token}`);
    console.log(`Expires: ${expires.toLocaleTimeString()}`);
    console.log('--------------------------------------------------------');
    console.log('Enter this token in your mobile app to pair');
    console.log('════════════════════════════════════════════════════════\n');
    
    return { token, expires };
  }
  
  /**
   * Generate a startup token that persists across restarts
   */
  async generateStartupToken(): Promise<{ token: string; path: string }> {
    const token = this.generateSecureToken();
    const tokenData = {
      token,
      createdAt: new Date().toISOString(),
      type: 'startup'
    };
    
    // Write to file with restrictive permissions
    await fs.writeFile(
      this.startupTokenPath,
      JSON.stringify(tokenData, null, 2),
      { mode: 0o600 }
    );
    
    console.log('\n════════════════════════════════════════════════════════');
    console.log('                   STARTUP TOKEN                        ');
    console.log('════════════════════════════════════════════════════════');
    console.log(`Token saved to: ${this.startupTokenPath}`);
    console.log(`Token: ${token}`);
    console.log('--------------------------------------------------------');
    console.log('Use this token to unlock vault after restart:');
    console.log(`  curl -X POST http://localhost:3000/bootstrap/unlock \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"token": "${token}"}'`);
    console.log('════════════════════════════════════════════════════════\n');
    
    return { token, path: this.startupTokenPath };
  }
  
  /**
   * Generate recovery codes for emergency access
   */
  async generateRecoveryCodes(): Promise<string[]> {
    const codes: string[] = [];
    const hashedCodes: string[] = [];
    
    for (let i = 0; i < 10; i++) {
      const code = this.generateRecoveryCode();
      codes.push(code);
      hashedCodes.push(this.hashToken(code));
    }
    
    // Store hashed versions
    await fs.writeFile(
      this.recoveryCodesPath,
      JSON.stringify({
        generated: new Date().toISOString(),
        codes: hashedCodes,
        used: []
      }, null, 2),
      { mode: 0o600 }
    );
    
    console.log('\n════════════════════════════════════════════════════════');
    console.log('                  RECOVERY CODES                        ');
    console.log('════════════════════════════════════════════════════════');
    console.log('SAVE THESE CODES IN A SECURE LOCATION!');
    console.log('Each code can only be used once.');
    console.log('--------------------------------------------------------');
    codes.forEach((code, i) => {
      console.log(`  ${i + 1}.  ${code}`);
    });
    console.log('════════════════════════════════════════════════════════\n');
    
    return codes;
  }
  
  /**
   * Validate a bootstrap token
   */
  async validateToken(token: string, type?: 'pairing' | 'recovery' | 'startup'): Promise<boolean> {
    // Check in-memory tokens
    const tokenData = this.tokens.get(token);
    if (tokenData) {
      if (tokenData.used) return false;
      if (tokenData.expiresAt < new Date()) return false;
      if (type && tokenData.type !== type) return false;
      
      tokenData.used = true;
      return true;
    }
    
    // Check startup token
    if (type === 'startup' || !type) {
      const startupValid = await this.validateStartupToken(token);
      if (startupValid) return true;
    }
    
    // Check recovery codes
    if (type === 'recovery' || !type) {
      const recoveryValid = await this.validateRecoveryCode(token);
      if (recoveryValid) return true;
    }
    
    return false;
  }
  
  /**
   * Validate the persistent startup token
   */
  private async validateStartupToken(token: string): Promise<boolean> {
    try {
      const data = await fs.readFile(this.startupTokenPath, 'utf-8');
      const tokenData = JSON.parse(data);
      
      if (tokenData.token === token) {
        // Optionally regenerate after use for security
        await this.generateStartupToken();
        return true;
      }
    } catch (error) {
      // File doesn't exist or is invalid
    }
    return false;
  }
  
  /**
   * Validate a recovery code
   */
  private async validateRecoveryCode(code: string): Promise<boolean> {
    try {
      const data = await fs.readFile(this.recoveryCodesPath, 'utf-8');
      const recoveryData = JSON.parse(data);
      const hashedCode = this.hashToken(code);
      
      // Check if code exists and hasn't been used
      const codeIndex = recoveryData.codes.indexOf(hashedCode);
      if (codeIndex !== -1 && !recoveryData.used.includes(hashedCode)) {
        // Mark as used
        recoveryData.used.push(hashedCode);
        await fs.writeFile(
          this.recoveryCodesPath,
          JSON.stringify(recoveryData, null, 2),
          { mode: 0o600 }
        );
        
        console.log(`Recovery code used. ${recoveryData.codes.length - recoveryData.used.length} codes remaining.`);
        return true;
      }
    } catch (error) {
      // File doesn't exist or is invalid
    }
    return false;
  }
  
  /**
   * Load startup token on service initialization
   */
  private async loadStartupToken(): Promise<void> {
    try {
      const data = await fs.readFile(this.startupTokenPath, 'utf-8');
      const tokenData = JSON.parse(data);
      
      // Add to in-memory tokens with no expiration
      this.tokens.set(tokenData.token, {
        token: tokenData.token,
        createdAt: new Date(tokenData.createdAt),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        used: false,
        type: 'startup'
      });
    } catch (error) {
      // No startup token exists yet
    }
  }
  
  /**
   * Generate a secure random token
   */
  private generateSecureToken(): string {
    return randomBytes(32).toString('base64url');
  }
  
  /**
   * Generate a human-friendly recovery code
   */
  private generateRecoveryCode(): string {
    const bytes = randomBytes(6);
    const code = bytes.toString('hex').toUpperCase();
    // Format as XXXX-XXXX-XXXX
    return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`;
  }
  
  /**
   * Hash a token for storage
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  
  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens(): void {
    const now = new Date();
    for (const [token, data] of this.tokens.entries()) {
      if (data.expiresAt < now || data.used) {
        this.tokens.delete(token);
      }
    }
  }
}