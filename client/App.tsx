import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';

interface ApprovalRequest {
  id: string;
  type: 'secret_access' | 'key_rotation' | 'vault_export';
  secretKey?: string;
  hostname: string;
  ipAddress: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

interface Config {
  serverUrl: string;
  autoReconnect: boolean;
  vibrate: boolean;
}

const App: React.FC = () => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [config, setConfig] = useState<Config>({
    serverUrl: 'ws://localhost:3001',
    autoReconnect: true,
    vibrate: true,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [timeLimit, setTimeLimit] = useState(300); // 5 minutes default
  const [oneTime, setOneTime] = useState(false);
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnecting(true);
    
    try {
      ws.current = new WebSocket(config.serverUrl);
      
      ws.current.onopen = () => {
        console.log('Connected to vault server');
        setConnected(true);
        setConnecting(false);
        
        // Register as phone client
        ws.current?.send(JSON.stringify({
          type: 'register',
          clientType: 'phone',
          platform: Platform.OS,
          version: '1.0.0'
        }));
      };

      ws.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received message:', message);
          
          if (message.type === 'approval_request') {
            setRequest(message.request);
            
            // Vibrate if enabled and supported
            if (config.vibrate && 'Vibration' in window) {
              (window as any).Vibration.vibrate([0, 200, 100, 200]);
            }
          } else if (message.type === 'notification') {
            Alert.alert(
              message.level.toUpperCase(),
              message.message,
              [{ text: 'OK' }]
            );
          }
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnecting(false);
      };

      ws.current.onclose = () => {
        console.log('Disconnected from vault server');
        setConnected(false);
        setConnecting(false);
        setRequest(null);
        
        // Auto-reconnect if enabled
        if (config.autoReconnect) {
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, 5000);
        }
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnecting(false);
      Alert.alert('Connection Error', 'Failed to connect to vault server');
    }
  };

