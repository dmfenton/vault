#!/bin/bash

# Test approval flow - simulate phone with curl and websocat
# Requires: websocat (or we can use a simple Node.js script)

set -e

API="http://localhost:3000"

echo "=== APPROVAL FLOW TEST ==="
echo ""

# First, let's create a simple Node.js WebSocket client to simulate phone
cat > /tmp/mock-phone.js << 'EOF'
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
    console.log('📱 Mock phone connected');
    
    // Register as phone
    ws.send(JSON.stringify({
        type: 'register',
        clientType: 'phone',
        platform: 'mock',
        version: '1.0.0'
    }));
});

ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log('📨 Received:', message.type);
    
    if (message.type === 'approval_request') {
        console.log('✅ Auto-approving request:', message.request.id);
        
        // Auto-approve after 1 second
        setTimeout(() => {
            ws.send(JSON.stringify({
                type: 'approval_response',
                requestId: message.request.id,
                approved: true,
                duration: 300, // 5 minutes
                oneTime: false
            }));
            console.log('✅ Approval sent');
        }, 1000);
    }
});

ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
});

// Keep running for 30 seconds
setTimeout(() => {
    console.log('📱 Mock phone disconnecting');
    ws.close();
    process.exit(0);
}, 30000);
EOF

echo "1. Starting mock phone in background..."
node /tmp/mock-phone.js &
PHONE_PID=$!
sleep 2

echo ""
echo "2. Adding a test secret..."
curl -s -X POST "$API/secrets" \
    -H "Content-Type: application/json" \
    -d '{
        "key": "PROTECTED_SECRET",
        "value": "this-needs-approval-to-read"
    }' | jq '.'

echo ""
echo "3. Attempting to get secret (will trigger approval)..."
echo "   Mock phone will auto-approve in 1 second..."
SECRET_RESPONSE=$(curl -s "$API/secrets/PROTECTED_SECRET")
echo "$SECRET_RESPONSE" | jq '.'

echo ""
echo "4. Testing key rotation with approval..."
ROTATE_RESPONSE=$(curl -s -X POST "$API/rotate-key")
echo "$ROTATE_RESPONSE" | jq '.'

echo ""
echo "5. Cleaning up..."
curl -s -X DELETE "$API/secrets/PROTECTED_SECRET" | jq '.'

# Kill mock phone
kill $PHONE_PID 2>/dev/null || true

echo ""
echo "=== APPROVAL TEST COMPLETE ==="