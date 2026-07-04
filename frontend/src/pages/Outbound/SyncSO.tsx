import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, CircularProgress, Alert, 
  Chip, Grid, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, 
  ListItemText, Divider, Autocomplete, TextField, Switch, FormControlLabel, IconButton
} from '@mui/material';
import { RefreshCw, CheckCircle2, XCircle, Play, ShoppingCart, Plus, Edit2, Trash2, X, PlusCircle, FileDown } from 'lucide-react';
import api from '../../services/api';
import TransactionLink from '../../components/TransactionLink';
import { useAuthStore } from '../../store/authStore';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import DateRangeFilter from '../../components/DateRangeFilter';
import StatusFilter from '../../components/StatusFilter';
import ConfirmDialog from '../../components/ConfirmDialog';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function SyncSO() {
  const [sos, setSos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [reserving, setReserving] = useState<number | null>(null);
  
  const [activeSO, setActiveSO] = useState<any>(null);
  const [soDetails, setSoDetails] = useState<any[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search, Filter, Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const pagination = usePagination(25);

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Dialog State
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editSoId, setEditSoId] = useState<number | null>(null);
  const [dialogError, setDialogError] = useState<string>('');

  // Lookups
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);

  // Form State
  const [soCode, setSoCode] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [customCustomer, setCustomCustomer] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerCode, setCustomerCode] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [soLines, setSoLines] = useState<any[]>([{ itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);

  // Permissions check
  const { user } = useAuthStore();
  const canCreate = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Outbound' && p.CanCreate === 1);
  const canUpdate = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Outbound' && p.CanUpdate === 1);
  const canDelete = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Outbound' && p.CanDelete === 1);

  const loadSOs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/outbound/sales-orders');
      setSos(res.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch sales order queue.');
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    try {
      const itemsRes = await api.get('/masters/items');
      setItemsList(itemsRes.data);
      const customersRes = await api.get('/masters/customers');
      setCustomersList(customersRes.data);
    } catch (err) {
      console.error('Failed to load lookups', err);
    }
  };

  useEffect(() => {
    loadSOs();
    loadLookups();
  }, []);

  const triggerSync = async () => {
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/sync/so');
      setSuccess(res.data.message);
      loadSOs();
    } catch (err) {
      setError('Sales order sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const handleReserve = async (soId: number) => {
    setReserving(soId);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/outbound/reserve', { soId });
      setSuccess(res.data.message);
      loadSOs();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Inventory reservation failed. Verify stock availability.');
    } finally {
      setReserving(null);
    }
  };

  const handleRelease = async (soId: number) => {
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/outbound/release', { soId });
      setSuccess(res.data.message);
      loadSOs();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to release reservation.');
    }
  };

  const viewDetails = async (so: any) => {
    setActiveSO(so);
    setDetailsLoading(true);
    try {
      const res = await api.get(`/outbound/so-details/${so.SOId}`);
      setSoDetails(res.data);
      setDetailsLoading(false);
    } catch (err) {
      console.error(err);
      setDetailsLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setDialogMode('create');
    setEditSoId(null);
    setSoCode('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setCustomCustomer(false);
    setSelectedCustomer(null);
    setCustomerCode('');
    setCustomerName('');
    setSoLines([{ itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);
    setDialogError('');
    setOpenDialog(true);
  };

  const handleOpenEdit = async (so: any) => {
    setDialogMode('edit');
    setEditSoId(so.SOId);
    setSoCode(so.SOCode);
    setOrderDate(so.OrderDate ? so.OrderDate.slice(0, 10) : new Date().toISOString().slice(0, 10));

    const matchingCustomer = customersList.find(c => c.Code === so.CustomerCode);
    if (matchingCustomer) {
      setSelectedCustomer(matchingCustomer);
      setCustomCustomer(false);
      setCustomerCode(so.CustomerCode);
      setCustomerName(so.CustomerName);
    } else {
      setSelectedCustomer(null);
      setCustomCustomer(true);
      setCustomerCode(so.CustomerCode);
      setCustomerName(so.CustomerName);
    }

    setDialogError('');
    setLoading(true);
    try {
      const linesRes = await api.get(`/outbound/so-details/${so.SOId}`);
      const formattedLines = linesRes.data.map((l: any) => ({
        itemId: l.ItemId,
        orderQty: l.OrderQty,
        unitPrice: l.UnitPrice || 0,
        uom: l.UOM
      }));
      setSoLines(formattedLines.length > 0 ? formattedLines : [{ itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);
      setOpenDialog(true);
    } catch (err) {
      setError('Failed to fetch Sales Order details.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (soId: number) => {
    setDeleteTarget(soId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setConfirmOpen(false);
    try {
      await api.delete(`/outbound/sales-orders/${deleteTarget}`);
      toast.showSuccess('Sales Order deleted.');
      loadSOs();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to delete SO.');
    }
    setDeleteTarget(null);
  };

  // Filtered + Searched data
  const filteredSOs = useMemo(() => {
    let data = sos;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((so: any) =>
        so.SOCode?.toLowerCase().includes(q) ||
        so.CustomerName?.toLowerCase().includes(q) ||
        so.CustomerCode?.toLowerCase().includes(q) ||
        so.Salesman?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      data = data.filter((so: any) => so.Status === statusFilter);
    }
    if (startDate) {
      data = data.filter((so: any) => so.OrderDate >= startDate);
    }
    if (endDate) {
      data = data.filter((so: any) => so.OrderDate <= endDate + 'T23:59:59');
    }
    return data;
  }, [sos, searchQuery, statusFilter, startDate, endDate]);

  const paginatedSOs = pagination.paginate(filteredSOs);

  const handleExportCSV = () => {
    exportToCSV(filteredSOs, [
      { key: 'SOCode', header: 'SO Number' },
      { key: 'CustomerName', header: 'Customer' },
      { key: 'CustomerCode', header: 'Customer Code' },
      { key: 'Salesman', header: 'Salesman' },
      { key: 'OrderDate', header: 'Order Date' },
      { key: 'Status', header: 'Status' },
    ], 'SalesOrders');
  };

  const handleAddLine = () => {
    setSoLines([...soLines, { itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    const updated = [...soLines];
    updated.splice(index, 1);
    setSoLines(updated.length > 0 ? updated : [{ itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...soLines];
    updated[index] = { ...updated[index], [field]: value };
    
    if (field === 'itemId') {
      const item = itemsList.find(i => i.ItemId === value);
      if (item) {
        updated[index].uom = item.UOM || 'PCS';
        updated[index].unitPrice = item.SellingPrice || 0;
      }
    }
    setSoLines(updated);
  };

  const handleSaveSO = async () => {
    setDialogError('');
    
    let finalCode = customerCode;
    let finalName = customerName;
    if (!customCustomer && selectedCustomer) {
      finalCode = selectedCustomer.Code;
      finalName = selectedCustomer.Name;
    }

    const payload = {
      SOCode: soCode,
      CustomerCode: finalCode,
      CustomerName: finalName,
      OrderDate: orderDate,
      Items: soLines.map(l => ({
        ItemId: l.itemId,
        OrderQty: Number(l.orderQty),
        UnitPrice: Number(l.unitPrice),
        UOM: l.uom
      }))
    };

    try {
      if (dialogMode === 'create') {
        await api.post('/outbound/sales-orders', payload);
        setSuccess('Sales Order created successfully.');
      } else {
        await api.put(`/outbound/sales-orders/${editSoId}`, payload);
        setSuccess('Sales Order updated successfully.');
      }
      setOpenDialog(false);
      loadSOs();
    } catch (err: any) {
      if (err.response?.data?.errors) {
        setDialogError(err.response.data.errors.join('; '));
      } else {
        setDialogError(err.response?.data?.message || 'Failed to save Sales Order.');
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RESERVED': return 'success';
      case 'PARTIAL_RESERVED': return 'warning';
      case 'PICKING': return 'info';
      case 'PICKED': return 'secondary';
      case 'PACKED': return 'secondary';
      case 'DISPATCHED': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Sales Orders Management</Typography>
          <Typography variant="body2" color="text.secondary">
            Create, edit, and sync Sales Orders from external ERP systems, and perform FEFO/FIFO stock reservations.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={handleExportCSV} sx={{ fontWeight: 600 }}>
            Export CSV
          </Button>
          {canCreate && (
            <Button
              variant="contained"
              color="success"
              startIcon={<Plus size={16} />}
              onClick={handleOpenCreate}
              sx={{ fontWeight: 600 }}
            >
              Create SO
            </Button>
          )}
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />}
            onClick={triggerSync}
            disabled={syncing}
            sx={{ fontWeight: 600 }}
          >
            {syncing ? 'Syncing...' : 'Pull ERP SOs'}
          </Button>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search, Filter & Date Range Bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search SO, Customer..." />
        <StatusFilter
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
          options={[
            { value: 'PENDING', label: 'Pending' },
            { value: 'RESERVED', label: 'Reserved' },
            { value: 'PARTIAL_RESERVED', label: 'Partial Reserved' },
            { value: 'PICKING', label: 'Picking' },
            { value: 'PICKED', label: 'Picked' },
            { value: 'PACKED', label: 'Packed' },
            { value: 'DISPATCHED', label: 'Dispatched' },
          ]}
        />
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(v) => { setStartDate(v); pagination.resetPage(); }}
          onEndDateChange={(v) => { setEndDate(v); pagination.resetPage(); }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredSOs.length} of {sos.length} SOs
        </Typography>
      </Box>

      <Card sx={{ p: 2 }}>
        <TableContainer>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Sales Order</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Customer Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Salesman</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Order Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedSOs.map((so: any) => (
                  <TableRow key={so.SOId} hover>
                    <TableCell><TransactionLink type="SO" id={so.SOCode} /></TableCell>
                    <TableCell>{so.CustomerName} ({so.CustomerCode})</TableCell>
                    <TableCell>{so.Salesman || 'N/A'}</TableCell>
                    <TableCell>{new Date(so.OrderDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Chip label={so.Status} color={getStatusColor(so.Status)} size="small" sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Button size="small" variant="outlined" onClick={() => viewDetails(so)}>Lines</Button>
                        
                        {so.Status === 'PENDING' && (
                          <Button 
                            size="small" 
                            variant="contained" 
                            color="success" 
                            disabled={reserving === so.SOId}
                            onClick={() => handleReserve(so.SOId)}
                          >
                            {reserving === so.SOId ? 'Reserving...' : 'Auto Reserve'}
                          </Button>
                        )}

                        {so.Status.includes('RESERVED') && (
                          <Button 
                            size="small" 
                            variant="outlined" 
                            color="warning" 
                            onClick={() => handleRelease(so.SOId)}
                          >
                            Release
                          </Button>
                        )}

                        {canUpdate && so.Status === 'PENDING' && (
                          <IconButton size="small" color="primary" onClick={() => handleOpenEdit(so)}>
                            <Edit2 size={16} />
                          </IconButton>
                        )}
                        {canDelete && so.Status === 'PENDING' && (
                          <IconButton size="small" color="error" onClick={() => handleDelete(so.SOId)}>
                            <Trash2 size={16} />
                          </IconButton>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          </TableContainer>
          <TablePaginationBar
            count={filteredSOs.length}
            page={pagination.page}
            rowsPerPage={pagination.rowsPerPage}
            onPageChange={pagination.setPage}
            onRowsPerPageChange={pagination.setRowsPerPage}
          />
        </Card>

      {/* Details Dialog */}
      <Dialog open={!!activeSO} onClose={() => setActiveSO(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Sales Order Details: {activeSO?.SOCode}</DialogTitle>
        <DialogContent dividers>
          {detailsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 1 }}>Customer: <b>{activeSO?.CustomerName}</b></Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>Order Date: <b>{activeSO && new Date(activeSO.OrderDate).toLocaleDateString()}</b></Typography>
              <Divider sx={{ mb: 2 }} />
              <List sx={{ p: 0 }}>
                {soDetails.map((line) => (
                  <ListItem key={line.SODetailId} disablePadding sx={{ mb: 1.5 }}>
                    <ListItemText
                      primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>{line.ItemName} ({line.ItemCode})</Typography>}
                      secondary={
                        <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                          <Typography variant="caption">Ordered Qty: <b>{line.OrderQty} {line.UOM}</b></Typography>
                          <Typography variant="caption" color="success.main">Reserved Qty: <b>{line.ReservedQty} {line.UOM}</b></Typography>
                          <Typography variant="caption" color="primary.main">Picked Qty: <b>{line.PickedQty} {line.UOM}</b></Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveSO(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Synchronization Backdrop Loader */}
      <Dialog open={syncing} disableEscapeKeyDown PaperProps={{ sx: { p: 3, textAlign: 'center', maxWidth: 360 } }}>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
            <CircularProgress size={48} color="primary" />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Pulling ERP SOs</Typography>
            <Typography variant="body2" color="text.secondary">
              Synchronizing pending Sales Orders from Busy accounting ERP database... Please wait.
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Manual Entry / Edit Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{dialogMode === 'create' ? 'Create Sales Order' : 'Edit Sales Order'}</span>
          <IconButton size="small" onClick={() => setOpenDialog(false)}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {dialogError && <Alert severity="error" sx={{ mb: 2.5 }}>{dialogError}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="SO Number (Optional)"
                placeholder="Leave blank to auto-generate"
                value={soCode}
                onChange={(e) => setSoCode(e.target.value)}
                disabled={dialogMode === 'edit'}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Order Date"
                InputLabelProps={{ shrink: true }}
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={<Switch checked={customCustomer} onChange={(e) => setCustomCustomer(e.target.checked)} />}
                label="Manual Customer Entry"
              />
            </Grid>

            {customCustomer ? (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    required
                    label="Customer Code"
                    value={customerCode}
                    onChange={(e) => setCustomerCode(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    required
                    label="Customer Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </Grid>
              </>
            ) : (
              <Grid item xs={12}>
                <Autocomplete
                  size="small"
                  options={customersList}
                  getOptionLabel={(option) => `${option.Name} (${option.Code})`}
                  value={selectedCustomer}
                  onChange={(e, newVal) => setSelectedCustomer(newVal)}
                  renderInput={(params) => <TextField {...params} required label="Select Customer" />}
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Detail Lines</Typography>
                <Button 
                  size="small" 
                  variant="outlined" 
                  startIcon={<PlusCircle size={14} />} 
                  onClick={handleAddLine}
                >
                  Add Line
                </Button>
              </Box>

              <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'action.hover' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Item</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 100 }}>UOM</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 120 }}>Qty</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 140 }}>Unit Price</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 60, textAlign: 'center' }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {soLines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Autocomplete
                            size="small"
                            options={itemsList}
                            getOptionLabel={(option) => `${option.Name} (${option.Code})`}
                            value={itemsList.find(i => i.ItemId === line.itemId) || null}
                            onChange={(e, newVal) => handleLineChange(idx, 'itemId', newVal?.ItemId || '')}
                            renderInput={(params) => <TextField {...params} variant="standard" placeholder="Choose item" />}
                            disableClearable
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            variant="standard"
                            value={line.uom}
                            onChange={(e) => handleLineChange(idx, 'uom', e.target.value)}
                            placeholder="UOM"
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            variant="standard"
                            value={line.orderQty}
                            onChange={(e) => handleLineChange(idx, 'orderQty', e.target.value)}
                            inputProps={{ min: 1 }}
                          />
                        </TableCell>
                        <TableCell>
                          <TextField
                            fullWidth
                            size="small"
                            type="number"
                            variant="standard"
                            value={line.unitPrice}
                            onChange={(e) => handleLineChange(idx, 'unitPrice', e.target.value)}
                            inputProps={{ min: 0, step: 0.01 }}
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <IconButton size="small" color="error" onClick={() => handleRemoveLine(idx)}>
                            <Trash2 size={14} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleSaveSO}>
            Save SO
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Sales Order"
        message="Are you sure you want to delete this Sales Order? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
      />
    </Box>
  );
}
