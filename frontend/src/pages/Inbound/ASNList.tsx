import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, CircularProgress, Alert, 
  Chip, Grid, TextField, MenuItem, FormControl, InputLabel, 
  Select, IconButton, Tooltip, Paper
} from '@mui/material';
import { Search, Filter, Plus, Edit2, Trash2, Calendar, RefreshCw, Eye, ArrowRight, FileDown } from 'lucide-react';
import api from '../../services/api';
import TransactionLink from '../../components/TransactionLink';
import { useAuthStore } from '../../store/authStore';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import ConfirmDialog from '../../components/ConfirmDialog';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function ASNList() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [asns, setAsns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const toast = useToast();

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const pagination = usePagination(25);

  // Confirm delete dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  
  // Lookups for filters
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  // Filter States
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');

  // Permissions check
  const canCreate = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Inbound' && p.CanCreate === 1);
  const canUpdate = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Inbound' && p.CanUpdate === 1);
  const canDelete = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Inbound' && p.CanDelete === 1);

  const loadLookups = async () => {
    try {
      const [supRes, whRes] = await Promise.all([
        api.get('/masters/suppliers'),
        api.get('/masters/warehouses')
      ]);
      setSuppliers(supRes.data);
      setWarehouses(whRes.data);
    } catch (err) {
      console.error('Failed to load filters lookup', err);
    }
  };

  const loadASNs = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (statusFilter) params.status = statusFilter;
      if (supplierFilter) params.supplierId = supplierFilter;
      if (warehouseFilter) params.warehouseId = warehouseFilter;

      const res = await api.get('/inbound/asn', { params });
      setAsns(res.data);
      setLoading(false);
    } catch (err: any) {
      setError('Failed to fetch Advanced Shipment Notices');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
    loadASNs();
  }, []);

  const handleApplyFilters = () => {
    loadASNs();
  };

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setStatusFilter('');
    setSupplierFilter('');
    setWarehouseFilter('');
    
    // Call load with empty params directly
    setLoading(true);
    api.get('/inbound/asn')
      .then(res => {
        setAsns(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to fetch ASNs');
        setLoading(false);
      });
  };

  const handleDelete = (id: number) => {
    setDeleteTarget(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setConfirmOpen(false);
    try {
      await api.delete(`/inbound/asn/${deleteTarget}`);
      setAsns(prev => prev.filter(a => a.ASNId !== deleteTarget));
      toast.showSuccess('Advanced Shipment Notice deleted.');
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to delete ASN');
    }
    setDeleteTarget(null);
  };

  // Client-side search logic in addition to backend params filters
  const filteredASNs = useMemo(() => {
    let data = asns;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((a: any) =>
        a.ASNNumber?.toLowerCase().includes(q) ||
        a.SupplierName?.toLowerCase().includes(q) ||
        (a.POCode && a.POCode.toLowerCase().includes(q)) ||
        (a.VehicleNumber && a.VehicleNumber.toLowerCase().includes(q)) ||
        (a.Transporter && a.Transporter.toLowerCase().includes(q))
      );
    }
    return data;
  }, [asns, searchQuery]);

  const paginatedASNs = pagination.paginate(filteredASNs);

  const handleExportCSV = () => {
    exportToCSV(filteredASNs, [
      { key: 'ASNNumber', header: 'ASN Number' },
      { key: 'SupplierName', header: 'Supplier' },
      { key: 'POCode', header: 'PO Ref' },
      { key: 'WarehouseName', header: 'Warehouse' },
      { key: 'ExpectedArrivalDate', header: 'Expected Arrival' },
      { key: 'VehicleNumber', header: 'Vehicle Number' },
      { key: 'Status', header: 'Status' }
    ], 'ASN_List');
  };

  const getStatusChipColor = (status: string) => {
    switch (status) {
      case 'Draft': return { color: 'default', bgcolor: '#f1f5f9', text: '#64748b' };
      case 'Confirmed': return { color: 'primary', bgcolor: '#eff6ff', text: '#3b82f6' };
      case 'In Transit': return { color: 'info', bgcolor: '#faf5ff', text: '#a855f7' };
      case 'Partially Received': return { color: 'warning', bgcolor: '#fff7ed', text: '#f97316' };
      case 'Fully Received': return { color: 'success', bgcolor: '#ecfdf5', text: '#10b981' };
      case 'Cancelled': return { color: 'error', bgcolor: '#fef2f2', text: '#ef4444' };
      default: return { color: 'default', bgcolor: '#f1f5f9', text: '#64748b' };
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Header section */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Advanced Shipment Notices (ASN)</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage pre-shipment documentation and coordinate incoming receiving activities.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={handleExportCSV} sx={{ fontWeight: 600 }}>
            Export CSV
          </Button>
          <Button 
            variant="outlined" 
            onClick={() => navigate('/inbound/asn/dashboard')}
          >
            ASN Dashboard
          </Button>
          {canCreate && (
            <Button 
              variant="contained" 
              startIcon={<Plus size={18} />}
              onClick={() => navigate('/inbound/asn/create')}
            >
              Create ASN
            </Button>
          )}
        </Box>
      </Box>

      {/* Search Bar next to Filters */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search ASN, Supplier, PO, Vehicle..." />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredASNs.length} of {asns.length} ASNs
        </Typography>
      </Box>

      {/* Filter panel */}
      <Card sx={{ mb: 4, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              label="Expected Start Date"
              type="date"
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              label="Expected End Date"
              type="date"
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: startDate }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={!startDate}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="Draft">Draft</MenuItem>
                <MenuItem value="Confirmed">Confirmed</MenuItem>
                <MenuItem value="In Transit">In Transit</MenuItem>
                <MenuItem value="Partially Received">Partially Received</MenuItem>
                <MenuItem value="Fully Received">Fully Received</MenuItem>
                <MenuItem value="Cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2.5}>
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
          <Grid item xs={12} sm={6} md={2}>
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
          <Grid item xs={12} md={1.5} sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              fullWidth
              size="small"
              startIcon={<Filter size={14} />}
              onClick={handleApplyFilters}
            >
              Filter
            </Button>
            <IconButton 
              size="small" 
              onClick={handleResetFilters} 
              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
            >
              <RefreshCw size={14} />
            </IconButton>
          </Grid>
        </Grid>
      </Card>

      {/* Main List */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filteredASNs.length === 0 ? (
        <Paper sx={{ textAlign: 'center', py: 8, px: 2, bgcolor: 'background.paper' }}>
          <Typography variant="h4" sx={{ fontWeight: 600, mb: 1, color: 'text.secondary' }}>No Shipment Notices Match Search</Typography>
          <Typography variant="body2" color="text.secondary">
            Adjust your search query or filters above.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ASN Number</TableCell>
                <TableCell>Supplier</TableCell>
                <TableCell>PO Reference</TableCell>
                <TableCell>Warehouse</TableCell>
                <TableCell>Expected Arrival</TableCell>
                <TableCell>Vehicle / Transporter</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedASNs.map((row: any) => {
                const statusStyle = getStatusChipColor(row.Status);
                return (
                  <TableRow key={row.ASNId} hover>
                    <TableCell>
                      <TransactionLink type="ASN" id={row.ASNId} label={row.ASNNumber} />
                    </TableCell>
                    <TableCell>{row.SupplierName}</TableCell>
                    <TableCell>
                      {row.POCode ? (
                        <TransactionLink type="PO" id={row.POId} label={row.POCode} />
                      ) : (
                        <Typography variant="body2" color="text.secondary">Direct</Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.WarehouseName}</TableCell>
                    <TableCell>
                      {new Date(row.ExpectedArrivalDate).toLocaleString([], {
                        year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </TableCell>
                    <TableCell>
                      {row.VehicleNumber || row.Transporter ? (
                        <Typography variant="body2">
                          {row.VehicleNumber || 'N/A'} <span style={{ color: '#94a3b8', fontSize: '11px' }}>({row.Transporter || 'Direct'})</span>
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={row.Status} 
                        size="small"
                        sx={{ 
                          bgcolor: statusStyle.bgcolor, 
                          color: statusStyle.text, 
                          fontWeight: 700,
                          borderRadius: 2
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        {/* If status is Draft, Confirmed or In Transit, show mobile receipt simulator link */}
                        {['Confirmed', 'In Transit', 'Partially Received'].includes(row.Status) && (
                          <Tooltip title="Process Goods Receipt on Scanner">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => navigate('/mobile')}
                            >
                              <ArrowRight size={18} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canUpdate && row.Status === 'Draft' && (
                          <Tooltip title="Edit ASN Draft">
                            <IconButton 
                              size="small"
                              onClick={() => navigate(`/inbound/asn/edit/${row.ASNId}`)}
                            >
                              <Edit2 size={18} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canDelete && (row.Status === 'Draft' || row.Status === 'Cancelled') && (
                          <Tooltip title="Delete ASN">
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={() => handleDelete(row.ASNId)}
                            >
                              <Trash2 size={18} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {!loading && (
        <TablePaginationBar
          count={filteredASNs.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Advanced Shipment Notice"
        message="Are you sure you want to delete this Advanced Shipment Notice? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
      />
    </Box>
  );
}
