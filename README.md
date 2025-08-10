# Vault - Secure Secrets Management with Phone Approval

A secure vault system that requires phone approval for accessing encrypted secrets. Features AES-256-GCM encryption, WebSocket real-time communication, and a React Native mobile app for approvals.

## 🏗️ Architecture

```
┌─────────────┐        ┌──────────────┐        ┌─────────────┐
│   Client    │◄──────►│ Vault Server │◄──────►│  Phone App  │
│ (API calls) │  HTTP  │   (Node.js)  │   WS   │(React Native)│
└─────────────┘        └──────────────┘        └─────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │   Encrypted  │
                       │   Storage    │
                       └──────────────┘
```

## ✨ Features

### Server
- 🔐 **AES-256-GCM encryption** with authentication tags
- 📱 **Phone approval system** via WebSocket
- ⏱️ **Time-limited access** (1 minute to 24 hours)
- 🔑 **One-time access** for single-use approvals
- 🔄 **Key rotation** with automatic re-encryption
- 📊 **Comprehensive audit logging**
- 🛡️ **Path traversal protection**
- 🚦 **Rate limiting** (100 requests/minute)
- 💪 **TypeScript** with strict typing

### Mobile App
- 📲 **Real-time notifications** via WebSocket
- ✅ **Approve/Deny interface** with request details
- ⚙️ **Configurable settings** (server URL, time limits)
- 📳 **Vibration alerts** for new requests
- 🔄 **Auto-reconnect** on connection loss
- 🎨 **Native UI** for iOS and Android

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- For mobile app:
  - iOS: Xcode 14+, CocoaPods
  - Android: Android Studio, Android SDK 33+

### Installation

```bash
# Clone the repository
git clone https://github.com/dmfenton/vault.git
cd vault

# Install all dependencies
npm install

# iOS only (for mobile app)
cd client/ios && pod install && cd ../..
```

### Running the System

#### 1. Start the Vault Server

```bash
# Development mode with hot reload
npm run server:dev

# Production mode
npm run server:build
npm run server:start
```

Server runs on:
- API: http://localhost:3000
- WebSocket: ws://localhost:3001

#### 2. Start the Mobile App

```bash
# iOS
npm run client:ios

# Android  
npm run client:android
```

#### 3. Configure Mobile App
1. Open the app
2. Tap the settings icon (⚙️)
3. Set server URL (e.g., `ws://192.168.1.100:3001` for network access)
4. Tap "Connect to Vault"

## 📖 Usage

### Adding a Secret

```bash
curl -X POST http://localhost:3000/secrets \
  -H "Content-Type: application/json" \
  -d '{"key": "API_KEY", "value": "secret123"}'
```

### Retrieving a Secret (Requires Phone Approval)

```bash
curl http://localhost:3000/secrets/API_KEY
```

1. Request appears on phone
2. Review details (hostname, IP, secret key)
3. Choose access type:
   - One-time access (single use)
   - Time-limited (1 min to 24 hours)
4. Approve or Deny

### Key Rotation

```bash
curl -X POST http://localhost:3000/rotate-key
```

Requires phone approval. All secrets are re-encrypted with new key.

## 🔒 Security Features

- **Encryption**: AES-256-GCM with authentication tags
- **Key Storage**: Master key stored with 0600 permissions
- **Validation**: Zod schemas for all inputs
- **Path Protection**: Blocks `..`, `/`, `\` in secret keys
- **Audit Trail**: All operations logged with timestamps
- **Rate Limiting**: 100 requests per minute per IP
- **Approval Expiry**: Time-limited and one-time approvals

## 📁 Project Structure

```
vault/
├── server/                 # TypeScript vault server
│   ├── src/
│   │   ├── types/         # TypeScript definitions
│   │   ├── services/      # Core business logic
│   │   ├── routes/        # API endpoints
│   │   ├── middleware/    # Express middleware
│   │   └── server.ts      # Entry point
│   ├── tests/             # Jest test suite
│   └── package.json
│
├── client/                # React Native mobile app
│   ├── App.tsx           # Main app component
│   ├── android/          # Android-specific files
│   ├── ios/              # iOS-specific files
│   └── package.json
│
└── package.json          # Root monorepo config
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Server tests only
npm run server:test

# Watch mode for development
cd server && npm run test
```

## 🚢 Deployment

### Server Deployment

1. Build the TypeScript code:
```bash
npm run server:build
```

2. Set environment variables:
```bash
export NODE_ENV=production
export PORT=3000
export WS_PORT=3001
```

3. Run with PM2 or systemd:
```bash
pm2 start server/dist/server.js --name vault-server
```

### Mobile App Deployment

#### iOS
```bash
cd client
npx react-native run-ios --configuration Release
```

#### Android
```bash
cd client/android
./gradlew assembleRelease
# APK at: android/app/build/outputs/apk/release/
```

## 🔧 Configuration

### Server Environment Variables

- `PORT` - API port (default: 3000)
- `WS_PORT` - WebSocket port (default: 3001)
- `NODE_ENV` - Environment (development/production)
- `VAULT_DIR` - Storage directory (default: ./vault-data)
- `LOG_LEVEL` - Logging verbosity (default: info)

### Mobile App Settings

Access settings in-app via the ⚙️ icon:
- Server URL
- Auto-reconnect toggle
- Vibration alerts
- Default time limits

## 📝 API Documentation

### Endpoints

| Method | Endpoint | Description | Requires Approval |
|--------|----------|-------------|-------------------|
| GET | `/health` | Health check | No |
| GET | `/secrets` | List all secret keys | No |
| POST | `/secrets` | Add new secret | No |
| GET | `/secrets/:key` | Get secret value | **Yes** |
| PUT | `/secrets/:key` | Update secret | No |
| DELETE | `/secrets/:key` | Delete secret | No |
| POST | `/rotate-key` | Rotate encryption key | **Yes** |
| POST | `/lock` | Lock vault immediately | No |
| GET | `/audit` | Get audit log | No |
| POST | `/export` | Export vault metadata | **Yes** |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔮 Future Enhancements

- [ ] Multi-phone support for consensus approval
- [ ] Hardware security module (HSM) integration
- [ ] Biometric authentication on mobile
- [ ] Shamir secret sharing
- [ ] FIDO2/WebAuthn support
- [ ] Kubernetes operator
- [ ] Prometheus metrics
- [ ] Certificate pinning for mobile app

## 🆘 Troubleshooting

### Server Issues
- Check audit log: `GET /audit`
- Verify health: `GET /health`
- Check file permissions on vault-data directory

### Mobile Connection Issues
- Ensure server WebSocket port (3001) is accessible
- For Android emulator: use `ws://10.0.2.2:3001`
- For iOS simulator: use `ws://localhost:3001`
- For real devices: use machine's network IP

### Phone Not Receiving Requests
- Check WebSocket connection status in app
- Verify firewall allows WebSocket traffic
- Check server health endpoint for notification service status

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Email: dmfenton@gmail.com