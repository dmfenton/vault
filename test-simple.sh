#!/bin/bash

# Simple vault test - all with curl, no phone needed

set -e

API="http://localhost:3000"

echo "=== VAULT TEST ==="
echo ""

# 1. Check status
echo "1. Checking pairing status..."
curl -s "$API/pairing/status" | jq '.'
echo ""

# 2. If first run, initialize by pairing
STATUS=$(curl -s "$API/pairing/status")
FIRST_RUN=$(echo "$STATUS" | jq -r '.firstRun')

if [ "$FIRST_RUN" = "true" ]; then
    echo "2. First run detected - initializing vault..."
    curl -s -X POST "$API/pairing/connect" \
        -H "Content-Type: application/json" \
        -d '{
            "deviceInfo": {
                "platform": "curl-test",
                "version": "1.0.0",
                "deviceName": "Test Script"
            }
        }' | jq '.'
    echo "✅ Vault initialized!"
else
    echo "2. Vault already initialized"
fi
echo ""

# 3. Add a secret (no approval needed)
echo "3. Adding a secret..."
curl -s -X POST "$API/secrets" \
    -H "Content-Type: application/json" \
    -d '{
        "key": "API_KEY",
        "value": "secret-value-123"
    }' | jq '.'
echo ""

# 4. List secrets (no approval needed)
echo "4. Listing secrets..."
curl -s "$API/secrets" | jq '.'
echo ""

# 5. Update secret (no approval needed)
echo "5. Updating secret..."
curl -s -X PUT "$API/secrets/API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "value": "updated-value-456"
    }' | jq '.'
echo ""

# 6. Check health
echo "6. Health check..."
curl -s "$API/health" | jq '.'
echo ""

# 7. Check audit log
echo "7. Audit log (last 3 entries)..."
curl -s "$API/audit?limit=3" | jq '.'
echo ""

# 8. Delete secret
echo "8. Deleting secret..."
curl -s -X DELETE "$API/secrets/API_KEY" | jq '.'
echo ""

echo "=== TEST COMPLETE ==="
echo ""
echo "Note: Getting secret values requires phone approval."
echo "To test that flow, you'd need to:"
echo "1. Connect a WebSocket client to ws://localhost:3001"
echo "2. Send approval response when requested"