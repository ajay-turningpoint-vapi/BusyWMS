import React, { useEffect, useState } from 'react';
import { 
  Box, Typography, Tabs, Tab, Button, Card, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, TextField, 
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  CircularProgress, Alert, Checkbox, Paper
} from '@mui/material';
import { ToggleLeft, Wrench, Shield, History, Save } from 'lucide-react';
import api from '../services/api';

export default function Settings() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Tab 0: Feature Flags
  const [features, setFeatures] = useState<any[]>([]);

  // Tab 1: General WMS Configs
  const [configs, setConfigs] = useState<any[]>([]);
  const [configMap, setConfigMap] = useState<Record<string, string>>({});

  // Tab 2: Permission Matrix
  const [permissions, setPermissions] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRole, setSelectedRole] = useState<number>(1);

  // Tab 3: Login Logs
  const [loginHistory, setLoginHistory] = useState<any[]>([]);

  const fetchSettingsData = async () => {
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      if (tabValue === 0) {
        const res = await api.get('/settings/features');
        setFeatures(res.data);
      } else if (tabValue === 1) {
        const res = await api.get('/settings/configs');
        setConfigs(res.data);
        const map: Record<string, string> = {};
        res.data.forEach((c: any) => {
          map[c.SettingKey] = c.SettingValue;
        });
        setConfigMap(map);
      } else if (tabValue === 2) {
        const rolesRes = await api.get('/masters/roles');
        setRoles(rolesRes.data);
        const permRes = await api.get('/settings/permissions');
        setPermissions(permRes.data);
      } else if (tabValue === 3) {
        const res = await api.get('/settings/login-history');
        setLoginHistory(res.data);
      }
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.message || 'Failed to load settings data.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsData();
  }, [tabValue]);

  // Handle Feature Switch Toggle
  const handleFeatureToggle = (featureCode: string, checked: boolean) => {
    setFeatures(prev => prev.map(f => f.FeatureCode === featureCode ? { ...f, IsEnabled: checked ? 1 : 0 } : f));
  };

  // Save Feature Configs
  const handleSaveFeatures = async () => {
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await api.put('/settings/features', { features });
      setSuccessMsg('Feature configurations updated successfully.');
      setLoading(false);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to save features.');
      setLoading(false);
    }
  };

  // Handle Config Change
  const handleConfigChange = (key: string, value: string) => {
    setConfigMap(prev => ({ ...prev, [key]: value }));
  };

  // Save General Configs
  const handleSaveConfigs = async () => {
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const payload = Object.entries(configMap).map(([key, value]) => ({
        key,
        value
      }));
      await api.put('/settings/configs', { settings: payload });
      setSuccessMsg('System settings saved successfully.');
      setLoading(false);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to save settings.');
      setLoading(false);
    }
  };

  // Handle Permission matrix check change
  const handlePermissionChange = (resource: string, field: 'CanRead' | 'CanCreate' | 'CanUpdate' | 'CanDelete', checked: boolean) => {
    setPermissions(prev => prev.map(p => {
      if (p.RoleId === selectedRole && p.ResourceName === resource) {
        return { ...p, [field]: checked ? 1 : 0 };
      }
      return p;
    }));
  };

  // Save RBAC Permission matrix
  const handleSavePermissions = async () => {
    setLoading(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const rolePermissions = permissions.filter(p => p.RoleId === selectedRole);
      await api.put('/settings/permissions', { roleId: selectedRole, permissions: rolePermissions });
      setSuccessMsg('Role Permission matrix updated successfully.');
      setLoading(false);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to save permission changes.');
      setLoading(false);
    }
  };

  // Filter permission matrix for current active role selection
  const filteredPermissions = permissions.filter(p => p.RoleId === selectedRole);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h2" sx={{ fontWeight: 700 }}>System Settings & RBAC</Typography>
        <Typography variant="body2" color="text.secondary">Configure system modules, document numbering formats, putaway rules, and edit access control policies.</Typography>
      </Box>

      {/* Settings Navigation Tabs */}
      <Tabs 
        value={tabValue} 
        onChange={(e, val) => setTabValue(val)} 
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab icon={<ToggleLeft size={16} />} iconPosition="start" label="Feature Toggles" />
        <Tab icon={<Wrench size={16} />} iconPosition="start" label="WMS Configs" />
        <Tab icon={<Shield size={16} />} iconPosition="start" label="Permission Matrix" />
        <Tab icon={<History size={16} />} iconPosition="start" label="Login Audit Logs" />
      </Tabs>

      {successMsg && <Alert severity="success" sx={{ mb: 3 }}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" sx={{ mb: 3 }}>{errorMsg}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box>
          {/* Tab 0: Features Toggles */}
          {tabValue === 0 && (
            <Card sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>Enable / Disable WMS Modules</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Enabled features will immediately show up in the WMS Navigation menus for authorized operators.</Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
                {features.map((feat) => (
                  <FormControlLabel
                    key={feat.FeatureCode}
                    control={
                      <Switch 
                        checked={feat.IsEnabled === 1} 
                        onChange={(e) => handleFeatureToggle(feat.FeatureCode, e.target.checked)} 
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{feat.DisplayName}</Typography>
                        <Typography variant="caption" color="text.secondary">{feat.FeatureCode}</Typography>
                      </Box>
                    }
                    sx={{ mb: 1, borderBottom: '1px solid', borderColor: 'divider', pb: 1, width: '100%' }}
                  />
                ))}
              </Box>

              <Button 
                variant="contained" 
                startIcon={<Save size={16} />} 
                onClick={handleSaveFeatures}
                sx={{ fontWeight: 600 }}
              >
                Save Features Config
              </Button>
            </Card>
          )}

          {/* Tab 1: WMS Configs */}
          {tabValue === 1 && (
            <Card sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>System Constants & Document Formats</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Set custom numbering layouts and sorting priority rules.</Typography>
              
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 3 }}>
                {configs.map((c) => {
                  if (c.SettingKey === 'PICKING_RULE_FIFO_FEFO') {
                    return (
                      <FormControl fullWidth key={c.SettingKey}>
                        <InputLabel>{c.Description || c.SettingKey}</InputLabel>
                        <Select
                          value={configMap[c.SettingKey] || 'FIFO'}
                          label={c.Description || c.SettingKey}
                          onChange={(e) => handleConfigChange(c.SettingKey, e.target.value)}
                        >
                          <MenuItem value="FIFO">FIFO (First In First Out - Mfg Date)</MenuItem>
                          <MenuItem value="FEFO">FEFO (First Expired First Out - Expiry Date)</MenuItem>
                          <MenuItem value="MANUAL">MANUAL (Operator selects bin manually)</MenuItem>
                        </Select>
                      </FormControl>
                    );
                  }
                  
                  return (
                    <TextField
                      key={c.SettingKey}
                      label={c.Description || c.SettingKey}
                      value={configMap[c.SettingKey] || ''}
                      onChange={(e) => handleConfigChange(c.SettingKey, e.target.value)}
                      fullWidth
                    />
                  );
                })}
              </Box>

              <Button 
                variant="contained" 
                startIcon={<Save size={16} />} 
                onClick={handleSaveConfigs}
                sx={{ fontWeight: 600 }}
              >
                Save WMS Settings
              </Button>
            </Card>
          )}

          {/* Tab 2: Permission Matrix */}
          {tabValue === 2 && (
            <Card sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>Dynamic Access Permission Matrix</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Grant specific functional permissions to different user roles. Admins bypass matrix restrictions by default.</Typography>

              <Box sx={{ mb: 3, minWidth: 200 }}>
                <FormControl sx={{ width: 300 }}>
                  <InputLabel>Active User Role</InputLabel>
                  <Select
                    value={selectedRole}
                    label="Active User Role"
                    onChange={(e) => setSelectedRole(Number(e.target.value))}
                  >
                    {roles.map((role) => (
                      <MenuItem key={role.RoleId} value={role.RoleId}>{role.RoleName}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <TableContainer component={Paper} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Resource / Feature Area</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Can Read</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Can Create</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Can Update</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Can Delete</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPermissions.map((row) => (
                      <TableRow key={row.ResourceName}>
                        <TableCell sx={{ fontWeight: 600 }}>{row.ResourceName}</TableCell>
                        <TableCell align="center">
                          <Checkbox 
                            checked={row.CanRead === 1} 
                            onChange={(e) => handlePermissionChange(row.ResourceName, 'CanRead', e.target.checked)}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox 
                            checked={row.CanCreate === 1} 
                            onChange={(e) => handlePermissionChange(row.ResourceName, 'CanCreate', e.target.checked)}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox 
                            checked={row.CanUpdate === 1} 
                            onChange={(e) => handlePermissionChange(row.ResourceName, 'CanUpdate', e.target.checked)}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox 
                            checked={row.CanDelete === 1} 
                            onChange={(e) => handlePermissionChange(row.ResourceName, 'CanDelete', e.target.checked)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPermissions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          No resources mapped for this role. Setup resource permissions to enable workspace modules.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Button 
                variant="contained" 
                startIcon={<Save size={16} />} 
                onClick={handleSavePermissions}
                sx={{ fontWeight: 600 }}
              >
                Save Role Permissions
              </Button>
            </Card>
          )}

          {/* Tab 3: Login Audit Logs */}
          {tabValue === 3 && (
            <Card sx={{ p: 3 }}>
              <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>Operator Login History & Security Audit</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Audit log of system logins, capturing IP addresses, browsers, and success status.</Typography>
              
              <TableContainer component={Paper} sx={{ maxHeight: 600, border: '1px solid', borderColor: 'divider' }}>
                <Table stickyHeader>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 700 }}>Username</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>IP Address</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Browser / Client</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Login Time</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loginHistory.map((row) => (
                      <TableRow key={row.LoginLogId}>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Username || `ID: ${row.UserId}`}</TableCell>
                        <TableCell>{row.IPAddress || 'N/A'}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.Browser || 'Unknown'}
                        </TableCell>
                        <TableCell>{new Date(row.LoginTime).toLocaleString()}</TableCell>
                        <TableCell>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              fontWeight: 700, 
                              color: row.Status === 'SUCCESS' ? 'success.main' : 'error.main',
                              bgcolor: row.Status === 'SUCCESS' ? 'success.light' : 'error.light',
                              px: 1, 
                              py: 0.5, 
                              borderRadius: 1 
                            }}
                          >
                            {row.Status}
                          </Typography>
                        </TableCell>
                        <TableCell>{row.FailureReason || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {loginHistory.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center">No login logs logged in database.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
}