  const disconnect = () => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }
    
    setConnected(false);
    setRequest(null);
  };

  const sendResponse = (approved: boolean, reason?: string) => {
    if (!ws.current || !request) return;
    
    const response = {
      type: 'approval_response',
      requestId: request.id,
      approved,
      duration: approved && !oneTime ? timeLimit : undefined,
      oneTime: approved ? oneTime : undefined,
      reason: !approved ? reason : undefined,
    };
    
    ws.current.send(JSON.stringify(response));
    setRequest(null);
    setOneTime(false); // Reset to default
  };

  const handleApprove = () => {
    sendResponse(true);
  };

  const handleDeny = () => {
    Alert.prompt(
      'Deny Access',
      'Reason for denial (optional):',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Deny', 
          style: 'destructive',
          onPress: (reason) => sendResponse(false, reason || 'Access denied by user')
        }
      ],
      'plain-text'
    );
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'secret_access': return '🔑 Secret Access';
      case 'key_rotation': return '🔄 Key Rotation';
      case 'vault_export': return '📤 Vault Export';
      default: return type;
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    return `${Math.floor(seconds / 3600)} hours`;
  };

  if (showSettings) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowSettings(false)}
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.settingGroup}>
            <Text style={styles.settingLabel}>Server URL</Text>
            <TextInput
              style={styles.input}
              value={config.serverUrl}
              onChangeText={(text) => setConfig({...config, serverUrl: text})}
              placeholder="ws://localhost:3001"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.settingHint}>
              WebSocket URL of your vault server
            </Text>
          </View>
          
          <View style={styles.settingGroup}>
            <View style={styles.switchRow}>
              <Text style={styles.settingLabel}>Auto-Reconnect</Text>
              <Switch
                value={config.autoReconnect}
                onValueChange={(value) => setConfig({...config, autoReconnect: value})}
              />
            </View>
            <Text style={styles.settingHint}>
              Automatically reconnect when connection is lost
            </Text>
          </View>
          
          <View style={styles.settingGroup}>
            <View style={styles.switchRow}>
              <Text style={styles.settingLabel}>Vibrate on Request</Text>
              <Switch
                value={config.vibrate}
                onValueChange={(value) => setConfig({...config, vibrate: value})}
              />
            </View>
            <Text style={styles.settingHint}>
              Vibrate when approval request is received
            </Text>
          </View>
          
          <View style={styles.settingGroup}>
            <Text style={styles.settingLabel}>Default Time Limit</Text>
            <View style={styles.timeLimitButtons}>
              <TouchableOpacity
                style={[styles.timeLimitButton, timeLimit === 60 && styles.selectedButton]}
                onPress={() => setTimeLimit(60)}
              >
                <Text style={styles.timeLimitButtonText}>1 min</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeLimitButton, timeLimit === 300 && styles.selectedButton]}
                onPress={() => setTimeLimit(300)}
              >
                <Text style={styles.timeLimitButtonText}>5 min</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeLimitButton, timeLimit === 900 && styles.selectedButton]}
                onPress={() => setTimeLimit(900)}
              >
                <Text style={styles.timeLimitButtonText}>15 min</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeLimitButton, timeLimit === 3600 && styles.selectedButton]}
                onPress={() => setTimeLimit(3600)}
              >
                <Text style={styles.timeLimitButtonText}>1 hour</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Vault Approver</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setShowSettings(true)}
        >
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.statusBar}>
        <View style={[styles.statusIndicator, connected ? styles.connected : styles.disconnected]} />
        <Text style={styles.statusText}>
          {connecting ? 'Connecting...' : connected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>
      
      {!connected && !connecting && (
        <View style={styles.centerContent}>
          <TouchableOpacity
            style={styles.connectButton}
            onPress={connect}
          >
            <Text style={styles.connectButtonText}>Connect to Vault</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {connecting && (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.connectingText}>Connecting to vault server...</Text>
        </View>
      )}
      
      {connected && !request && (
        <View style={styles.centerContent}>
          <Text style={styles.waitingText}>Waiting for approval requests...</Text>
          <Text style={styles.waitingSubtext}>You'll be notified when action is needed</Text>
        </View>
      )}
      
      {connected && request && (
        <ScrollView style={styles.content}>
          <View style={styles.requestCard}>
            <Text style={styles.requestType}>{getRequestTypeLabel(request.type)}</Text>
            <Text style={styles.requestTime}>
              {new Date(request.timestamp).toLocaleString()}
            </Text>
            
            <View style={styles.requestDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>From:</Text>
                <Text style={styles.detailValue}>{request.hostname}</Text>
              </View>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>IP Address:</Text>
                <Text style={styles.detailValue}>{request.ipAddress}</Text>
              </View>
              
              {request.secretKey && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Secret Key:</Text>
                  <Text style={[styles.detailValue, styles.secretKey]}>{request.secretKey}</Text>
                </View>
              )}
              
              {request.metadata && Object.keys(request.metadata).map((key) => (
                <View key={key} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{key}:</Text>
                  <Text style={styles.detailValue}>
                    {typeof request.metadata![key] === 'object' 
                      ? JSON.stringify(request.metadata![key]) 
                      : String(request.metadata![key])}
                  </Text>
                </View>
              ))}
            </View>
            
            <View style={styles.approvalOptions}>
              <View style={styles.switchRow}>
                <Text style={styles.optionLabel}>One-time access</Text>
                <Switch
                  value={oneTime}
                  onValueChange={setOneTime}
                />
              </View>
              
              {!oneTime && (
                <View style={styles.timeLimitSection}>
                  <Text style={styles.optionLabel}>Access duration:</Text>
                  <Text style={styles.timeLimitText}>{formatTime(timeLimit)}</Text>
                </View>
              )}
            </View>
            
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.denyButton]}
                onPress={handleDeny}
              >
                <Text style={styles.denyButtonText}>Deny</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={handleApprove}
              >
                <Text style={styles.approveButtonText}>Approve</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    padding: 5,
  },
  settingsButtonText: {
    fontSize: 24,
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  connected: {
    backgroundColor: '#4CAF50',
  },
  disconnected: {
    backgroundColor: '#f44336',
  },
  statusText: {
    fontSize: 14,
    color: '#666',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  connectButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
  },
  connectButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  connectingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },
  waitingText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 10,
  },
  waitingSubtext: {
    fontSize: 14,
    color: '#999',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  requestCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestType: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  requestTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 20,
  },
  requestDetails: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    width: 100,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  secretKey: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#f0f0f0',
    padding: 2,
    borderRadius: 4,
  },
  approvalOptions: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 15,
    marginBottom: 20,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  optionLabel: {
    fontSize: 16,
    color: '#333',
  },
  timeLimitSection: {
    marginTop: 10,
  },
  timeLimitText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    marginTop: 5,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  denyButton: {
    backgroundColor: '#f44336',
    marginRight: 10,
  },
  denyButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  approveButton: {
    backgroundColor: '#4CAF50',
    marginLeft: 10,
  },
  approveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  settingGroup: {
    marginBottom: 25,
    paddingHorizontal: 20,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
    marginBottom: 8,
  },
  settingHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  timeLimitButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  timeLimitButton: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  selectedButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  timeLimitButtonText: {
    fontSize: 14,
    color: '#333',
  },
});

export default App;