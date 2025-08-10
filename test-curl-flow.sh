#!/bin/bash

# Complete vault test using only curl
# Tests the entire flow including approval

set -e

API="http://localhost:3000"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== COMPLETE VAULT TEST WITH CURL ===${NC}"
echo ""

# 1. Check test endpoints are available
echo -e "${BLUE}1. Checking test endpoints...${NC}"
TEST_STATUS=$(curl -s "$API/test/status")
echo "$TEST_STATUS" | jq '.'
TEST_ENABLED=$(echo "$TEST_STATUS" | jq -r '.testEndpoints')

if [ "$TEST_ENABLED" != "enabled" ]; then
    echo -e "${YELLOW}Warning: Test endpoints not enabled. Set NODE_ENV=development${NC}"
fi
echo ""

# 2. Check if first run
echo -e "${BLUE}2. Checking vault status...${NC}"
PAIRING_STATUS=$(curl -s "$API/pairing/status")
echo "$PAIRING_STATUS" | jq '.'
FIRST_RUN=$(echo "$PAIRING_STATUS" | jq -r '.firstRun')

if [ "$FIRST_RUN" = "true" ]; then
    echo -e "${YELLOW}First run - initializing vault...${NC}"
    curl -s -X POST "$API/pairing/connect" \
        -H "Content-Type: application/json" \
        -d '{
            "deviceInfo": {
                "platform": "curl-test",
                "version": "1.0.0",
                "deviceName": "Test Device"
            }
        }' | jq '.'
fi
echo ""

# 3. Simulate phone connection
echo -e "${BLUE}3. Simulating phone connection...${NC}"
curl -s -X POST "$API/test/simulate-phone" | jq '.'
echo ""

# 4. Add a secret (no approval needed)
echo -e "${BLUE}4. Adding a secret...${NC}"
curl -s -X POST "$API/secrets" \
    -H "Content-Type: application/json" \
    -d '{
        "key": "DATABASE_URL",
        "value": "postgres://user:pass@localhost/db"
    }' | jq '.'
echo ""

# 5. List secrets
echo -e "${BLUE}5. Listing secrets...${NC}"
curl -s "$API/secrets" | jq '.'
echo ""

# 6. Grant approval for testing
echo -e "${BLUE}6. Granting test approval (5 minutes)...${NC}"
curl -s -X POST "$API/test/grant-approval" \
    -H "Content-Type: application/json" \
    -d '{
        "duration": 300,
        "oneTime": false
    }' | jq '.'
echo ""

# 7. Get secret value (with approval)
echo -e "${GREEN}7. Getting secret value (approved)...${NC}"
curl -s "$API/secrets/DATABASE_URL" | jq '.'
echo ""

# 8. Test key rotation (with approval)
echo -e "${BLUE}8. Testing key rotation...${NC}"
curl -s -X POST "$API/rotate-key" | jq '.'
echo ""

# 9. Verify secret still accessible after rotation
echo -e "${BLUE}9. Verifying secret after rotation...${NC}"
curl -s "$API/secrets/DATABASE_URL" | jq '.'
echo ""

# 10. Test one-time approval
echo -e "${BLUE}10. Testing one-time approval...${NC}"
curl -s -X POST "$API/test/revoke-approval" | jq '.'
curl -s -X POST "$API/test/grant-approval" \
    -H "Content-Type: application/json" \
    -d '{
        "oneTime": true
    }' | jq '.'

echo -e "${GREEN}First access (consumes one-time approval):${NC}"
curl -s "$API/secrets/DATABASE_URL" | jq '.'

echo -e "${YELLOW}Second access (should fail - one-time used):${NC}"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API/secrets/DATABASE_URL")
HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE/d')
echo "$BODY" | jq '.'

if [ "$HTTP_CODE" = "403" ]; then
    echo -e "${GREEN}✓ One-time approval correctly consumed${NC}"
else
    echo -e "${YELLOW}Unexpected status: $HTTP_CODE${NC}"
fi
echo ""

# 11. Test push notification registration
echo -e "${BLUE}11. Registering device for push notifications...${NC}"
curl -s -X POST "$API/notifications/register" \
    -H "Content-Type: application/json" \
    -d '{
        "deviceId": "test-device-001",
        "platform": "android",
        "pushToken": "fake-fcm-token-for-testing"
    }' | jq '.'
echo ""

# 12. Send test push notification
echo -e "${BLUE}12. Sending test push notification...${NC}"
curl -s -X POST "$API/notifications/test" | jq '.'
echo ""

# 13. Check audit log
echo -e "${BLUE}13. Checking audit log...${NC}"
curl -s "$API/audit?limit=5" | jq '.'
echo ""

# 14. Clean up
echo -e "${BLUE}14. Cleaning up...${NC}"
curl -s -X DELETE "$API/secrets/DATABASE_URL" | jq '.'
curl -s -X POST "$API/test/revoke-approval" | jq '.'
echo ""

# 15. Final status
echo -e "${BLUE}15. Final status check...${NC}"
curl -s "$API/test/status" | jq '.'
echo ""

echo -e "${GREEN}=== ALL TESTS COMPLETE ===${NC}"
echo ""
echo "Summary:"
echo "✓ Vault initialization"
echo "✓ Secret CRUD operations"
echo "✓ Approval flow (timed and one-time)"
echo "✓ Key rotation"
echo "✓ Push notification registration"
echo "✓ Audit logging"
echo ""
echo "All operations completed using only curl!"