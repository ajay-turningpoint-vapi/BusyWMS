import { create } from 'zustand';

interface User {
  userId: number;
  username: string;
  fullName: string;
  role: string;
  warehouseId?: number;
  permissions?: Array<{
    ResourceName: string;
    CanRead: number;
    CanCreate: number;
    CanUpdate: number;
    CanDelete: number;
  }>;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  themeMode: 'light' | 'dark';
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  toggleTheme: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Read initial values from localStorage
  const savedToken = localStorage.getItem('wms_token');
  const savedUser = localStorage.getItem('wms_user');
  const savedTheme = localStorage.getItem('wms_theme') as 'light' | 'dark' || 'light';

  return {
    token: savedToken,
    user: savedUser ? JSON.parse(savedUser) : null,
    isAuthenticated: !!savedToken,
    themeMode: savedTheme,
    
    setAuth: (token, user) => {
      localStorage.setItem('wms_token', token);
      localStorage.setItem('wms_user', JSON.stringify(user));
      set({ token, user, isAuthenticated: true });
    },
    
    logout: () => {
      localStorage.removeItem('wms_token');
      localStorage.removeItem('wms_user');
      set({ token: null, user: null, isAuthenticated: false });
    },

    toggleTheme: () => {
      set((state) => {
        const nextMode = state.themeMode === 'light' ? 'dark' : 'light';
        localStorage.setItem('wms_theme', nextMode);
        return { themeMode: nextMode };
      });
    }
  };
});
