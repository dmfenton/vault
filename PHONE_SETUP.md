# Phone App Setup Guide

## Quick Start

Your vault server is running at: **192.168.4.65**

## Option 1: iOS Device

### Requirements
- Mac computer with Xcode
- iPhone (or iOS Simulator)
- Same WiFi network as server

### Steps

1. **On your Mac**, open Terminal and run:
```bash
# Clone the repo (if not already)
git clone [your-repo-url]
cd vault/client

# Install dependencies
npm install
cd ios && pod install && cd ..

# Run the app
npx react-native run-ios
```

2. **App will open** on simulator/device

3. **First launch**:
   - App shows "Disconnected"
   - Tap "Connect to Vault"
   - If first time, tap "Initialize & Pair"
   - Vault is now initialized!

4. **Settings** (if needed):
   - Tap ⚙️ icon
   - Server URL should be: `ws://192.168.4.65:3001`
   - Save and reconnect

## Option 2: Android Device

### Requirements
- Android Studio installed
- Android phone (or emulator)
- USB cable (for device) or emulator running

### Steps

1. **Enable Developer Mode** on phone:
   - Settings > About Phone
   - Tap "Build Number" 7 times
   - Enable USB Debugging in Developer Options

2. **Connect phone** via USB or start emulator

3. **On your computer**, run:
```bash
cd vault/client

# Install dependencies
npm install

# For physical device
adb reverse tcp:3000 tcp:3000
adb reverse tcp:3001 tcp:3001

# Run the app
npx react-native run-android
```

4. **App launches** - follow same connection steps as iOS

## Option 3: Development Testing (No Phone)

For testing without a real phone, from your computer:

```bash
# Check server is running
curl http://192.168.4.65:3000/health

# Simulate phone pairing
curl -X POST http://192.168.4.65:3000/pairing/connect \
  -H "Content-Type: application/json" \
  -d '{
    "deviceInfo": {
      "platform": "test",
      "version": "1.0.0",
      "deviceName": "Test Device"
    }
  }'
```

## Using the Phone App

### Main Features

1. **Connection Status**
   - Green dot = Connected
   - Red dot = Disconnected

2. **Approval Requests**
   When someone tries to access a secret:
   - Phone vibrates (if enabled)
   - Request card appears showing:
     - What's being requested
     - From which computer/IP
     - Secret key name

3. **Approval Options**
   - **One-time access**: Toggle on = single use only
   - **Time limit**: Default 5 minutes (configurable)
   - **Approve**: Green button - grants access
   - **Deny**: Red button - blocks access

4. **Settings** (⚙️ icon)
   - Server URL configuration
   - Auto-reconnect toggle
   - Vibration alerts
   - Default time limits

## Testing the Flow

1. **Add a secret** (from your computer):
```bash
curl -X POST http://192.168.4.65:3000/secrets \
  -H "Content-Type: application/json" \
  -d '{"key": "TEST_SECRET", "value": "secret-value"}'
```

2. **Try to read it**:
```bash
curl http://192.168.4.65:3000/secrets/TEST_SECRET
```

3. **On your phone**:
   - Approval request appears!
   - Shows "Secret Access" request
   - Tap "Approve"

4. **The curl command** completes and shows the secret value!

## Troubleshooting

### "Can't connect to server"
- Check phone and server are on same WiFi
- Verify server IP: `hostname -I`
- Check firewall: `sudo ufw status`
- Allow ports: `sudo ufw allow 3000 && sudo ufw allow 3001`

### "Initialize Vault?" doesn't appear
- Server may already be initialized
- Check: `curl http://192.168.4.65:3000/pairing/status`
- If `firstRun: false`, vault is already initialized

### Android connection issues
```bash
# Make sure adb sees your device
adb devices

# Forward ports
adb reverse tcp:3000 tcp:3000
adb reverse tcp:3001 tcp:3001

# Check logs
adb logcat | grep ReactNative
```

### iOS build errors
```bash
# Clean and rebuild
cd ios
pod deintegrate
pod install
cd ..
npx react-native run-ios
```

## Advanced: Push Notifications

To enable push notifications:

### iOS (APNs)
1. Need Apple Developer account
2. Create push certificate
3. Configure in Xcode

### Android (FCM)
1. Create Firebase project
2. Add google-services.json to android/app/
3. Get FCM server key
4. Set in server: `FCM_SERVER_KEY=your-key`

## Security Notes

- Phone approval required for:
  - Reading secret values
  - Key rotation
  - Vault export

- No approval needed for:
  - Adding secrets
  - Updating secrets
  - Deleting secrets
  - Listing secret names

- After server restart:
  - Vault locks automatically
  - Phone reconnects and unlocks
  - Or use bootstrap token for emergency access

## Summary

1. **Server IP**: 192.168.4.65
2. **WebSocket Port**: 3001
3. **API Port**: 3000
4. **Default approval**: 5 minutes
5. **One-time option**: Available per request

Your vault is now secured with phone approval!