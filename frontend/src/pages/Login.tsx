import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, Card, CardContent, TextField, Button, Typography, 
  Alert, InputAdornment, IconButton, Tooltip
} from '@mui/material';
import { Eye, EyeOff, Lock, User, Info } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/login', { username, password });
      setAuth(res.data.token, res.data.user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials or connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh', 
      bgcolor: 'background.default',
      px: 2
    }}>
      <Card sx={{ width: '100%', maxWidth: 420, p: 2, borderRadius: 3 }}>
        <CardContent>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="h2" sx={{ fontWeight: 800, color: 'primary.main', mb: 1 }}>
              BusyWMS
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Warehouse Management Portal
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              label="Username"
              variant="outlined"
              fullWidth
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <User size={18} />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock size={18} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <Button 
              type="submit" 
              variant="contained" 
              size="large" 
              fullWidth 
              disabled={loading}
              sx={{ py: 1.5, fontSize: 14, fontWeight: 600 }}
            >
              {loading ? 'Logging in...' : 'Sign In'}
            </Button>
          </Box>

          <Box sx={{ mt: 4, p: 2, bgcolor: 'secondary.light', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
            <Typography variant="caption" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mb: 1, color: 'text.primary' }}>
              <Info size={14} /> Demo Credentials (Password: Busy@123)
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Tooltip title="Full control over WMS"><Button size="small" variant="outlined" onClick={() => { setUsername('admin'); setPassword('Busy@123'); }}>Admin</Button></Tooltip>
              <Tooltip title="GRN receives goods"><Button size="small" variant="outlined" onClick={() => { setUsername('grn_user'); setPassword('Busy@123'); }}>GRN Op</Button></Tooltip>
              <Tooltip title="QC inspections"><Button size="small" variant="outlined" onClick={() => { setUsername('qc_user'); setPassword('Busy@123'); }}>QC Op</Button></Tooltip>
              <Tooltip title="Picking scanner screen"><Button size="small" variant="outlined" onClick={() => { setUsername('picker_user'); setPassword('Busy@123'); }}>Picker</Button></Tooltip>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
