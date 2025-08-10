# Simple Vault Setup Guide

## Quick Start (First Time)

1. **Start the server:**
```bash
cd vault/server
npm install
npm run dev
```

2. **Start the mobile app:**
```bash
# In another terminal
cd vault/client
npm install

# iOS
npm run ios

# Android
npm run android
```

3. **Connect & Initialize:**
- Open the mobile app
- Tap "Connect to Vault"
- When prompted "Initialize Vault?", tap "Initialize & Pair"
- ✅ Done! Your vault is now initialized and your phone is paired

## How It Works

### First Run (No Master Key)
- Server starts without a master key
- First phone to connect initializes the vault
- Master key is generated and saved automatically
- Phone becomes the primary authentication device

### Normal Operation
- Phone approval required for sensitive operations
- Vault locks when server restarts
- Phone reconnects automatically

### After Server Restart
The vault locks for security, but your phone can unlock it:

1. Start the server
2. Open mobile app
3. Tap "Connect to Vault"
4. Vault unlocks automatically with phone connection

## Emergency Recovery

If you lose your phone or need emergency access:

### Option 1: Generate Recovery Codes (Recommended)
While your phone is connected:
```bash
# Generate recovery codes
curl -X POST http://localhost:3000/bootstrap/generate-recovery-codes
```
Save these codes securely!

### Option 2: Use Recovery Code
If you have a recovery code:
```bash
npm run cli recover --code XXXX-XXXX-XXXX
```
This gives you 30 minutes to pair a new phone.

### Option 3: Reset Everything (Last Resort)
⚠️ **This deletes all secrets!**
```bash
rm -rf ./vault-data
# Start over with step 1
```

## API Endpoints

### Check Status
```bash
curl http://localhost:3000/pairing/status
```

Response:
```json
{
  "firstRun": false,
  "initialized": true,
  "phoneConnected": true,
  "status": "ready"
}
```

### Manual Pairing (if needed)
```bash
curl -X POST http://localhost:3000/pairing/connect \
  -H "Content-Type: application/json" \
  -d '{
    "deviceInfo": {
      "platform": "ios",
      "version": "1.0.0",
      "deviceName": "My iPhone"
    }
  }'
```

## Troubleshooting

### "Initialize Vault?" doesn't appear
- Check server is running on port 3000
- Verify server URL in app settings (default: ws://localhost:3001)

### Can't connect after restart
- Make sure vault data directory exists
- Check server logs for errors
- Try manual unlock with recovery code

### Lost phone and no recovery codes
- If vault has no important data: delete `./vault-data` and start fresh
- If vault has important data: you'll need the original phone

## Security Notes

- Master key is generated on first pairing
- Stored with 0600 permissions (owner only)
- Phone approval required for all sensitive operations
- Vault locks automatically on server restart
- Recovery codes are one-time use only

## Development Tips

### Local Network Access
To connect from a real phone:
1. Find your computer's IP: `ifconfig` or `ipconfig`
2. In mobile app settings, set server URL to: `ws://YOUR_IP:3001`
3. Ensure firewall allows ports 3000 and 3001

### Reset for Testing
```bash
# Clear all vault data
rm -rf ./vault-data

# Server will be in first-run state again
npm run dev
```

## Summary

The simplified flow:
1. **First run**: Just connect your phone - it initializes everything
2. **Normal use**: Phone approves sensitive operations
3. **After restart**: Phone reconnects and unlocks
4. **Emergency**: Use recovery codes

No CLI commands needed for basic operation!