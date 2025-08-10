# 🔐 Secure Vault Server (TypeScript)

A strongly-typed, secure secret management server requiring phone approval for all sensitive operations. Built with TypeScript for maximum type safety and developer experience.

## ✨ Features

- **🔒 End-to-End Encryption**: AES-256-GCM encryption for all secrets
- **📱 Phone Approval Required**: Real-time approval via WebSocket connection
- **⚡ Type Safety**: Full TypeScript with strict typing throughout
- **🔄 Key Rotation**: Secure key rotation with automatic backups
- **📊 Audit Logging**: Comprehensive audit trail for all operations
- **⏰ Time-Limited Access**: Grant temporary or one-time access
- **🚦 Rate Limiting**: Built-in protection against abuse
- **🛡️ Security First**: Path traversal protection, input validation, secure key storage

## 🚀 Quick Start

### Prerequisites

- Node.js 22+ 
- npm or yarn
- Unix-like OS (Linux/macOS) for proper file permissions

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/vault-server-ts.git
cd vault-server-ts

# Install dependencies
npm install

# Build TypeScript
npm run build

# Copy environment variables
cp .env.example .env
```

### Running the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm start

# Run tests
npm test
```

## 📱 Phone App Integration

The server expects a phone app to connect via WebSocket on port 3001. When approval is needed:

1. Server sends approval request with metadata
2. Phone app displays request to user
3. User approves/denies with optional time limit
4. Server grants/denies access based on response

### WebSocket Message Types

```typescript
// Approval Request (Server → Phone)
{
  type: "approval_request",
  id: "uuid",
  title: "🔐 Secret Access Request",
  body: "Host: server1\nSecret: api_key\nIP: 192.168.1.1",
  timestamp: "2024-01-01T00:00:00Z",
  metadata: { ... }
}

// Approval Response (Phone → Server)
{
  type: "approval_response", 
  requestId: "uuid",
  approved: true,
  duration: 3600,  // seconds (optional)
  oneTime: false,  // one-time use (optional)
  reason: "..."    // denial reason (optional)
}
```

## 🔧 Configuration

### Environment Variables

```env
# Server Configuration
PORT=3000
WS_PORT=3001
VAULT_PATH=/etc/vault

# Security
NODE_ENV=production
LOG_LEVEL=info

# Phone Configuration
PHONE_ID=my-phone-uuid
SERVER_URL=https://vault.example.com
```

### Type Definitions

The project includes comprehensive TypeScript definitions:

- `ApprovalType` - Types of approval requests
- `AuditEventType` - Audit event categories  
- `NotificationType` - Notification types
- `IVaultService` - Vault service interface
- `INotificationService` - Notification service interface

## 📚 API Documentation

### Secret Management

```typescript
// Add secret
POST /secrets
{
  key: string,  // alphanumeric + underscore/dash only
  value: string // max 1MB
}

// Get secret (requires approval)
GET /secrets/:key

// Update secret  
PUT /secrets/:key
{
  value: string
}

// Delete secret
DELETE /secrets/:key

// List all keys
GET /secrets
```

### Vault Operations

```typescript
// Health check
GET /health

// Rotate encryption key (requires approval)
POST /rotate-key

// Lock vault immediately
POST /lock

// Get audit log
GET /audit?from=date&to=date&page=1&limit=100

// Export vault metadata (requires approval)
POST /export
```

## 🏗️ Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Phone     │────▶│  WebSocket   │────▶│   Vault     │
│   App       │◀────│   Server     │◀────│  Service    │
└─────────────┘     └──────────────┘     └─────────────┘
                           │                     │
                           ▼                     ▼
                    ┌──────────────┐     ┌─────────────┐
                    │ Notification │     │  Encrypted  │
                    │   Service    │     │   Storage   │
                    └──────────────┘     └─────────────┘
```

### Key Components

- **VaultService**: Handles encryption, secret storage, and approval management
- **NotificationService**: Manages WebSocket communication with phone
- **Routes**: Express routes with Zod validation
- **Middleware**: Error handling, validation, rate limiting
- **Types**: Comprehensive TypeScript definitions

## 🔒 Security

### Encryption

- **Algorithm**: AES-256-GCM with authentication
- **Key Storage**: Master key with 0600 permissions
- **Key Rotation**: Automatic re-encryption with backup
- **Memory**: Secrets cached in memory only while approved

### Validation

- **Input**: Zod schemas for all inputs
- **Keys**: Alphanumeric + underscore/dash only
- **Size**: 1MB max secret size, 255 char max key length
- **Path Traversal**: Blocked at validation layer

### Approval Flow

1. Client requests secret access
2. Server sends approval request to phone
3. User reviews request metadata (host, IP, timestamp)
4. User approves with time limit or denies
5. Server grants temporary access or rejects

## 🧪 Testing

```bash
# Run all tests with coverage
npm test

# Run specific test file
npm test VaultService.test.ts

# Run with watch mode
npm run test:watch
```

### Test Coverage

- ✅ VaultService: Encryption, approval, rotation, persistence
- ✅ NotificationService: WebSocket, queue, rate limiting
- ✅ API Routes: All endpoints with validation
- ✅ Security: Path traversal, injection, size limits

## 🚀 Production Deployment

### Recommendations

1. **Use HTTPS/WSS**: Always use TLS in production
2. **Separate User**: Run service as dedicated user
3. **File Permissions**: Ensure vault files are 0600
4. **Monitoring**: Set up alerts for failed approvals
5. **Backups**: Regular encrypted backups of vault
6. **Rate Limiting**: Adjust limits based on usage
7. **Audit Retention**: Configure audit log rotation

### Systemd Service

```ini
[Unit]
Description=Secure Vault Server
After=network.target

[Service]
Type=simple
User=vault
Group=vault
WorkingDirectory=/opt/vault-server
ExecStart=/usr/bin/node /opt/vault-server/dist/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

## 📄 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Write tests first (TDD)
4. Implement feature with types
5. Ensure all tests pass
6. Submit pull request

## 🐛 Known Issues

- WebSocket reconnection can be flaky
- Rate limiting needs per-endpoint configuration
- No multi-phone support yet

## 📞 Support

For issues, questions, or contributions, please visit:
https://github.com/yourusername/vault-server-ts

---

Built with ❤️ and TypeScript for maximum security and type safety.