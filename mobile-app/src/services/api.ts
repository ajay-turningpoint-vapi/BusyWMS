import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const api = axios.create({
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  // Load dynamic server IP (e.g. 192.168.1.11:5000)
  const serverIp = await AsyncStorage.getItem('wms_server_ip');
  if (serverIp) {
    config.baseURL = `http://${serverIp}/api`;
  } else {
    config.baseURL = 'http://192.168.1.11:5000/api'; // default fallback
  }

  // Load auth token
  const token = await AsyncStorage.getItem('wms_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;
