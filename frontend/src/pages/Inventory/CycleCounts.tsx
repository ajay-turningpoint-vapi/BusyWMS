import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Dialog, DialogTitle, 
  DialogContent, DialogActions, TextField, FormControl, 
  InputLabel, Select, MenuItem, Chip, Alert, CircularProgress, 
  Grid, Tab, Tabs, Divider
} from '@mui/material';
import { Plus, CheckCircle, RefreshCw, ClipboardList, Eye, FileDown } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import StatusFilter from '../../components/StatusFilter';
import ConfirmDialog from '../../components/ConfirmDialog';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function CycleCounts() {
  const [tabValue, setTabValue] = useState(0);
  const [cycleCounts, setCycleCounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search & Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const pagination = usePagination(25);

  // Confirm Reconciliation State
  const [reconcileConfirmOpen, setReconcileConfirmOpen] = useState(false);
  const [reconcileTargetId, setReconcileTargetId] = useState<number | null>(null);

  // Lookup data
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);

  // Dialog States
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [countDialogOpen, setCountDialogOpen] = useState(false);

  // Form states
  const [selectedCC, setSelectedCC] = useState<any>(null);
  const [ccDetails, setCcDetails] = useState<any[]>([]);
  const [newCC, setNewCC] = useState({
    warehouseId: '',
    zoneId: '',
    countType: 'FULL',
    notes: ''
  });

  // Count entry states (holding actual counted inputs)
  const [countedItems, setCountedItems] = useState<{ [detailId: number]: { qty: number; notes: string } }>({});

  const { user } = useAuthStore();
  const isManager = user?.role === 'Admin' || user?.role === 'Warehouse Manager';

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const countsRes = await api.get('/inventory/cycle-counts');
      setCycleCounts(countsRes.data);
      
      const whRes = await api.get('/masters/warehouses');
      setWarehouses(whRes.data);
      
      const zoneRes = await api.get('/masters/zones');
      setZones(zoneRes.data);
      
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch cycle count requests.');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateOpen = () => {
    setNewCC({ warehouseId: '', zoneId: '', countType: 'FULL', notes: '' });
    setCreateDialogOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCC.warehouseId) {
      setError('Warehouse is required.');
      return;
    }

    try {
      await api.post('/inventory/cycle-count', newCC);
      toast.showSuccess('Cycle Count Request created successfully.');
      setCreateDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to create count request');
    }
  };

  const handleViewDetails = async (cc: any) => {
    setSelectedCC(cc);
    try {
      const res = await api.get(`/inventory/cycle-count/${cc.CycleCountId}`);
      setCcDetails(res.data);
      setDetailsDialogOpen(true);
    } catch (err: any) {
      setError('Failed to fetch cycle count details.');
    }
  };

  const handleOpenCountEntry = async (cc: any) => {
    setSelectedCC(cc);
    try {
      const res = await api.get(`/inventory/cycle-count/${cc.CycleCountId}`);
      setCcDetails(res.data);
      
      // Initialize counts input values with existing CountedQty or system values
      const initialCounts: any = {};
      res.data.forEach((item: any) => {
        initialCounts[item.CountDetailId] = {
          qty: item.CountedQty !== null ? item.CountedQty : item.SystemQty,
          notes: item.Notes || ''
        };
      });
      setCountedItems(initialCounts);
      setCountDialogOpen(true);
    } catch (err: any) {
      setError('Failed to fetch count lines for entry.');
    }
  };

  const handleCountQtyChange = (detailId: number, qty: string) => {
    setCountedItems(prev => ({
      ...prev,
      [detailId]: {
        ...prev[detailId],
        qty: Number(qty)
      }
    }));
  };

  const handleCountNotesChange = (detailId: number, notes: string) => {
    setCountedItems(prev => ({
      ...prev,
      [detailId]: {
        ...prev[detailId],
        notes
      }
    }));
  };

  const handleCountSubmit = async () => {
    try {
      const payload = {
        cycleCountId: selectedCC.CycleCountId,
        items: Object.keys(countedItems).map(id => ({
          countDetailId: Number(id),
          countedQty: countedItems[Number(id)].qty,
          notes: countedItems[Number(id)].notes
        }))
      };
      
      await api.post('/inventory/cycle-count/record', payload);
      toast.showSuccess('Physical counts recorded successfully.');
      setCountDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to submit count values');
    }
  };

  const handleApproveCount = (ccId: number) => {
    setReconcileTargetId(ccId);
    setReconcileConfirmOpen(true);
  };

  const confirmReconcile = async () => {
    if (!reconcileTargetId) return;
    setReconcileConfirmOpen(false);
    try {
      await api.post('/inventory/cycle-count/approve', { cycleCountId: reconcileTargetId, remarks: 'Approved from WMS Dashboard' });
      toast.showSuccess('Cycle Count approved. Inventory reconciled.');
      setDetailsDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Reconciliation failed.');
    }
    setReconcileTargetId(null);
  };

  // Filter and Search logic
  const filteredCounts = useMemo(() => {
    let data = cycleCounts;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((cc: any) =>
        cc.CountCode?.toLowerCase().includes(q) ||
        cc.WarehouseName?.toLowerCase().includes(q) ||
        (cc.ZoneName && cc.ZoneName.toLowerCase().includes(q)) ||
        (cc.CountedByName && cc.CountedByName.toLowerCase().includes(q))
      );
    }
    if (statusFilter) {
      data = data.filter((cc: any) => cc.Status === statusFilter);
    }
    return data;
  }, [cycleCounts, searchQuery, statusFilter]);

  const paginatedCounts = pagination.paginate(filteredCounts);

  const handleExportCSV = () => {
    exportToCSV(filteredCounts, [
      { key: 'CountCode', header: 'Count Code' },
      { key: 'WarehouseName', header: 'Warehouse' },
      { key: 'ZoneName', header: 'Zone' },
      { key: 'CountType', header: 'Type' },
      { key: 'CreatedAt', header: 'Created At' },
      { key: 'CountedByName', header: 'Operator' },
      { key: 'Status', header: 'Status' }
    ], 'CycleCounts');
  };

  const getStatusChip = (status: string) => {
    if (status === 'APPROVED') return <Chip label="Reconciled" color="success" size="small" sx={{ fontWeight: 600 }} />;
    if (status === 'COMPLETED') return <Chip label="Counted (Pending Review)" color="warning" size="small" sx={{ fontWeight: 600 }} />;
    return <Chip label="Pending Count" color="default" size="small" sx={{ fontWeight: 600 }} />;
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Cycle Counting & Stock Audits</Typography>
          <Typography variant="body2" color="text.secondary">Plan, record, and reconcile physical inventory audits with system stock levels.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={handleExportCSV} sx={{ fontWeight: 600 }}>
            Export CSV
          </Button>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={handleCreateOpen} sx={{ fontWeight: 600 }}>
            Initiate Stock Count
          </Button>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search and Filters Bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search count request..." />
        <StatusFilter
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'COMPLETED', label: 'Counted (Pending Review)' },
            { value: 'APPROVED', label: 'Reconciled' },
          ]}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredCounts.length} of {cycleCounts.length} requests
        </Typography>
      </Box>

      <Card>
        <TableContainer>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Count Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Warehouse</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Zone Filter</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Count Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date Created</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Assigned Operator</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedCounts.map((cc: any) => (
                  <TableRow key={cc.CycleCountId} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{cc.CountCode}</TableCell>
                    <TableCell>{cc.WarehouseName}</TableCell>
                    <TableCell>{cc.ZoneName || 'All Zones'}</TableCell>
                    <TableCell>
                      <Chip label={cc.CountType} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{new Date(cc.CreatedAt).toLocaleString()}</TableCell>
                    <TableCell>{cc.CountedByName}</TableCell>
                    <TableCell>{getStatusChip(cc.Status)}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          startIcon={<Eye size={12} />} 
                          onClick={() => handleViewDetails(cc)}
                        >
                          View Lines
                        </Button>
                        {cc.Status === 'PENDING' && (
                          <Button 
                            size="small" 
                            variant="contained" 
                            onClick={() => handleOpenCountEntry(cc)}
                          >
                            Enter Count
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredCounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                      {cycleCounts.length === 0 ? 'No cycle count tasks registered.' : 'No results match search query.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        <TablePaginationBar
          count={filteredCounts.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>

      {/* Dialog 1: Create Cycle Count Request */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={handleCreateSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>Initiate New Stock Audit</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <FormControl fullWidth size="small" required>
                <InputLabel>Warehouse</InputLabel>
                <Select
                  value={newCC.warehouseId}
                  label="Warehouse"
                  onChange={(e) => setNewCC({ ...newCC, warehouseId: e.target.value })}
                >
                  {warehouses.map(wh => <MenuItem key={wh.WarehouseId} value={wh.WarehouseId}>{wh.Name}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Zone (Optional)</InputLabel>
                <Select
                  value={newCC.zoneId}
                  label="Zone (Optional)"
                  onChange={(e) => setNewCC({ ...newCC, zoneId: e.target.value })}
                >
                  <MenuItem value=""><em>All Zones</em></MenuItem>
                  {zones.filter(z => Number(z.WarehouseId) === Number(newCC.warehouseId)).map(z => (
                    <MenuItem key={z.ZoneId} value={z.ZoneId}>{z.Name}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Count Scope</InputLabel>
                <Select
                  value={newCC.countType}
                  label="Count Scope"
                  onChange={(e) => setNewCC({ ...newCC, countType: e.target.value })}
                >
                  <MenuItem value="FULL">Full Audit (All Items)</MenuItem>
                  <MenuItem value="PARTIAL">Partial Spot Count</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Audit Remarks / Instructions"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={newCC.notes}
                onChange={(e) => setNewCC({ ...newCC, notes: e.target.value })}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Create Audit Task</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dialog 2: View Details & Reconcile */}
      <Dialog open={detailsDialogOpen} onClose={() => setDetailsDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Stock Audit Lines ({selectedCC?.CountCode})</span>
          {getStatusChip(selectedCC?.Status || '')}
        </DialogTitle>
        <DialogContent dividers>
          {selectedCC?.Notes && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>Instructions:</strong> {selectedCC.Notes}
            </Alert>
          )}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Bin Locator</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Batch</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>System Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Counted Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Variance</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Line Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ccDetails.map((ccd) => {
                  const systemQty = Number(ccd.SystemQty);
                  const countedQty = ccd.CountedQty !== null ? Number(ccd.CountedQty) : null;
                  const variance = countedQty !== null ? countedQty - systemQty : 0;
                  
                  return (
                    <TableRow key={ccd.CountDetailId}>
                      <TableCell sx={{ fontWeight: 600 }}>{ccd.BinCode}</TableCell>
                      <TableCell>{ccd.ItemCode}</TableCell>
                      <TableCell>{ccd.ItemName}</TableCell>
                      <TableCell>{ccd.BatchNumber || 'N/A'}</TableCell>
                      <TableCell>{systemQty.toFixed(3)}</TableCell>
                      <TableCell>{countedQty !== null ? countedQty.toFixed(3) : <span style={{color: 'grey'}}>Not counted</span>}</TableCell>
                      <TableCell sx={{ 
                        fontWeight: 700, 
                        color: variance > 0 ? 'success.main' : (variance < 0 ? 'error.main' : 'text.primary') 
                      }}>
                        {countedQty !== null ? (variance > 0 ? `+${variance}` : variance) : '-'}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={ccd.Status} 
                          color={ccd.Status === 'COMPLETED' ? 'success' : 'default'} 
                          size="small" 
                          variant="outlined" 
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
          {selectedCC?.Status === 'COMPLETED' && isManager && (
            <Button 
              variant="contained" 
              color="success" 
              startIcon={<CheckCircle size={16} />}
              onClick={() => handleApproveCount(selectedCC.CycleCountId)}
            >
              Approve & Reconcile Stock
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialog 3: Operator Count Entry Form */}
      <Dialog open={countDialogOpen} onClose={() => setCountDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700 }}>Record Physical Inventory Counts</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
            Scan/inspect bins and enter the exact quantities found. Leaving empty counts default to system values.
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Bin Locator</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Batch</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>System Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} style={{ width: 160 }}>Physical Count</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Notes / Mismatch Cause</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ccDetails.map((ccd) => (
                  <TableRow key={ccd.CountDetailId}>
                    <TableCell sx={{ fontWeight: 600 }}>{ccd.BinCode}</TableCell>
                    <TableCell>{ccd.ItemName} ({ccd.ItemCode})</TableCell>
                    <TableCell>{ccd.BatchNumber || 'Standard'}</TableCell>
                    <TableCell>{Number(ccd.SystemQty).toFixed(3)}</TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        value={countedItems[ccd.CountDetailId]?.qty ?? ''}
                        onChange={(e) => handleCountQtyChange(ccd.CountDetailId, e.target.value)}
                        inputProps={{ min: 0 }}
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        placeholder="Optional remarks"
                        value={countedItems[ccd.CountDetailId]?.notes || ''}
                        onChange={(e) => handleCountNotesChange(ccd.CountDetailId, e.target.value)}
                        fullWidth
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCountDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCountSubmit}>Submit Audit Counts</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={reconcileConfirmOpen}
        title="Approve Cycle Count Reconciliation"
        message="Are you sure you want to approve this cycle count and reconcile the stock in inventory? This will make immediate adjustments to active inventory balances."
        confirmLabel="Approve & Reconcile"
        confirmColor="warning"
        onConfirm={confirmReconcile}
        onCancel={() => { setReconcileConfirmOpen(false); setReconcileTargetId(null); }}
      />
    </Box>
  );
}
