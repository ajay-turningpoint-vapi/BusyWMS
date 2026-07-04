import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Masters from './pages/Masters';
import Settings from './pages/Settings';
import BarcodeConfig from './pages/BarcodeConfig';
import SyncPO from './pages/Inbound/SyncPO';
import GRN from './pages/Inbound/GRN';
import QC from './pages/Inbound/QC';
import Putaway from './pages/Inbound/Putaway';
import ASNList from './pages/Inbound/ASNList';
import CreateEditASN from './pages/Inbound/CreateEditASN';
import ASNDashboard from './pages/Inbound/ASNDashboard';
import Transfer from './pages/Inventory/Transfer';
import CycleCounts from './pages/Inventory/CycleCounts';
import Damages from './pages/Inventory/Damages';
import Replenishments from './pages/Inventory/Replenishments';
import Returns from './pages/Inbound/Returns';
import SyncSO from './pages/Outbound/SyncSO';
import Picking from './pages/Outbound/Picking';
import Packing from './pages/Outbound/Packing';
import Dispatch from './pages/Outbound/Dispatch';
import MobileHome from './pages/Mobile/MobileHome';
import Reports from './pages/Reports/Reports';

import { useAuthStore } from './store/authStore';
import { getTheme } from './theme';
import { ToastProvider } from './contexts/ToastContext';

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

export default function App() {
  const { themeMode } = useAuthStore();
  const theme = getTheme(themeMode);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Route */}
            <Route path="/login" element={<Login />} />

            {/* Protected Core App Routes */}
            <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="masters" element={<Masters />} />
              <Route path="settings" element={<Settings />} />
              <Route path="barcodes" element={<BarcodeConfig />} />
              <Route path="inbound/sync" element={<SyncPO />} />
              <Route path="inbound/grn" element={<GRN />} />
              <Route path="inbound/qc" element={<QC />} />
              <Route path="inbound/putaway" element={<Putaway />} />
              <Route path="inbound/asn" element={<ASNList />} />
              <Route path="inbound/asn/create" element={<CreateEditASN />} />
              <Route path="inbound/asn/edit/:id" element={<CreateEditASN />} />
              <Route path="inbound/asn/dashboard" element={<ASNDashboard />} />
              <Route path="inbound/returns" element={<Returns />} />
              <Route path="inventory/transfer" element={<Transfer />} />
              <Route path="inventory/cycle-count" element={<CycleCounts />} />
              <Route path="inventory/damages" element={<Damages />} />
              <Route path="inventory/replenish" element={<Replenishments />} />
              <Route path="outbound/sync" element={<SyncSO />} />
              <Route path="outbound/picking" element={<Picking />} />
              <Route path="outbound/packing" element={<Packing />} />
              <Route path="outbound/dispatch" element={<Dispatch />} />
              <Route path="mobile" element={<MobileHome />} />
              <Route path="reports" element={<Reports />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
