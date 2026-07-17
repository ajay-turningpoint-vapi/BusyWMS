import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send cookies automatically
});

// We don't need the request interceptor to attach Bearer tokens anymore, 
// since we use HttpOnly cookies.

let isRefreshing = false;
let refreshSubscribers: ((token?: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token?: string) => void) => {
  refreshSubscribers.push(cb);
};

const onRefreshed = () => {
  refreshSubscribers.forEach((cb) => cb());
  refreshSubscribers = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If it's a 401 and we haven't already retried this request
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If a refresh is already in progress, wait for it to finish and retry
        return new Promise((resolve) => {
          subscribeTokenRefresh(() => {
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Call the refresh endpoint (this automatically sends the refresh cookie and sets the new access cookie)
        await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        
        isRefreshing = false;
        onRefreshed();
        
        // Retry original request (which will now send the new access cookie)
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        refreshSubscribers = [];
        
        console.warn('Session expired. Logging out user.');
        localStorage.removeItem('wms_user');
        
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
