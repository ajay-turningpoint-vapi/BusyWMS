import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, CircularProgress, Alert, 
  Chip, List, ListItem, ListItemText, Grid, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Autocomplete, IconButton,
  Divider, Switch, FormControlLabel, InputAdornment
} from '@mui/material';
import { RefreshCw, CheckCircle, AlertOctagon, History, Plus, Edit2, Trash2, X, PlusCircle, FileDown, Search } from 'lucide-react';
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
const formatDisplayDate = (dateVal: any) => {
  if (!dateVal) return 'N/A';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return 'N/A';
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

export default function SyncPO() {
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const toast = useToast();

  // Search, Filter, Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [totalCount, setTotalCount] = useState(0);
  const pagination = usePagination(25);

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setStatusFilter(statusInput);
    setStartDate(startDateInput);
    setEndDate(endDateInput);
    pagination.resetPage();
  };

  const handleClear = () => {
    setSearchInput('');
    setStatusInput('');
    setStartDateInput('');
    setEndDateInput('');

    setSearchQuery('');
    setStatusFilter('');
    setStartDate('');
    setEndDate('');
    pagination.resetPage();
  };

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Dialog State
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [editPoId, setEditPoId] = useState<number | null>(null);
  const [dialogError, setDialogError] = useState<string>('');
  
  // Lookups
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [suppliersList, setSuppliersList] = useState<any[]>([]);
  
  // Form State
  const [poCode, setPoCode] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState('');
  const [customSupplier, setCustomSupplier] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [vendorCode, setVendorCode] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [poLines, setPoLines] = useState<any[]>([{ itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);

  // Permissions check
  const { user } = useAuthStore();
  const canCreate = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Inbound' && p.CanCreate === 1);
  const canUpdate = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Inbound' && p.CanUpdate === 1);
  const canDelete = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Inbound' && p.CanDelete === 1);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(pagination.page));
      params.append('limit', String(pagination.rowsPerPage));
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter) params.append('status', statusFilter);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const posRes = await api.get(`/inbound/purchase-orders?${params.toString()}`);
      setPurchaseOrders(posRes.data.items || []);
      setTotalCount(posRes.data.total || 0);

      const logsRes = await api.get('/sync/logs');
      setSyncLogs(logsRes.data.filter((l: any) => l.SyncType === 'PO_SYNC'));
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch synchronized data.');
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    try {
      const itemsRes = await api.get('/masters/items');
      setItemsList(itemsRes.data);
      const suppliersRes = await api.get('/masters/suppliers');
      setSuppliersList(suppliersRes.data);
    } catch (err) {
      console.error('Failed to load lookups', err);
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    loadData();
  }, [pagination.page, pagination.rowsPerPage, searchQuery, statusFilter, startDate, endDate]);

  const triggerSync = async () => {
    setSyncing(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post('/sync/po');
      setSuccessMsg(res.data.message);
      loadData();
    } catch (err: any) {
      setError('ERP Sync failed. Please verify ERP web service availability.');
    } finally {
      setSyncing(false);
    }
  };

  const retryLog = async (logId: number) => {
    try {
      await api.post(`/sync/retry/${logId}`);
      loadData();
    } catch (err) {
      alert('Retry failed');
    }
  };

  const handleOpenCreate = () => {
    setDialogMode('create');
    setEditPoId(null);
    setPoCode('');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setDeliveryDate('');
    setCustomSupplier(false);
    setSelectedSupplier(null);
    setVendorCode('');
    setVendorName('');
    setPoLines([{ itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);
    setDialogError('');
    setOpenDialog(true);
  };

  const handleOpenEdit = async (po: any) => {
    setDialogMode('edit');
    setEditPoId(po.POId);
    setPoCode(po.POCode);
    setOrderDate(po.OrderDate ? po.OrderDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setDeliveryDate(po.DeliveryDate ? po.DeliveryDate.slice(0, 10) : '');
    
    // Check if supplier matches synced lookup
    const matchingSupplier = suppliersList.find(s => s.Code === po.VendorCode);
    if (matchingSupplier) {
      setSelectedSupplier(matchingSupplier);
      setCustomSupplier(false);
      setVendorCode(po.VendorCode);
      setVendorName(po.VendorName);
    } else {
      setSelectedSupplier(null);
      setCustomSupplier(true);
      setVendorCode(po.VendorCode);
      setVendorName(po.VendorName);
    }

    setDialogError('');
    setLoading(true);
    try {
      const linesRes = await api.get(`/inbound/purchase-orders/${po.POId}`);
      const formattedLines = linesRes.data.map((l: any) => ({
        itemId: l.ItemId,
        orderQty: l.OrderQty,
        unitPrice: l.UnitPrice || 0,
        uom: l.UOM
      }));
      setPoLines(formattedLines.length > 0 ? formattedLines : [{ itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);
      setOpenDialog(true);
    } catch (err) {
      setError('Failed to fetch PO details.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (poId: number) => {
    setDeleteTarget(poId);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setConfirmOpen(false);
    try {
      await api.delete(`/inbound/purchase-orders/${deleteTarget}`);
      toast.showSuccess('Purchase Order deleted.');
      loadData();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to delete PO.');
    }
    setDeleteTarget(null);
  };

  // Filtered and paginated POs are already computed on the server-side
  const filteredPOs = purchaseOrders;
  const paginatedPOs = purchaseOrders;

  const handleExportCSV = () => {
    exportToCSV(filteredPOs, [
      { key: 'POCode', header: 'PO Number' },
      { key: 'VendorName', header: 'Vendor' },
      { key: 'VendorCode', header: 'Vendor Code' },
      { key: 'PreparedBy', header: 'Prepared By' },
      { key: 'OrderDate', header: 'Order Date' },
      { key: 'Status', header: 'Status' },
    ], 'PurchaseOrders');
  };

  const handleAddLine = () => {
    setPoLines([...poLines, { itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);
  };

  const handleRemoveLine = (index: number) => {
    const updated = [...poLines];
    updated.splice(index, 1);
    setPoLines(updated.length > 0 ? updated : [{ itemId: '', orderQty: 1, unitPrice: 0, uom: '' }]);
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const updated = [...poLines];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto populate UOM and unitPrice if item is selected
    if (field === 'itemId') {
      const item = itemsList.find(i => i.ItemId === value);
      if (item) {
        updated[index].uom = item.UOM || 'PCS';
        updated[index].unitPrice = item.UnitCost || 0;
      }
    }
    setPoLines(updated);
  };

  const handleSavePO = async () => {
    setDialogError('');
    
    // Formulate final vendor details
    let finalCode = vendorCode;
    let finalName = vendorName;
    if (!customSupplier && selectedSupplier) {
      finalCode = selectedSupplier.Code;
      finalName = selectedSupplier.Name;
    }

    const payload = {
      POCode: poCode,
      VendorCode: finalCode,
      VendorName: finalName,
      OrderDate: orderDate,
      DeliveryDate: deliveryDate || null,
      Items: poLines.map(l => ({
        ItemId: l.itemId,
        OrderQty: Number(l.orderQty),
        UnitPrice: Number(l.unitPrice),
        UOM: l.uom
      }))
    };

    try {
      if (dialogMode === 'create') {
        await api.post('/inbound/purchase-orders', payload);
        setSuccessMsg('Purchase Order created successfully.');
      } else {
        await api.put(`/inbound/purchase-orders/${editPoId}`, payload);
        setSuccessMsg('Purchase Order updated successfully.');
      }
      setOpenDialog(false);
      loadData();
    } catch (err: any) {
      if (err.response?.data?.errors) {
        setDialogError(err.response.data.errors.join('; '));
      } else {
        setDialogError(err.response?.data?.message || 'Failed to save Purchase Order.');
      }
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Purchase Orders Management</Typography>
          <Typography variant="body2" color="text.secondary">
            Create, edit, and pull Purchase Orders from external ERP systems.
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
              Create PO
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
            {syncing ? 'Syncing...' : 'Pull ERP POs'}
          </Button>
        </Box>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search, Filter & Date Range Bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search PO, Vendor..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
          sx={{ minWidth: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} color="#888" />
              </InputAdornment>
            ),
          }}
        />
        <StatusFilter
          value={statusInput}
          onChange={(v) => setStatusInput(v)}
          options={[
            { value: '', label: 'All Status' },
            { value: 'PENDING', label: 'Pending' },
            { value: 'PARTIAL', label: 'Partial' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
        />
        <DateRangeFilter
          startDate={startDateInput}
          endDate={endDateInput}
          onStartDateChange={(v) => setStartDateInput(v)}
          onEndDateChange={(v) => setEndDateInput(v)}
        />
        <Button variant="contained" onClick={handleSearch} sx={{ fontWeight: 600 }}>
          Search
        </Button>
        {(searchInput || statusInput || startDateInput || endDateInput || searchQuery || statusFilter || startDate || endDate) && (
          <Button variant="outlined" color="secondary" onClick={handleClear} sx={{ fontWeight: 600 }}>
            Clear
          </Button>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          Total {totalCount} POs
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* PO List table */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h4" sx={{ mb: 2, fontWeight: 700 }}>Synced & Active PO Queue</Typography>
            <TableContainer>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>PO Number</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Vendor</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Prepared By</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Order Date</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedPOs.map((po: any) => (
                      <TableRow key={po.POId}>
                        <TableCell><TransactionLink type="PO" id={po.POCode} /></TableCell>
                        <TableCell>{po.VendorName} ({po.VendorCode})</TableCell>
                        <TableCell>{po.PreparedBy || 'N/A'}</TableCell>
                        <TableCell>{formatDisplayDate(po.OrderDate)}</TableCell>
                        <TableCell>
                          <Chip 
                            label={po.Status} 
                            color={po.Status === 'PENDING' ? 'info' : (po.Status === 'COMPLETED' ? 'success' : 'warning')} 
                            size="small" 
                            sx={{ fontWeight: 600 }} 
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1 }}>
                            {canUpdate && po.Status === 'PENDING' && (
                              <IconButton size="small" color="primary" onClick={() => handleOpenEdit(po)}>
                                <Edit2 size={16} />
                              </IconButton>
                            )}
                            {canDelete && po.Status === 'PENDING' && (
                              <IconButton size="small" color="error" onClick={() => handleDelete(po.POId)}>
                                <Trash2 size={16} />
                              </IconButton>
                            )}
                            {po.Status !== 'PENDING' && (
                              <Typography variant="caption" color="text.secondary">Locked</Typography>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPOs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                          {purchaseOrders.length === 0 ? "No Purchase Orders available. Click 'Create PO' or 'Pull ERP POs' to add." : 'No results match your search/filter criteria.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
            <TablePaginationBar
              count={totalCount}
              page={pagination.page}
              rowsPerPage={pagination.rowsPerPage}
              onPageChange={pagination.setPage}
              onRowsPerPageChange={pagination.setRowsPerPage}
            />
          </Card>
        </Grid>

        {/* Sync Logs */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h4" sx={{ mb: 2, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <History size={18} /> Integration logs
            </Typography>
            <List sx={{ maxHeight: 380, overflow: 'auto' }}>
              {syncLogs.map((log) => (
                <ListItem 
                  key={log.ApiLogId} 
                  sx={{ 
                    mb: 1.5, 
                    border: '1px solid', 
                    borderColor: 'divider', 
                    borderRadius: 2,
                    bgcolor: log.Status === 'SUCCESS' ? 'transparent' : '#fef2f2'
                  }}
                  secondaryAction={
                    log.Status === 'ERROR' && (
                      <Button size="small" variant="outlined" color="error" onClick={() => retryLog(log.ApiLogId)}>
                        Retry
                      </Button>
                    )
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{log.SyncType}</Typography>
                        {log.Status === 'SUCCESS' ? (
                          <CheckCircle size={14} color="#10b981" />
                        ) : (
                          <AlertOctagon size={14} color="#ef4444" />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {new Date(log.Timestamp).toLocaleString()}
                        </Typography>
                        {log.ErrorMessage && (
                          <Typography variant="caption" color="error.main" sx={{ fontStyle: 'italic', display: 'block' }}>
                            Error: {log.ErrorMessage}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
              {syncLogs.length === 0 && (
                <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
                  No integration logs available.
                </Typography>
              )}
            </List>
          </Card>
        </Grid>
      </Grid>

      {/* Synchronization Backdrop Loader */}
      <Dialog open={syncing} disableEscapeKeyDown PaperProps={{ sx: { p: 3, textAlign: 'center', maxWidth: 360 } }}>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
            <CircularProgress size={48} color="primary" />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Pulling ERP POs</Typography>
            <Typography variant="body2" color="text.secondary">
              Synchronizing pending Purchase Orders from Busy accounting ERP database... Please wait.
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Manual Entry / Edit Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{dialogMode === 'create' ? 'Create Purchase Order' : 'Edit Purchase Order'}</span>
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
                label="PO Number (Optional)"
                placeholder="Leave blank to auto-generate"
                value={poCode}
                onChange={(e) => setPoCode(e.target.value)}
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
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Delivery Date (Optional)"
                InputLabelProps={{ shrink: true }}
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={<Switch checked={customSupplier} onChange={(e) => setCustomSupplier(e.target.checked)} />}
                label="Manual Vendor Entry"
              />
            </Grid>

            {customSupplier ? (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    required
                    label="Vendor Code"
                    value={vendorCode}
                    onChange={(e) => setVendorCode(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    required
                    label="Vendor Name"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                  />
                </Grid>
              </>
            ) : (
              <Grid item xs={12}>
                <Autocomplete
                  size="small"
                  options={suppliersList}
                  getOptionLabel={(option) => `${option.Name} (${option.Code})`}
                  value={selectedSupplier}
                  onChange={(e, newVal) => setSelectedSupplier(newVal)}
                  renderInput={(params) => <TextField {...params} required label="Select Vendor" />}
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
                    {poLines.map((line, idx) => (
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
          <Button variant="contained" color="success" onClick={handleSavePO}>
            Save PO
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Purchase Order"
        message="Are you sure you want to delete this Purchase Order? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
      />
    </Box>
  );
}
