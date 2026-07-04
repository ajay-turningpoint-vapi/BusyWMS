import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Grid, Card, CardContent, Typography, Box, 
  CircularProgress, Alert, LinearProgress, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper
} from '@mui/material';
import { 
  FileCheck, ClipboardList, Package, CheckSquare, 
  Coins, TrendingUp, AlertTriangle, PlayCircle
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
  Tooltip as ChartTooltip, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import api from '../services/api';

interface KPIType {
  pendingGRN: number;
  pendingQC: number;
  pendingPutaway: number;
  pendingReservations: number;
  pendingPicking: number;
  pendingPacking: number;
  pendingDispatch: number;
  todayInward: number;
  todayOutward: number;
  inventoryValue: number;
  damagedStock: number;
  occupancy: number;
  totalPendingSO: number;
  totalPendingSOQty: number;
  totalPendingPO: number;
  totalPendingPOQty: number;
  partiallyDispatchedOrders: number;
  partiallyReceivedPOs: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/dashboard')
      .then((res) => {
        setStats(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setError('Failed to fetch dashboard statistics');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const kpi: KPIType = stats.kpi;
  const trends = stats.trends;
  const nearExpiry = stats.nearExpiry;

  // BUG-043 FIX: Merge inbound + outbound trend data by date for dual-series chart
  const mergedTrends = (trends.inbound || []).map((inRow: any, idx: number) => ({
    date: inRow.date,
    Inbound: inRow.quantity,
    Outbound: trends.outbound?.[idx]?.quantity ?? 0
  }));

  const cardData = [
    { title: 'Pending GRN', value: kpi.pendingGRN, icon: <ClipboardList color="#3b82f6" />, color: '#eff6ff', path: '/inbound/grn' },
    { title: 'Pending QC Checks', value: kpi.pendingQC, icon: <FileCheck color="#eab308" />, color: '#fef9c3', path: '/inbound/qc' },
    { title: 'Pending Putaway', value: kpi.pendingPutaway, icon: <Package color="#a855f7" />, color: '#faf5ff', path: '/inbound/putaway' },
    { title: 'Pending Reservations', value: kpi.pendingReservations, icon: <CheckSquare color="#10b981" />, color: '#ecfdf5', path: '/outbound/sync' },
    { title: 'Active Pick Lists', value: kpi.pendingPicking, icon: <PlayCircle color="#f97316" />, color: '#fff7ed', path: '/outbound/picking' },
    { title: 'Pending Dispatch', value: kpi.pendingDispatch, icon: <Package color="#ec4899" />, color: '#fdf2f8', path: '/outbound/dispatch' }
  ];

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h2" sx={{ mb: 1, fontWeight: 700 }}>
        Operations Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Real-time WMS activity tracking & inventory summary.
      </Typography>

      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {cardData.map((card, idx) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={idx}>
            <Card 
              onClick={() => card.path && navigate(card.path)} 
              sx={{ 
                height: '100%', 
                cursor: card.path ? 'pointer' : 'default',
                '&:hover': {
                  boxShadow: 3,
                  transform: 'translateY(-2px)',
                  transition: 'all 0.2s ease-in-out'
                }
              }}
            >
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Box sx={{ bgcolor: card.color, p: 1, borderRadius: 2, display: 'flex' }}>
                    {card.icon}
                  </Box>
                  <Typography variant="h2" sx={{ fontWeight: 800 }}>
                    {card.value}
                  </Typography>
                </Box>
                <Typography variant="h5" color="text.secondary">
                  {card.title}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Secondary Stats */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'primary.light', borderColor: 'primary.main', borderStyle: 'dashed' }}>
            <CardContent>
              <Typography variant="h5" color="primary.main" sx={{ fontWeight: 600, mb: 1 }}>
                Today's Inward
              </Typography>
              <Typography variant="h1" color="primary.dark" sx={{ fontWeight: 800 }}>
                {kpi.todayInward} <Typography component="span" variant="body1">Units</Typography>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card sx={{ bgcolor: 'secondary.light', borderColor: 'divider', borderStyle: 'dashed' }}>
            <CardContent>
              <Typography variant="h5" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                Today's Outward
              </Typography>
              <Typography variant="h1" sx={{ fontWeight: 800 }}>
                {kpi.todayOutward} <Typography component="span" variant="body1">Units</Typography>
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h5" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Warehouse Occupancy
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {kpi.occupancy}%
                </Typography>
              </Box>
              <LinearProgress variant="determinate" value={kpi.occupancy} sx={{ height: 10, borderRadius: 5, mb: 1 }} />
              <Typography variant="caption" color="text.secondary">Delhi & Mumbai volume allocation</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h5" color="text.secondary" sx={{ fontWeight: 600, mb: 1 }}>
                Stock Valuation
              </Typography>
              <Typography variant="h1" sx={{ fontWeight: 800, color: 'success.main', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Coins size={22} /> ₹{kpi.inventoryValue.toLocaleString()}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Pending Orders Analytics */}
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700 }}>
        Pending Orders Analytics
      </Typography>
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Sales Order Pending Cards */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, color: 'primary.main', mb: 2 }}>
              Outbound Sales Orders
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Card 
                  onClick={() => navigate('/reports?tab=1')} 
                  sx={{ 
                    bgcolor: '#eff6ff', 
                    border: '1px solid #bfdbfe', 
                    boxShadow: 'none',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#dbeafe', transition: 'all 0.2s' }
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Pending SOs</Typography>
                    <Typography variant="h3" fontWeight={800} color="primary.dark">{kpi.totalPendingSO}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card 
                  onClick={() => navigate('/reports?tab=1')} 
                  sx={{ 
                    bgcolor: '#eff6ff', 
                    border: '1px solid #bfdbfe', 
                    boxShadow: 'none',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#dbeafe', transition: 'all 0.2s' }
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Pending SO Qty</Typography>
                    <Typography variant="h3" fontWeight={800} color="primary.dark">{kpi.totalPendingSOQty}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card 
                  onClick={() => navigate('/reports?tab=1')} 
                  sx={{ 
                    bgcolor: '#fff7ed', 
                    border: '1px solid #fed7aa', 
                    boxShadow: 'none',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#ffedd5', transition: 'all 0.2s' }
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Partially Dispatched</Typography>
                    <Typography variant="h3" fontWeight={800} color="warning.dark">{kpi.partiallyDispatchedOrders}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Purchase Order Pending Cards */}
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, color: 'success.main', mb: 2 }}>
              Inbound Purchase Orders
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Card 
                  onClick={() => navigate('/reports?tab=2')} 
                  sx={{ 
                    bgcolor: '#ecfdf5', 
                    border: '1px solid #a7f3d0', 
                    boxShadow: 'none',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#d1fae5', transition: 'all 0.2s' }
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Pending POs</Typography>
                    <Typography variant="h3" fontWeight={800} color="success.dark">{kpi.totalPendingPO}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card 
                  onClick={() => navigate('/reports?tab=2')} 
                  sx={{ 
                    bgcolor: '#ecfdf5', 
                    border: '1px solid #a7f3d0', 
                    boxShadow: 'none',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#d1fae5', transition: 'all 0.2s' }
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Pending PO Qty</Typography>
                    <Typography variant="h3" fontWeight={800} color="success.dark">{kpi.totalPendingPOQty}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card 
                  onClick={() => navigate('/reports?tab=2')} 
                  sx={{ 
                    bgcolor: '#fff7ed', 
                    border: '1px solid #fed7aa', 
                    boxShadow: 'none',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#ffedd5', transition: 'all 0.2s' }
                  }}
                >
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Partially Received</Typography>
                    <Typography variant="h3" fontWeight={800} color="warning.dark">{kpi.partiallyReceivedPOs}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Charts & Lists */}
      <Grid container spacing={3}>
        {/* Trend Area Chart — Inbound vs Outbound (Dual Series) */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUp size={20} color="#1a73e8" /> Inbound vs Outbound Trend (Units — Last 7 Days)
            </Typography>
            <Box sx={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mergedTrends}>
                  <defs>
                    <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1a73e8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#1a73e8" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <ChartTooltip formatter={(value: any, name: string) => [`${value} units`, name]} />
                  <Legend />
                  <Area type="monotone" dataKey="Inbound" stroke="#1a73e8" fillOpacity={1} fill="url(#inboundGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Outbound" stroke="#f97316" fillOpacity={1} fill="url(#outboundGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>

        {/* Near Expiry List */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: '#f59e0b' }}>
              <AlertTriangle size={20} /> Expiry Watchlist
            </Typography>
            <TableContainer component={Box}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Batch</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Item</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Expiry</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {nearExpiry.map((row: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell>{row.BatchNumber}</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{row.ItemName}</TableCell>
                      <TableCell color="error.main" sx={{ color: 'error.main', fontWeight: 600 }}>
                        {row.ExpiryDate ? new Date(row.ExpiryDate).toLocaleDateString() : 'N/A'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {nearExpiry.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center">No items expiring soon</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
