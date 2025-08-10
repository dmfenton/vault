#!/bin/bash

# Vault Test Script - Complete flow test
# This script tests the entire vault system using curl

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3000"
WS_URL="ws://localhost:3001"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

check_response() {
    if [ $? -eq 0 ]; then
        log_success "$1"
    else
        log_error "$1 failed"
        exit 1
    fi
}

# Start of tests
echo "================================================"
echo "         VAULT SYSTEM TEST SUITE"
echo "================================================"
echo ""

# Test 1: Check health
log_info "Test 1: Checking vault health..."
HEALTH=$(curl -s "$API_URL/health")
echo "$HEALTH" | jq '.'
check_response "Health check"

# Test 2: Check pairing status
log_info "Test 2: Checking pairing status..."
PAIRING_STATUS=$(curl -s "$API_URL/pairing/status")
echo "$PAIRING_STATUS" | jq '.'
IS_FIRST_RUN=$(echo "$PAIRING_STATUS" | jq -r '.firstRun')
PHONE_CONNECTED=$(echo "$PAIRING_STATUS" | jq -r '.phoneConnected')

if [ "$IS_FIRST_RUN" = "true" ]; then
    log_warn "This is first run - vault needs initialization"
    
    # Test 3: Initialize vault with first pairing
    log_info "Test 3: Initializing vault with phone pairing..."
    PAIRING_RESPONSE=$(curl -s -X POST "$API_URL/pairing/connect" \
        -H "Content-Type: application/json" \
        -d '{
            "deviceInfo": {
                "platform": "test-script",
                "version": "1.0.0",
                "deviceName": "Test Device"
            }
        }')
    
    echo "$PAIRING_RESPONSE" | jq '.'
    SUCCESS=$(echo "$PAIRING_RESPONSE" | jq -r '.success')
    
    if [ "$SUCCESS" = "true" ]; then
        log_success "Vault initialized and paired!"
    else
        log_error "Failed to initialize vault"
        exit 1
    fi
else
    log_info "Vault already initialized"
    
    if [ "$PHONE_CONNECTED" = "false" ]; then
        log_warn "No phone connected - attempting to pair..."
        PAIRING_RESPONSE=$(curl -s -X POST "$API_URL/pairing/connect" \
            -H "Content-Type: application/json" \
            -d '{
                "deviceInfo": {
                    "platform": "test-script",
                    "version": "1.0.0",
                    "deviceName": "Test Device"
                }
            }')
        echo "$PAIRING_RESPONSE" | jq '.'
    fi
fi

# Test 4: Add a secret (no approval needed)
log_info "Test 4: Adding a test secret..."
ADD_SECRET=$(curl -s -X POST "$API_URL/secrets" \
    -H "Content-Type: application/json" \
    -d '{
        "key": "TEST_SECRET",
        "value": "super-secret-value-123"
    }')

echo "$ADD_SECRET" | jq '.'
check_response "Add secret"

# Test 5: List secrets (no approval needed)
log_info "Test 5: Listing all secrets..."
LIST_SECRETS=$(curl -s "$API_URL/secrets")
echo "$LIST_SECRETS" | jq '.'
check_response "List secrets"

# Test 6: Try to get secret value (needs approval)
log_info "Test 6: Attempting to retrieve secret value (will need approval)..."
log_warn "This will fail without phone approval - expected behavior"

GET_SECRET=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$API_URL/secrets/TEST_SECRET")
HTTP_STATUS=$(echo "$GET_SECRET" | grep "HTTP_STATUS" | cut -d: -f2)
RESPONSE_BODY=$(echo "$GET_SECRET" | sed '/HTTP_STATUS/d')

echo "$RESPONSE_BODY" | jq '.'

if [ "$HTTP_STATUS" = "403" ] || [ "$HTTP_STATUS" = "408" ]; then
    log_success "Secret access properly denied without approval (expected)"
else
    log_warn "Unexpected response status: $HTTP_STATUS"
fi

# Test 7: Check audit log
log_info "Test 7: Checking audit log..."
AUDIT_LOG=$(curl -s "$API_URL/audit?limit=5")
echo "$AUDIT_LOG" | jq '.'
check_response "Audit log"

# Test 8: Generate recovery codes (if approved)
log_info "Test 8: Attempting to generate recovery codes..."
log_warn "This requires approval - will fail if not approved"

RECOVERY_CODES=$(curl -s -X POST "$API_URL/bootstrap/generate-recovery-codes")
echo "$RECOVERY_CODES" | jq '.'

# Test 9: Update secret
log_info "Test 9: Updating secret value..."
UPDATE_SECRET=$(curl -s -X PUT "$API_URL/secrets/TEST_SECRET" \
    -H "Content-Type: application/json" \
    -d '{
        "value": "updated-secret-value-456"
    }')

echo "$UPDATE_SECRET" | jq '.'
check_response "Update secret"

# Test 10: Delete secret
log_info "Test 10: Deleting test secret..."
DELETE_SECRET=$(curl -s -X DELETE "$API_URL/secrets/TEST_SECRET")
echo "$DELETE_SECRET" | jq '.'
check_response "Delete secret"

# Test 11: Check vault metrics
log_info "Test 11: Final health check with metrics..."
FINAL_HEALTH=$(curl -s "$API_URL/health")
echo "$FINAL_HEALTH" | jq '.'

# Summary
echo ""
echo "================================================"
echo "              TEST SUMMARY"
echo "================================================"

VAULT_INITIALIZED=$(echo "$FINAL_HEALTH" | jq -r '.vault.initialized')
SECRET_COUNT=$(echo "$FINAL_HEALTH" | jq -r '.vault.secretCount')
VAULT_APPROVED=$(echo "$FINAL_HEALTH" | jq -r '.vault.approved')
NOTIFICATION_CONNECTED=$(echo "$FINAL_HEALTH" | jq -r '.notification.connected')

echo -e "Vault Initialized: ${GREEN}$VAULT_INITIALIZED${NC}"
echo -e "Secret Count: ${BLUE}$SECRET_COUNT${NC}"
echo -e "Vault Approved: $([ "$VAULT_APPROVED" = "true" ] && echo -e "${GREEN}Yes${NC}" || echo -e "${YELLOW}No${NC}")"
echo -e "Phone Connected: $([ "$NOTIFICATION_CONNECTED" = "true" ] && echo -e "${GREEN}Yes${NC}" || echo -e "${YELLOW}No${NC}")"

echo ""
log_success "All basic tests completed!"

echo ""
echo "================================================"
echo "           ADVANCED TEST OPTIONS"
echo "================================================"
echo ""
echo "To test approval flow:"
echo "1. Connect mobile app to ws://$(hostname -I | awk '{print $1}'):3001"
echo "2. Run: curl $API_URL/secrets/SOME_KEY"
echo "3. Approve on phone"
echo ""
echo "To test recovery:"
echo "1. Generate recovery codes (needs approval):"
echo "   curl -X POST $API_URL/bootstrap/generate-recovery-codes"
echo "2. Stop service: sudo systemctl stop vault-server"
echo "3. Start service: sudo systemctl start vault-server"
echo "4. Unlock with recovery code:"
echo "   curl -X POST $API_URL/bootstrap/recover -d '{\"token\":\"XXXX-XXXX-XXXX\"}'"
echo ""
echo "To test key rotation:"
echo "   curl -X POST $API_URL/rotate-key"
echo "   (Requires phone approval)"
echo ""