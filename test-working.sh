#!/bin/bash

# Working vault test with existing endpoints

API="http://localhost:3000"

echo "=== VAULT TEST (EXISTING ENDPOINTS) ==="
echo ""

# 1. Health check
echo "1. Health Check:"
curl -s "$API/health" | jq '.status, .vault.initialized, .vault.secretCount'
echo ""

# 2. Pairing status
echo "2. Pairing Status:"
curl -s "$API/pairing/status" | jq '.'
echo ""

# 3. Add secrets
echo "3. Adding Secrets:"
curl -s -X POST "$API/secrets" \
    -H "Content-Type: application/json" \
    -d '{"key": "DB_PASSWORD", "value": "secret123"}' | jq '.'
    
curl -s -X POST "$API/secrets" \
    -H "Content-Type: application/json" \
    -d '{"key": "API_TOKEN", "value": "token456"}' | jq '.'
echo ""

# 4. List secrets
echo "4. List Secrets:"
curl -s "$API/secrets" | jq '.'
echo ""

# 5. Update a secret
echo "5. Update Secret:"
curl -s -X PUT "$API/secrets/DB_PASSWORD" \
    -H "Content-Type: application/json" \
    -d '{"value": "newsecret789"}' | jq '.'
echo ""

# 6. Delete a secret
echo "6. Delete Secret:"
curl -s -X DELETE "$API/secrets/API_TOKEN" | jq '.'
echo ""

# 7. Final status
echo "7. Final Status:"
curl -s "$API/health" | jq '.'
echo ""

echo "=== TEST COMPLETE ==="
echo ""
echo "Note: Secret retrieval requires phone approval."
echo "To test approval flow:"
echo "1. Use bootstrap system for temporary access"
echo "2. Or connect a real/mock phone app"