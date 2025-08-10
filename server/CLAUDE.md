# Claude Development Guide

This document provides context and guidance for Claude or other AI assistants working on this codebase.

## Project Overview

This is a secure vault server written in TypeScript that requires phone approval for accessing encrypted secrets. It emphasizes:
- **Type Safety**: Strict TypeScript throughout
- **Security**: Multiple layers of validation and encryption
- **Testing**: Comprehensive test coverage
- **Clean Architecture**: Separation of concerns with clear interfaces

## Key Design Decisions

### 1. TypeScript Strict Mode
- All code uses strict TypeScript settings
- No `any` types except where absolutely necessary
- Comprehensive type definitions in `src/types/index.ts`

### 2. Validation Strategy
- Zod for runtime validation at API boundaries
- Custom validation in services for business logic
- Path traversal protection at multiple layers

### 3. Approval System
- Phone approval required for sensitive operations
- Time-limited and one-time approval modes
- Approval state managed in memory, not persisted

### 4. Error Handling
- Custom error classes for different scenarios
- Consistent error responses via middleware
- No stack traces in production

## File Structure

```
src/
├── types/          # TypeScript type definitions
├── services/       # Core business logic
├── routes/         # Express route handlers
├── middleware/     # Express middleware
├── app.ts         # Express app setup
└── server.ts      # Server entry point

tests/             # Jest test files
```

## Development Guidelines

### Adding New Features

1. **Start with Types**: Define interfaces in `src/types/index.ts`
2. **Write Tests First**: TDD approach in `tests/`
3. **Implement Service**: Business logic in `src/services/`
4. **Add Routes**: HTTP endpoints in `src/routes/`
5. **Update Documentation**: README.md and inline JSDoc

### Security Checklist

When modifying security-sensitive code:
- [ ] Input validation with Zod schemas
- [ ] Path traversal protection
- [ ] Size limits enforced
- [ ] Audit logging added
- [ ] Error messages don't leak sensitive info
- [ ] File permissions set correctly (0600)

### Testing Requirements

- Unit tests for all services
- Integration tests for API endpoints
- Security tests for validation
- Minimum 80% code coverage

## Common Tasks

### Adding a New Secret Operation

1. Add operation type to `ApprovalType` enum
2. Update `IVaultService` interface
3. Implement in `VaultService` class
4. Add route handler
5. Write tests
6. Update audit logging

### Modifying Approval Flow

1. Update `ApprovalRequest`/`ApprovalResponse` types
2. Modify `NotificationService.requestApproval()`
3. Update phone message format
4. Test timeout and error cases

### Adding New Validation

1. Define Zod schema in `src/types/index.ts`
2. Use `validateBody()` middleware in route
3. Add test cases for valid/invalid inputs
4. Update API documentation

## Performance Considerations

- Secrets are cached in memory while approved
- Audit log limited to 10,000 entries
- Message queue limited to 100 items
- Rate limiting: 100 requests/minute per IP

## Security Notes

### Encryption
- AES-256-GCM with authentication tags
- Master key rotated with re-encryption
- Keys stored with 0600 permissions

### Approval Security
- Approvals expire after timeout
- One-time approvals revoked after use
- All approvals cleared on vault lock

### Input Security
- Zod validation at API layer
- Additional validation in services
- Path traversal blocked: `..`, `/`, `\`
- Control characters blocked

## Testing Strategy

### Unit Tests
- Mock file system for VaultService
- Mock WebSocket for NotificationService
- Test error conditions thoroughly

### Integration Tests
- Real services with temp directories
- Test full approval flow
- Verify audit logging

### Security Tests
- Injection attempts
- Path traversal attempts
- Large payload handling
- Concurrent access

## Debugging Tips

1. **Enable Debug Logging**: Set `LOG_LEVEL=debug`
2. **Check Audit Log**: `GET /audit` endpoint
3. **Monitor WebSocket**: Chrome DevTools WS tab
4. **Test Approval**: Use mock notification service

## Common Issues

### "Approval required" errors
- Check if vault is locked: `GET /health`
- Verify phone connection in health check
- Check approval expiry time

### WebSocket disconnections
- Check firewall/proxy settings
- Verify port 3001 is open
- Check for rate limiting

### Key rotation failures
- Ensure approval is granted
- Check disk space for backups
- Verify file permissions

## Future Improvements

- [ ] Multi-phone support
- [ ] Hardware security module (HSM) integration
- [ ] Distributed vault with consensus
- [ ] Shamir secret sharing
- [ ] FIDO2/WebAuthn support
- [ ] Kubernetes operator
- [ ] Prometheus metrics
- [ ] OpenTelemetry tracing

## Environment-Specific Notes

### Development
- Hot reload with `tsx watch`
- Verbose logging enabled
- Relaxed rate limits

### Production
- Compiled JavaScript in `dist/`
- Minimal logging
- Strict rate limits
- TLS required

## Commands Reference

```bash
# Development
npm run dev           # Start with hot reload
npm run test         # Run tests with watch
npm run typecheck    # Check types without building

# Production
npm run build        # Compile TypeScript
npm start           # Run compiled server

# Utilities
npm run lint        # ESLint checks
npm run test:once   # Single test run with coverage
```

## Contact

For architectural decisions or security concerns, please document thoroughly in pull requests and update this guide as needed.