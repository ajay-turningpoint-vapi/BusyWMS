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
  token: string | null; // Kept for backward compatibility but unused
  user: User | null;
  isAuthenticated: boolean;
  themeMode: 'light' | 'dark';
  setAuth: (token: string, user: User) => void; // Token argument ignored
  logout: () => void;
  toggleTheme: () => void;
  setWarehouseId: (warehouseId: number | null) => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Read initial values from localStorage
  const savedUser = localStorage.getItem('wms_user');
  const savedTheme = localStorage.getItem('wms_theme') as 'light' | 'dark' || 'light';

  return {
    token: null, // Tokens are in HTTP-Only cookies now
    user: savedUser ? JSON.parse(savedUser) : null,
    isAuthenticated: !!savedUser, // Rely on user profile existence
    themeMode: savedTheme,
    
    setAuth: (token, user) => {
      // We don't save token anymore
      localStorage.setItem('wms_user', JSON.stringify(user));
      set({ token: null, user, isAuthenticated: true });
    },
    
    logout: () => {
      localStorage.removeItem('wms_user');
      set({ token: null, user: null, isAuthenticated: false });
    },
    
    toggleTheme: () => {
      set((state) => {
        const newMode = state.themeMode === 'light' ? 'dark' : 'light';
        localStorage.setItem('wms_theme', newMode);
        return { themeMode: newMode };
      });
    },

    setWarehouseId: (warehouseId) => {
      set((state) => {
        if (!state.user) return state;
        const updatedUser = { ...state.user, warehouseId: warehouseId || undefined };
        localStorage.setItem('wms_user', JSON.stringify(updatedUser));
        return { user: updatedUser };
      });
    }
  };
});
