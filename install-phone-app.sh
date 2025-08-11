#!/bin/bash

# Automatic Phone App Installer
# Detects connected phone and installs vault app

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}         VAULT PHONE APP INSTALLER${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo ""

# Get server IP (cross-platform)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    SERVER_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
else
    # Linux
    SERVER_IP=$(hostname -I | awk '{print $1}')
fi
echo -e "${GREEN}✓${NC} Server IP: ${SERVER_IP}"
echo ""

# Function to check command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}✗${NC} $1 is not installed"
        return 1
    else
        echo -e "${GREEN}✓${NC} $1 is installed"
        return 0
    fi
}

# Navigate to client directory (relative path)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/client"

# Update app with server IP
echo -e "${BLUE}Configuring app with server IP...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS requires backup extension with -i
    sed -i '' "s|ws://[0-9.]*:3001|ws://${SERVER_IP}:3001|g" App.tsx
else
    # Linux
    sed -i "s|ws://[0-9.]*:3001|ws://${SERVER_IP}:3001|g" App.tsx
fi
echo -e "${GREEN}✓${NC} App configured for ${SERVER_IP}"
echo ""

# Check for Android device
echo -e "${BLUE}Checking for Android device...${NC}"
if check_command adb; then
    ANDROID_DEVICES=$(adb devices | grep -v "List" | grep "device" | wc -l)
    
    if [ $ANDROID_DEVICES -gt 0 ]; then
        echo -e "${GREEN}✓${NC} Android device detected!"
        DEVICE_INFO=$(adb devices | grep "device$" | head -1)
        echo "   Device: $DEVICE_INFO"
        
        # Check if it's an emulator or physical device
        if echo "$DEVICE_INFO" | grep -q "emulator"; then
            echo "   Type: Emulator"
            DEVICE_TYPE="emulator"
        else
            echo "   Type: Physical Device"
            DEVICE_TYPE="physical"
            
            # Get device model
            MODEL=$(adb shell getprop ro.product.model 2>/dev/null | tr -d '\r\n' || echo "Unknown")
            echo "   Model: $MODEL"
        fi
        
        echo ""
        echo -e "${BLUE}Installing on Android device...${NC}"
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            echo "Installing dependencies..."
            npm install
        fi
        
        # Reverse ports for physical device
        if [ "$DEVICE_TYPE" = "physical" ]; then
            echo "Setting up port forwarding..."
            adb reverse tcp:3000 tcp:3000
            adb reverse tcp:3001 tcp:3001
            adb reverse tcp:8081 tcp:8081
            echo -e "${GREEN}✓${NC} Ports forwarded"
        fi
        
        # Start Metro bundler in background
        echo "Starting Metro bundler..."
        npx react-native start --reset-cache > /tmp/metro.log 2>&1 &
        METRO_PID=$!
        sleep 5
        
        # Build and install
        echo -e "${YELLOW}Building and installing app...${NC}"
        echo "This may take a few minutes on first run..."
        echo ""
        
        # Run the app
        npx react-native run-android --variant=debug
        
        INSTALL_SUCCESS=$?
        
        # Kill Metro bundler
        kill $METRO_PID 2>/dev/null || true
        
        if [ $INSTALL_SUCCESS -eq 0 ]; then
            echo ""
            echo -e "${GREEN}════════════════════════════════════════════════${NC}"
            echo -e "${GREEN}    ✓ APP INSTALLED SUCCESSFULLY!${NC}"
            echo -e "${GREEN}════════════════════════════════════════════════${NC}"
            echo ""
            echo "The VaultApprover app should now be open on your phone!"
            echo ""
            echo -e "${BLUE}Next steps:${NC}"
            echo "1. On your phone: Tap 'Connect to Vault'"
            echo "2. If first time: Tap 'Initialize & Pair'"
            echo "3. Your phone is now the vault authenticator!"
            echo ""
            echo -e "${BLUE}Test it:${NC}"
            echo "curl http://${SERVER_IP}:3000/secrets/DB_PASSWORD"
            echo ""
        else
            echo -e "${RED}Installation failed. Check error messages above.${NC}"
            exit 1
        fi
        
        exit 0
    else
        echo -e "${YELLOW}No Android device detected${NC}"
    fi
else
    echo -e "${YELLOW}ADB not installed - can't check for Android devices${NC}"
    echo "Install with: sudo apt-get install android-tools-adb"
fi

echo ""

# Check for iOS device (requires Mac)
echo -e "${BLUE}Checking for iOS device...${NC}"
if [[ "$OSTYPE" == "darwin"* ]]; then
    if check_command xcrun; then
        # List iOS devices
        IOS_DEVICES=$(xcrun xctrace list devices 2>&1 | grep -E "iPhone|iPad" | grep -v "Simulator" | head -1)
        
        if [ ! -z "$IOS_DEVICES" ]; then
            echo -e "${GREEN}✓${NC} iOS device detected!"
            echo "   Device: $IOS_DEVICES"
            echo ""
            echo -e "${BLUE}Installing on iOS device...${NC}"
            
            # Install dependencies
            if [ ! -d "node_modules" ]; then
                echo "Installing dependencies..."
                npm install
            fi
            
            # Install pods
            echo "Installing CocoaPods dependencies..."
            cd ios && pod install && cd ..
            
            # Build and run
            echo -e "${YELLOW}Building and installing app...${NC}"
            echo "This may take a few minutes on first run..."
            echo ""
            
            npx react-native run-ios --device
            
            echo ""
            echo -e "${GREEN}════════════════════════════════════════════════${NC}"
            echo -e "${GREEN}    ✓ APP INSTALLED ON iOS DEVICE!${NC}"
            echo -e "${GREEN}════════════════════════════════════════════════${NC}"
            
            exit 0
        else
            echo -e "${YELLOW}No iOS device detected${NC}"
            echo "Make sure your iPhone is:"
            echo "  1. Connected via USB"
            echo "  2. Trusted this computer"
            echo "  3. Developer mode enabled (iOS 16+)"
        fi
    fi
else
    echo -e "${YELLOW}iOS installation requires macOS${NC}"
fi

echo ""

# No device found - offer alternatives
echo -e "${YELLOW}════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}           NO PHONE DETECTED${NC}"
echo -e "${YELLOW}════════════════════════════════════════════════${NC}"
echo ""
echo "Please check:"
echo ""
echo -e "${BLUE}For Android:${NC}"
echo "  1. Enable Developer Mode:"
echo "     Settings > About > Tap 'Build Number' 7 times"
echo "  2. Enable USB Debugging:"
echo "     Settings > Developer Options > USB Debugging"
echo "  3. Connect phone via USB"
echo "  4. Tap 'Allow' on phone when prompted"
echo "  5. Run: adb devices"
echo ""
echo -e "${BLUE}For iOS (Mac only):${NC}"
echo "  1. Connect iPhone via USB"
echo "  2. Trust this computer on iPhone"
echo "  3. Open Xcode once to set up development"
echo ""
echo -e "${BLUE}Alternative: Use an emulator${NC}"
echo ""
echo "Android:"
echo "  1. Open Android Studio"
echo "  2. AVD Manager > Create/Start emulator"
echo "  3. Run this script again"
echo ""
echo "iOS:"
echo "  1. Run: npx react-native run-ios"
echo "  2. Uses iOS Simulator automatically"
echo ""
echo -e "${BLUE}Manual installation:${NC}"
echo "  cd ${SCRIPT_DIR}/client"
echo "  npx react-native run-android  # For Android"
echo "  npx react-native run-ios      # For iOS"