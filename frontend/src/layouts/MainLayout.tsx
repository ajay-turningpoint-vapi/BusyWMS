import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { 
  Box, Drawer, AppBar, Toolbar, List, Typography, Divider, IconButton, 
  ListItem, ListItemButton, ListItemIcon, ListItemText, Badge, Menu, MenuItem, 
  Tooltip, Breadcrumbs, Link, Chip, TextField, InputAdornment, CircularProgress
} from '@mui/material';
import { 
  LayoutDashboard, Database, ArrowDownToLine, ArrowUpFromLine, 
  ArrowRightLeft, FileSpreadsheet, Smartphone, Sun, Moon, Bell, 
  UserCircle, LogOut, ChevronRight, Menu as MenuIcon, Search,
  ShoppingCart, Inbox, ClipboardCheck, Archive, Warehouse, 
  UploadCloud, ListChecks, Package, Truck, BarChart3, Settings, Printer,
  CornerDownLeft, ListTodo, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useTransactionModalStore } from '../store/transactionModalStore';
import TransactionDrilldownDialog from '../components/TransactionDrilldownDialog';
import api from '../services/api';

const drawerWidth = 260;

interface MenuItemType {
  text: string;
  icon: React.ReactNode;
  path: string;
  category: string;
  featureCode?: string;
}

