import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Grid, Card, CardContent, Typography, Box, 
  CircularProgress, Alert, Button, Paper, TextField, MenuItem, FormControl, InputLabel, Select, IconButton
} from '@mui/material';
import { 
  FileSpreadsheet, ClipboardList, Package, Clock, 
  AlertTriangle, CheckCircle, RefreshCw, Calendar, ArrowRight
} from 'lucide-react';
import { 
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip as ChartTooltip, ResponsiveContainer, PieChart, Pie, Legend
} from 'recharts';
import api from '../../services/api';

export default function ASNDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  // Filters State
  const [dateFilter, setDateFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');

  // Lookups
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const loadLookups = async () => {
    try {
      const [supRes, whRes] = await Promise.all([
        api.get('/masters/suppliers'),
        api.get('/masters/warehouses')
      ]);
      setSuppliers(supRes.data);
      setWarehouses(whRes.data);
    } catch (err) {
      console.error('Failed to load filter lookups', err);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (dateFilter) params.date = dateFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      if (warehouseFilter) params.warehouseId = warehouseFilter;

      const res = await api.get('/inbound/asn/dashboard', { params });
      setData(res.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch ASN dashboard statistics.');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
    loadDashboardData();
  }, []);

  const handleApplyFilters = () => {
    loadDashboardData();
  };

  const handleResetFilters = () => {
    setDateFilter('');
    setSupplierFilter('');
    setWarehouseFilter('');
    setLoading(true);
    api.get('/inbound/asn/dashboard')
      .then(res => {
        setData(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch statistics');
        setLoading(false);
      });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return <Alert severity="error">{error || 'Data loading error'}</Alert>;
  }

  const kpi = data.kpi;
  const statusBreakdown = data.statusBreakdown || [];
  const arrivalsTimeline = data.arrivalsTimeline || [];

  // Chart data formatters
  const COLORS = ['#3b82f6', '#a855f7', '#10b981', '#f97316', '#ef4444', '#64748b'];

  const pieData = statusBreakdown.map((row: any) => ({
    name: row.status,
    value: row.count
  }));

  const timelineData = arrivalsTimeline.map((row: any) => ({
    Date: new Date(row.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    Shipments: row.count
  }));

  const cardData = [
    { title: 'Total ASNs Created', value: kpi.totalCreated, icon: <FileSpreadsheet color="#3b82f6" />, color: '#eff6ff', desc: 'All registered notices' },
    { title: 'Goods In Transit', value: kpi.inTransit, icon: <Package color="#a855f7" />, color: '#faf5ff', desc: 'Dispatched from vendor' },
    { title: 'Expected Today', value: kpi.expectedToday, icon: <Calendar color="#0d9488" />, color: '#f0fdfa', desc: 'Incoming arrivals due today' },
    { title: 'Delayed Shipments', value: kpi.delayed, icon: <Clock color="#ef4444" />, color: '#fef2f2', desc: 'Expected but past arrival time' },
    { title: 'Partially Received', value: kpi.partiallyReceived, icon: <AlertTriangle color="#f97316" />, color: '#fff7ed', desc: 'Under receiving process' },
    { title: 'Fully Received', value: kpi.fullyReceived, icon: <CheckCircle color="#10b981" />, color: '#ecfdf5', desc: 'Successfully put away' }
  ];

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Top Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>ASN Management Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">
            Trace inbound shipping schedules, monitor delays, and track receiving status.
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          endIcon={<ArrowRight size={16} />}
          onClick={() => navigate('/inbound/asn')}
        >
          View ASN List
        </Button>
      </Box>

      {/* Filter panel */}
      <Card sx={{ mb: 4, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              label="Expected Arrival Date"
              type="date"
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3.5}>
            <FormControl fullWidth size="small">
              <InputLabel>Supplier</InputLabel>
              <Select
                value={supplierFilter}
                label="Supplier"
                onChange={(e) => setSupplierFilter(e.target.value)}
              >
                <MenuItem value="">All Suppliers</MenuItem>
                {suppliers.map(sup => (
                  <MenuItem key={sup.SupplierId} value={sup.SupplierId}>{sup.Name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3.5}>
            <FormControl fullWidth size="small">
              <InputLabel>Warehouse</InputLabel>
              <Select
                value={warehouseFilter}
                label="Warehouse"
                onChange={(e) => setWarehouseFilter(e.target.value)}
              >
                <MenuItem value="">All Warehouses</MenuItem>
                {warehouses.map(wh => (
                  <MenuItem key={wh.WarehouseId} value={wh.WarehouseId}>{wh.Name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2} sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              fullWidth
              onClick={handleApplyFilters}
            >
              Filter
            </Button>
            <IconButton 
              onClick={handleResetFilters} 
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <RefreshCw size={16} />
            </IconButton>
          </Grid>
        </Grid>
      </Card>

      {/* KPI Widgets */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {cardData.map((card, idx) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={idx}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Box sx={{ bgcolor: card.color, p: 1, borderRadius: 2, display: 'flex' }}>
                    {card.icon}
                  </Box>
                  <Typography variant="h2" sx={{ fontWeight: 800 }}>
                    {card.value}
                  </Typography>
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700 }} color="text.primary">
                  {card.title}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {card.desc}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts section */}
      <Grid container spacing={3}>
        {/* Status Breakdown Pie Chart */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>ASN Status Distribution</Typography>
              {pieData.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
                  <Typography color="text.secondary">No status data to display</Typography>
                </Box>
              ) : (
                <Box sx={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Arrivals Timeline Bar Chart */}
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '400px', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>Expected Inbound Shipments (Next 7 Days)</Typography>
              {timelineData.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
                  <Typography color="text.secondary">No upcoming shipments scheduled</Typography>
                </Box>
              ) : (
                <Box sx={{ width: '100%', height: 280 }}>
                  <ResponsiveContainer>
                    <BarChart data={timelineData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="Date" />
                      <YAxis allowDecimals={false} />
                      <ChartTooltip />
                      <Bar dataKey="Shipments" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                        {timelineData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill="#3b82f6" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
