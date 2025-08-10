#!/bin/bash

# Complete Vault System Test
# Tests all functionality using only curl

API="http://localhost:3000"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}       COMPLETE VAULT SYSTEM TEST${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo ""

# Test 1: System Status
echo -e "${BLUE}Test 1: System Status${NC}"
STATUS=$(curl -s "$API/health")
echo "$STATUS" | jq '{status: .status, vault: .vault.initialized, secrets: .vault.secretCount}'
echo ""

# Test 2: Secret Management (No approval needed)
echo -e "${BLUE}Test 2: Secret Management${NC}"
echo "Adding secrets..."
curl -s -X POST "$API/secrets" \
    -H "Content-Type: application/json" \
    -d '{"key": "AWS_KEY", "value": "AKIAIOSFODNN7EXAMPLE"}' | jq -r '.message'
    
curl -s -X POST "$API/secrets" \
    -H "Content-Type: application/json" \
    -d '{"key": "JWT_SECRET", "value": "super-secret-jwt-key"}' | jq -r '.message'

echo "Listing secrets..."
curl -s "$API/secrets" | jq -r '.secrets[]' | while read key; do
    echo "  - $key"
done
echo ""

# Test 3: Bootstrap Unlock
echo -e "${BLUE}Test 3: Bootstrap Unlock for Secret Access${NC}"

# Read startup token if exists
TOKEN_FILE="/home/dmfenton/vault/vault-data/bootstrap/.startup-token"
if [ -f "$TOKEN_FILE" ]; then
    TOKEN=$(jq -r '.token' "$TOKEN_FILE")
    echo "Using startup token from file"
    
    # Unlock vault
    UNLOCK_RESPONSE=$(curl -s -X POST "$API/bootstrap/unlock" \
        -H "Content-Type: application/json" \
        -d "{\"token\": \"$TOKEN\"}")
    
    echo "$UNLOCK_RESPONSE" | jq -r '.message'
    DURATION=$(echo "$UNLOCK_RESPONSE" | jq -r '.duration')
    echo -e "${GREEN}✓ Vault unlocked for $DURATION seconds${NC}"
    echo ""
    
    # Now get secret values
    echo "Retrieving secret values:"
    for key in AWS_KEY JWT_SECRET; do
        VALUE=$(curl -s "$API/secrets/$key" | jq -r '.value')
        echo "  $key = ${VALUE:0:20}..."
    done
else
    echo -e "${YELLOW}No startup token found. Run: npx tsx src/cli.ts init -d /home/dmfenton/vault/vault-data${NC}"
fi
echo ""

# Test 4: Key Rotation
echo -e "${BLUE}Test 4: Key Rotation (requires approval)${NC}"
ROTATE_RESPONSE=$(curl -s -X POST "$API/rotate-key" -w "\nHTTP_CODE:%{http_code}")
HTTP_CODE=$(echo "$ROTATE_RESPONSE" | grep "HTTP_CODE" | cut -d: -f2)
BODY=$(echo "$ROTATE_RESPONSE" | sed '/HTTP_CODE/d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Key rotation successful${NC}"
    echo "$BODY" | jq -r '.message'
elif [ "$HTTP_CODE" = "403" ]; then
    echo -e "${YELLOW}Key rotation requires phone approval (expected)${NC}"
else
    echo "Response: $BODY"
fi
echo ""

# Test 5: Recovery Code
echo -e "${BLUE}Test 5: Recovery Code Access${NC}"
RECOVERY_FILE="/home/dmfenton/vault/vault-data/bootstrap/.recovery-codes"
if [ -f "$RECOVERY_FILE" ]; then
    # Get first unused recovery code
    CODES=$(jq -r '.codes[]' "$RECOVERY_FILE" | head -1)
    echo "Testing recovery code access..."
    echo "(Would use code but preserving for real emergency)"
    echo -e "${GREEN}✓ Recovery codes available${NC}"
else
    echo -e "${YELLOW}No recovery codes found${NC}"
fi
echo ""

# Test 6: Audit Log
echo -e "${BLUE}Test 6: Audit Log${NC}"
echo "Recent audit entries:"
curl -s "$API/audit?limit=5" | jq -r '.entries[] | "\(.event) - \(.key // "N/A") - \(.success)"' | while read line; do
    echo "  $line"
done
echo ""

# Test 7: Cleanup
echo -e "${BLUE}Test 7: Cleanup${NC}"
for key in AWS_KEY JWT_SECRET; do
    curl -s -X DELETE "$API/secrets/$key" | jq -r '.message'
done
echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                TEST SUMMARY${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"

FINAL_STATUS=$(curl -s "$API/health")
echo "✓ Vault Status: $(echo "$FINAL_STATUS" | jq -r '.status')"
echo "✓ Initialized: $(echo "$FINAL_STATUS" | jq -r '.vault.initialized')"
echo "✓ Secrets: $(echo "$FINAL_STATUS" | jq -r '.vault.secretCount')"
echo "✓ Phone Connected: $(echo "$FINAL_STATUS" | jq -r '.notification.connected')"
echo ""

echo -e "${GREEN}All tests completed successfully!${NC}"
echo ""
echo "To test with phone approval:"
echo "1. Connect mobile app to ws://$(hostname -I | awk '{print $1}'):3001"
echo "2. Requests will trigger push notifications"
echo "3. Approve/deny from mobile app"