export default function MainLayout() {
  const { user, logout, themeMode, toggleTheme } = useAuthStore();
  const { clickSetting, setClickSetting } = useTransactionModalStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [notiAnchor, setNotiAnchor] = useState<null | HTMLElement>(null);

  // Features configuration list
  const [enabledFeatures, setEnabledFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get('/settings/features')
      .then(res => {
        const map: Record<string, boolean> = {};
        res.data.forEach((f: any) => {
          map[f.FeatureCode] = f.IsEnabled === 1;
        });
        setEnabledFeatures(map);
      })
      .catch(err => console.error('Failed to fetch WMS features', err));
  }, [location.pathname]);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('wms_sidebar_open');
    return saved !== null ? saved === 'true' : true;
  });

  const toggleSidebar = () => {
    setSidebarOpen(prev => {
      const newVal = !prev;
      localStorage.setItem('wms_sidebar_open', String(newVal));
      return newVal;
    });
  };
  
  // BUG-019 FIX: Dynamic warehouse name from user profile
  const [activeWarehouse, setActiveWarehouse] = useState<string>('Loading...');
  
  useEffect(() => {
    if (user?.warehouseId) {
      api.get('/masters/warehouses')
        .then(res => {
          const wh = res.data.find((w: any) => String(w.WarehouseId) === String(user.warehouseId));
          setActiveWarehouse(wh ? `${wh.Name} (${wh.Code})` : `WH-${user.warehouseId}`);
        })
        .catch(() => setActiveWarehouse(`WH-${user.warehouseId}`));
    } else {
      setActiveWarehouse('All Warehouses');
    }
  }, [user?.warehouseId]);

  // Dynamic WMS search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchAnchor, setSearchAnchor] = useState<null | HTMLElement>(null);
  const { openTransaction } = useTransactionModalStore();

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.trim().length > 1) {
      setSearchLoading(true);
      setSearchAnchor(e.currentTarget);
      try {
        const res = await api.get(`/transactions/search?q=${q}`);
        setSearchResults(res.data);
      } catch (err) {
        console.error('Failed to search', err);
      } finally {
        setSearchLoading(false);
      }
    } else {
      setSearchResults([]);
      setSearchAnchor(null);
    }
  };

  const handleSearchSelect = (item: any) => {
    openTransaction(item.type, item.id || item.code, 'view');
    setSearchQuery('');
    setSearchResults([]);
    setSearchAnchor(null);
  };
  // BUG-018 FIX: Notifications — start empty; dismissible
  // Phase 5 will connect this via Socket.IO for real-time server-push alerts
  const [notifications, setNotifications] = useState<{id: number; text: string; time: string}[]>([]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      const formatted = res.data.filter((n: any) => n.IsRead === 0).map((n: any) => ({
        id: n.NotificationId,
        text: `${n.Title}: ${n.Message}`,
        time: new Date(n.CreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));
      setNotifications(formatted);
    } catch (err) {
      console.error('Failed to load notifications', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleNotiClick = async (id: number, text: string) => {
    handleNotiClose();
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error(err);
    }

    const poMatch = text.match(/PO-\d{4}-\d+/);
    const soMatch = text.match(/SO-\d{4}-\d+/);
    const grnMatch = text.match(/GRN-\d+/);
    
    if (poMatch) {
      openTransaction('PO', poMatch[0], 'view');
    } else if (soMatch) {
      openTransaction('SO', soMatch[0], 'view');
    } else if (grnMatch) {
      openTransaction('GRN', grnMatch[0], 'view');
    }
  };

  const handleNotiDismiss = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Failed to dismiss notification', err);
    }
  };

  const handleProfileOpen = (event: React.MouseEvent<HTMLElement>) => setProfileAnchor(event.currentTarget);
  const handleProfileClose = () => setProfileAnchor(null);
  const handleNotiOpen = (event: React.MouseEvent<HTMLElement>) => setNotiAnchor(event.currentTarget);
  const handleNotiClose = () => setNotiAnchor(null);

  const handleLogout = () => {
    handleProfileClose();
    logout();
    navigate('/login');
  };

  const menuItems: MenuItemType[] = [
    { text: 'Dashboard', icon: <LayoutDashboard size={18} />, path: '/', category: 'General', featureCode: 'MODULE_DASHBOARD' },
    
    // Masters
    { text: 'Masters Management', icon: <Database size={18} />, path: '/masters', category: 'Masters' },
    { text: 'Barcode Templates', icon: <Printer size={18} />, path: '/barcodes', category: 'Masters' },
    { text: 'System Config & Settings', icon: <Settings size={18} />, path: '/settings', category: 'Masters' },
    
    // Inbound
    { text: 'Sync Purchase Orders', icon: <ShoppingCart size={18} />, path: '/inbound/sync', category: 'Inbound', featureCode: 'MODULE_BUSY_INTEGRATION' },
    { text: 'ASN Dashboard', icon: <BarChart3 size={18} />, path: '/inbound/asn/dashboard', category: 'Inbound', featureCode: 'MODULE_ASN' },
    { text: 'Advanced Ship Notice (ASN)', icon: <Truck size={18} />, path: '/inbound/asn', category: 'Inbound', featureCode: 'MODULE_ASN' },
    { text: 'Goods Receipt (GRN)', icon: <Inbox size={18} />, path: '/inbound/grn', category: 'Inbound' },
    { text: 'Quality Check (QC)', icon: <ClipboardCheck size={18} />, path: '/inbound/qc', category: 'Inbound' },
    { text: 'Putaway Execution', icon: <Archive size={18} />, path: '/inbound/putaway', category: 'Inbound', featureCode: 'MODULE_PUTAWAY' },
    { text: 'Returns & Restocking', icon: <CornerDownLeft size={18} />, path: '/inbound/returns', category: 'Inbound', featureCode: 'MODULE_RETURNS' },
 
    // Stock Adjust
    { text: 'Stock Transfer', icon: <Warehouse size={18} />, path: '/inventory/transfer', category: 'Inventory' },
    { text: 'Replenishment Moves', icon: <RefreshCw size={18} />, path: '/inventory/replenish', category: 'Inventory', featureCode: 'MODULE_REPLENISHMENT' },
    { text: 'Cycle Counting', icon: <ListTodo size={18} />, path: '/inventory/cycle-count', category: 'Inventory' },
    { text: 'Damaged Stock Log', icon: <AlertTriangle size={18} />, path: '/inventory/damages', category: 'Inventory' },
 
    // Outbound
    { text: 'Sync Sales Orders', icon: <UploadCloud size={18} />, path: '/outbound/sync', category: 'Outbound', featureCode: 'MODULE_BUSY_INTEGRATION' },
    { text: 'Picking & Wave List', icon: <ListChecks size={18} />, path: '/outbound/picking', category: 'Outbound', featureCode: 'MODULE_PICKUP' },
    { text: 'Packing Center', icon: <Package size={18} />, path: '/outbound/packing', category: 'Outbound', featureCode: 'MODULE_DISPATCH' },
    { text: 'Dispatch (DC)', icon: <Truck size={18} />, path: '/outbound/dispatch', category: 'Outbound', featureCode: 'MODULE_DISPATCH' },
    
    // Handheld
    { text: 'Mobile Scanner App', icon: <Smartphone size={18} />, path: '/mobile', category: 'Scanner' },
    
    // Reports
    { text: 'WMS Reports & Logs', icon: <BarChart3 size={18} />, path: '/reports', category: 'Analytics', featureCode: 'MODULE_REPORTS' }
  ];

  // Derive breadcrumbs from path
  const pathnames = location.pathname.split('/').filter((x) => x);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Top Header */}
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ justifyContent: 'space-between', px: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton 
              color="inherit" 
              onClick={toggleSidebar} 
              edge="start"
              sx={{ 
                mr: 0.5,
                bgcolor: 'action.hover',
                borderRadius: 2,
                '&:hover': { bgcolor: 'action.selected' }
              }}
            >
              <MenuIcon size={20} />
            </IconButton>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer' }} onClick={() => navigate('/')}>
              <Box sx={{ bgcolor: 'primary.main', p: 0.5, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LayoutDashboard size={20} color="#fff" />
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: -0.5, display: { xs: 'none', sm: 'block' } }}>
                BusyWMS <Typography component="span" variant="caption" sx={{ color: 'primary.main', fontWeight: 600, ml: 0.5 }}>Enterprise</Typography>
              </Typography>
            </Box>
          </Box>

          {/* Central Search Bar */}
          <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', maxWidth: 500, mx: 3 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search PO, SO, GRN, Bin, Batch..."
              value={searchQuery}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start" sx={{ pl: 0.5 }}>
                    {searchLoading ? <CircularProgress size={16} /> : <Search size={16} />}
                  </InputAdornment>
                ),
                sx: { 
                  borderRadius: 2, 
                  bgcolor: 'background.paper',
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' }
                }
              }}
            />
            
            {/* Search Dropdown list menu */}
            <Menu
              anchorEl={searchAnchor}
              open={Boolean(searchAnchor && searchResults.length > 0)}
              onClose={() => setSearchAnchor(null)}
              autoFocus={false}
              PaperProps={{ sx: { width: 450, mt: 1, maxHeight: 300 } }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block', fontWeight: 700 }}>
                MATCHING WMS TRANSACTIONS ({searchResults.length})
              </Typography>
              <Divider />
              {searchResults.map((item) => (
                <MenuItem key={`${item.type}-${item.id}`} onClick={() => handleSearchSelect(item)}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {item.code}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.label} (Type: {item.type})
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Menu>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Click Trigger Config */}
            <Tooltip title={`Current drilldown trigger: ${clickSetting === 'single' ? 'Single-Click' : 'Double-Click'}. Click to toggle.`}>
              <Chip 
                label={clickSetting === 'single' ? '1-Click' : '2-Clicks'}
                color="secondary"
                variant="outlined"
                size="small"
                onClick={() => setClickSetting(clickSetting === 'single' ? 'double' : 'single')}
                sx={{ cursor: 'pointer', fontWeight: 700 }}
              />
            </Tooltip>

            {/* Theme Toggle */}
            <IconButton onClick={toggleTheme} size="small" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              {themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </IconButton>

            {/* Notification Center */}
            <IconButton onClick={handleNotiOpen} size="small" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Badge badgeContent={notifications.length} color="error">
                <Bell size={18} />
              </Badge>
            </IconButton>

            {/* Profile Dropdown */}
            <ListItemButton onClick={handleProfileOpen} sx={{ p: 0.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', ml: 1 }}>
              <UserCircle size={24} />
              <Box sx={{ ml: 1, display: { xs: 'none', md: 'block' }, textAlign: 'left', pr: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                  {user?.fullName || 'Operator'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user?.role || 'Guest'}
                </Typography>
              </Box>
            </ListItemButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Navigation Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          width: sidebarOpen ? 260 : 72,
          flexShrink: 0,
          transition: (theme) => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
          }),
          [`& .MuiDrawer-paper`]: { 
            width: sidebarOpen ? 260 : 72, 
            boxSizing: 'border-box', 
            pt: 8,
            overflowX: 'hidden',
            transition: (theme) => theme.transitions.create('width', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
          },
        }}
      >
        <Box sx={{ overflowX: 'hidden', overflowY: 'auto', p: sidebarOpen ? 1.5 : 1 }}>
          {/* Categories */}
          {['General', 'Masters', 'Inbound', 'Inventory', 'Outbound', 'Scanner', 'Analytics'].map((category) => {
            const items = menuItems.filter(item => {
              if (item.category !== category) return false;
              if (item.featureCode && enabledFeatures[item.featureCode] === false) return false;
              return true;
            });
            if (items.length === 0) return null;
            return (
              <Box key={category} sx={{ mb: sidebarOpen ? 2 : 1 }}>
                {sidebarOpen ? (
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, textTransform: 'uppercase', pl: 1.5, mb: 0.5, display: 'block', whiteSpace: 'nowrap' }}>
                    {category}
                  </Typography>
                ) : (
                  <Divider sx={{ my: 1 }} />
                )}
                <List sx={{ p: 0 }}>
                  {items.map((item) => {
                    const isSelected = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                    
                    const buttonContent = (
                      <ListItemButton
                        onClick={() => navigate(item.path)}
                        selected={isSelected}
                        sx={{
                          borderRadius: 2,
                          py: 1,
                          px: sidebarOpen ? 1.5 : 0,
                          justifyContent: sidebarOpen ? 'initial' : 'center',
                          minHeight: 40,
                          width: '100%',
                          '&.Mui-selected': {
                            bgcolor: 'primary.light',
                            color: 'primary.main',
                            '& .MuiListItemIcon-root': { color: 'primary.main' },
                          },
                        }}
                      >
                        <ListItemIcon sx={{ 
                          minWidth: sidebarOpen ? 32 : 0, 
                          color: 'text.secondary',
                          justifyContent: 'center'
                        }}>
                          {item.icon}
                        </ListItemIcon>
                        {sidebarOpen && (
                          <ListItemText 
                            primary={item.text} 
                            primaryTypographyProps={{ 
                              fontSize: 13, 
                              fontWeight: isSelected ? 600 : 500 
                            }} 
                            sx={{ ml: 1.5 }}
                          />
                        )}
                      </ListItemButton>
                    );

                    return (
                      <ListItem key={item.text} disablePadding sx={{ mb: 0.25, display: 'block' }}>
                        {sidebarOpen ? (
                          buttonContent
                        ) : (
                          <Tooltip title={item.text} placement="right" arrow>
                            {buttonContent}
                          </Tooltip>
                        )}
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            );
          })}
        </Box>
      </Drawer>

      {/* Main Content Area */}
      <Box component="main" sx={{ flexGrow: 1, p: 3, pt: 11, display: 'flex', flexDirection: 'column' }}>
        {/* Breadcrumbs */}
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Breadcrumbs separator={<ChevronRight size={14} />} aria-label="breadcrumb">
            <Link underline="hover" color="inherit" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} sx={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
              WMS
            </Link>
            {pathnames.map((value, index) => {
              const last = index === pathnames.length - 1;
              const to = `/${pathnames.slice(0, index + 1).join('/')}`;
              return last ? (
                <Typography key={to} color="text.primary" sx={{ fontSize: 13, fontWeight: 500, textTransform: 'capitalize' }}>
                  {value}
                </Typography>
              ) : (
                <Link key={to} underline="hover" color="inherit" href={to} onClick={(e) => { e.preventDefault(); navigate(to); }} sx={{ fontSize: 13, textTransform: 'capitalize' }}>
                  {value}
                </Link>
              );
            })}
          </Breadcrumbs>
          
          <Chip 
            label={`WH: ${activeWarehouse}`} 
            size="small" 
            color="primary" 
            variant="outlined" 
            sx={{ fontWeight: 600 }} 
          />
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Dynamic Nested Routes */}
        <Outlet />
      </Box>

      {/* Profile Menu dropdown */}
      <Menu
        anchorEl={profileAnchor}
        open={Boolean(profileAnchor)}
        onClose={handleProfileClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem disabled>
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{user?.fullName}</Typography>
            <Typography variant="caption" color="text.secondary">{user?.role}</Typography>
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon><LogOut size={16} /></ListItemIcon>
          Log Out
        </MenuItem>
      </Menu>

      {/* Notification Menu dropdown */}
      <Menu
        anchorEl={notiAnchor}
        open={Boolean(notiAnchor)}
        onClose={handleNotiClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{ sx: { width: 320 } }}
      >
        <Typography variant="h5" sx={{ px: 2, py: 1, fontWeight: 700 }}>Notifications</Typography>
        <Divider />
        {notifications.map((n) => (
          <MenuItem key={n.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ whiteSpace: 'normal', flex: 1 }} onClick={() => handleNotiClick(n.id, n.text)}>
              <Typography variant="body2" color="primary" sx={{ fontWeight: n.text.includes('PO') || n.text.includes('SO') || n.text.includes('GRN') ? 600 : 500 }}>
                {n.text}
              </Typography>
              <Typography variant="caption" color="text.secondary">{n.time}</Typography>
            </Box>
            <IconButton size="small" onClick={() => handleNotiDismiss(n.id)} sx={{ mt: 0.25, flexShrink: 0 }}>
              <Typography variant="caption" sx={{ fontSize: 10, color: 'text.disabled' }}>✕</Typography>
            </IconButton>
          </MenuItem>
        ))}
        {notifications.length === 0 && (
          <MenuItem disabled>No new notifications</MenuItem>
        )}
      </Menu>
      
      {/* Global WMS Transaction Drilldown dialog */}
      <TransactionDrilldownDialog />
    </Box>
  );
}
