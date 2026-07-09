import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, TextInput, TouchableOpacity, 
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

export default function LoginScreen({ navigation }: any) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [serverIp, setServerIp] = useState('192.168.1.11:5000');
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load pre-configured settings
    AsyncStorage.getItem('wms_server_ip').then(val => {
      if (val) setServerIp(val);
    });
    AsyncStorage.getItem('wms_username').then(val => {
      if (val) setUsername(val);
    });
  }, []);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('Username and Password are required.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      // Save server IP config
      await AsyncStorage.setItem('wms_server_ip', serverIp.trim());
      
      const response = await api.post('/auth/login', { username, password });
      
      // Store token and credentials
      await AsyncStorage.setItem('wms_auth_token', response.data.token);
      await AsyncStorage.setItem('wms_username', username);
      await AsyncStorage.setItem('wms_user_role', response.data.roleName || '');
      
      setLoading(false);
      setPassword('');
      navigation.replace('MobileHome');
    } catch (err: any) {
      setLoading(false);
      const msg = err.response?.data?.message || 'Connection failed. Check Server IP or credentials.';
      setError(msg);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>TURNINGPOINT WMS</Text>
          <Text style={styles.subtitle}>Mobile Barcode Scanner App</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <TextInput 
              style={styles.input} 
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput 
              style={styles.input} 
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password"
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginText}>Log In</Text>}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingsToggle} 
            onPress={() => setShowSettings(!showSettings)}
          >
            <Text style={styles.settingsToggleText}>
              {showSettings ? 'Hide Server Configuration' : 'Show Server Configuration'}
            </Text>
          </TouchableOpacity>

          {showSettings && (
            <View style={styles.settingsBox}>
              <Text style={styles.label}>Server IP & Port</Text>
              <TextInput 
                style={styles.input} 
                value={serverIp}
                onChangeText={setServerIp}
                placeholder="e.g. 192.168.1.11:5000"
                placeholderTextColor="#999"
                autoCapitalize="none"
              />
              <Text style={styles.helpText}>Enter WMS backend IP. Do not include http://</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a73e8',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  loginButton: {
    height: 48,
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  settingsToggle: {
    alignItems: 'center',
    marginTop: 20,
    padding: 8,
  },
  settingsToggleText: {
    color: '#1a73e8',
    fontSize: 14,
    fontWeight: '600',
  },
  settingsBox: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
});
