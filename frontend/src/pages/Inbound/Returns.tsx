import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Dialog, DialogTitle, 
  DialogContent, DialogActions, TextField, FormControl, 
  InputLabel, Select, MenuItem, Chip, Alert, CircularProgress, 
  Grid, RadioGroup, FormControlLabel, Radio, Autocomplete, Checkbox
} from '@mui/material';
import { Plus, CheckSquare, Eye, RotateCw, FileDown } from 'lucide-react';
import api from '../../services/api';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import StatusFilter from '../../components/StatusFilter';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function Returns() {
  const [returns, setReturns] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [bins, setBins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search, Filter, Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const pagination = usePagination(25);

  // Modal states
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [qcDialogOpen, setQcDialogOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);

  // Order Details Auto-Fetch States
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  const [selectedItems, setSelectedItems] = useState<{
    [itemId: number]: {
      checked: boolean;
      quantity: number;
      binId: string;
      binCode: string;
      batchId: string;
      reason: string;
      maxQty: number;
      itemCode: string;
      itemName: string;
      uom: string;
    }
  }>({});

  // Form states
  const [newReturn, setNewReturn] = useState({
    type: 'CUSTOMER',
    referenceCode: '',
    reason: ''
  });

  const [qcForm, setQcForm] = useState({
    qcPassed: 'true',
    qcBinId: '',
    remarks: ''
  });

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const retRes = await api.get('/inventory/returns');
      setReturns(retRes.data);
      const itemRes = await api.get('/masters/items');
      setItems(itemRes.data);
      const binRes = await api.get('/masters/bins');
      setBins(binRes.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch returns data.');
      setLoading(false);
    }
  };

  const fetchOrderDetails = async (type: string, code: string) => {
    if (!code) {
      setOrderItems([]);
      setSelectedItems({});
      return;
    }
    setLoadingOrderDetails(true);
    try {
      const res = await api.get(`/inventory/returns/order-details?type=${type}&code=${encodeURIComponent(code)}`);
      setOrderItems(res.data);
      
      const itemsMap: typeof selectedItems = {};
      res.data.forEach((oi: any) => {
        itemsMap[oi.ItemId] = {
          checked: false,
          quantity: oi.Quantity ? Math.ceil(parseFloat(oi.Quantity)) : 1,
          binId: oi.BinId ? String(oi.BinId) : '',
          binCode: oi.BinCode ? String(oi.BinCode) : '',
          batchId: oi.BatchId ? String(oi.BatchId) : '',
          reason: '',
          maxQty: oi.Quantity ? Math.ceil(parseFloat(oi.Quantity)) : 1,
          itemCode: oi.ItemCode,
          itemName: oi.ItemName,
          uom: oi.UOM
        };
      });
      setSelectedItems(itemsMap);

      if (res.data.length === 0) {
        toast.showError('No matching active order details found.');
      } else {
        toast.showSuccess(`Loaded ${res.data.length} line items from order ${code}`);
      }
    } catch (err) {
      console.error('Failed to fetch order details:', err);
      setOrderItems([]);
      setSelectedItems({});
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReceiveOpen = () => {
    setOrderItems([]);
    setSelectedItems({});
    setNewReturn({
      type: 'CUSTOMER',
      referenceCode: '',
      reason: ''
    });
    setReceiveDialogOpen(true);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const checkedLines = Object.keys(selectedItems)
      .map(key => Number(key))
      .filter(itemId => selectedItems[itemId].checked)
      .map(itemId => {
        const line = selectedItems[itemId];
        return {
          itemId: itemId,
          batchId: line.batchId ? Number(line.batchId) : null,
          quantity: line.quantity,
          binId: Number(line.binId),
          reason: newReturn.reason || line.reason || null
        };
      });

    if (checkedLines.length === 0) {
      setError('Please select at least one item to return.');
      return;
    }

    // Validate quantities
    for (const line of checkedLines) {
      const original = selectedItems[line.itemId];
      if (line.quantity <= 0) {
        setError(`Quantity for item ${original.itemName} must be greater than zero.`);
        return;
      }
      if (line.quantity > original.maxQty) {
        setError(`Quantity for item ${original.itemName} cannot exceed original quantity of ${original.maxQty}.`);
        return;
      }
      if (!line.binId) {
        setError(`Please select a valid receiving bin for item ${original.itemName}.`);
        return;
      }
    }

    try {
      const payload = {
        type: newReturn.type,
        referenceCode: newReturn.referenceCode,
        reason: newReturn.reason,
        items: checkedLines
      };

      await api.post('/inventory/returns/receive', payload);
      setSuccess('Returned stock received. Pending Quality Control inspection.');
      setReceiveDialogOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to receive returned stock');
    }
  };

  const handleQcOpen = (ret: any) => {
    setSelectedReturn(ret);
    setQcForm({
      qcPassed: 'true',
      qcBinId: ret.BinId || '',
      remarks: ''
    });
    setQcDialogOpen(true);
  };

  const handleQcSubmit = async () => {
    try {
      const payload = {
        returnId: selectedReturn.ReturnId,
        qcPassed: qcForm.qcPassed === 'true',
        qcBinId: qcForm.qcBinId,
        remarks: qcForm.remarks
      };

      await api.post('/inventory/returns/process-qc', payload);
      setSuccess('Returns Quality Check processed.');
      setQcDialogOpen(false);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to submit QC review');
    }
  };

  const getStatusChip = (status: string) => {
    if (status === 'RESTOCKED') return <Chip label="Restocked" color="success" size="small" sx={{ fontWeight: 600 }} />;
    if (status === 'REJECTED') return <Chip label="Rejected (Quarantined)" color="error" size="small" sx={{ fontWeight: 600 }} />;
    return <Chip label="Received (Pending QC)" color="warning" size="small" sx={{ fontWeight: 600 }} />;
  };

  const isOrderLoaded = orderItems.length > 0;

  const filteredReturns = useMemo(() => {
    let data = returns;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((r: any) =>
        r.ReturnCode?.toLowerCase().includes(q) ||
        r.ItemName?.toLowerCase().includes(q) ||
        r.ItemCode?.toLowerCase().includes(q) ||
        r.ReferenceCode?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      data = data.filter((r: any) => r.Status === statusFilter);
    }
    return data;
  }, [returns, searchQuery, statusFilter]);

  const paginatedReturns = pagination.paginate(filteredReturns);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Inbound Returns & Restocking</Typography>
          <Typography variant="body2" color="text.secondary">Process customer returns or vendor return-to-origin shipments. Review returned stock and direct active restocking.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={() => exportToCSV(filteredReturns, [
            { key: 'ReturnCode', header: 'Return Code' },
            { key: 'Type', header: 'Type' },
            { key: 'ItemName', header: 'Item' },
            { key: 'Quantity', header: 'Qty' },
            { key: 'Reason', header: 'Reason' },
            { key: 'Status', header: 'Status' },
          ], 'Returns')} sx={{ fontWeight: 600 }}>Export CSV</Button>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={handleReceiveOpen} sx={{ fontWeight: 600 }}>
            Receive Returned Shipment
          </Button>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search & Filter Bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search returns..." />
        <StatusFilter
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
          options={[
            { value: 'RECEIVED', label: 'Received (Pending QC)' },
            { value: 'RESTOCKED', label: 'Restocked' },
            { value: 'REJECTED', label: 'Rejected' },
          ]}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredReturns.length} of {returns.length} returns
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
                  <TableCell sx={{ fontWeight: 600 }}>Return Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Return Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reference Ref</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Batch</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Quantity</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Receiving Bin</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedReturns.map((ret: any) => (
                  <TableRow key={ret.ReturnId} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{ret.ReturnCode}</TableCell>
                    <TableCell>
                      <Chip label={ret.Type} size="small" variant="outlined" color={ret.Type === 'CUSTOMER' ? 'primary' : 'secondary'} />
                    </TableCell>
                    <TableCell>{ret.ReferenceCode || 'N/A'}</TableCell>
                    <TableCell>{ret.ItemName} ({ret.ItemCode})</TableCell>
                    <TableCell>{ret.BatchNumber || 'Standard'}</TableCell>
                    <TableCell>{Number(ret.Quantity).toFixed(2)}</TableCell>
                    <TableCell>{ret.Reason || 'N/A'}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{ret.BinCode}</TableCell>
                    <TableCell>{getStatusChip(ret.Status)}</TableCell>
                    <TableCell align="right">
                      {ret.Status === 'RECEIVED' && (
                        <Button 
                          size="small" 
                          variant="contained" 
                          startIcon={<CheckSquare size={12} />}
                          onClick={() => handleQcOpen(ret)}
                        >
                          Process QC
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredReturns.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 5 }}>
                      {returns.length === 0 ? 'No returned stock records found.' : 'No results match your filters.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        <TablePaginationBar
          count={filteredReturns.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>

      {/* Dialog 1: Receive Return */}
      <Dialog open={receiveDialogOpen} onClose={() => setReceiveDialogOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={handleReceiveSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>Receive Inbound Return</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <FormControl component="fieldset">
                <RadioGroup
                  row
                  value={newReturn.type}
                  onChange={(e) => {
                    setOrderItems([]);
                    setNewReturn({ 
                      ...newReturn, 
                      type: e.target.value,
                      referenceCode: ''
                    });
                  }}
                >
                  <FormControlLabel value="CUSTOMER" control={<Radio />} label="Customer Return (SO)" />
                  <FormControlLabel value="VENDOR" control={<Radio />} label="Vendor Return / RTO (PO)" />
                </RadioGroup>
              </FormControl>

              <TextField
                label={newReturn.type === 'CUSTOMER' ? "Sales Order Code" : "Purchase Order Code"}
                size="small"
                fullWidth
                required
                value={newReturn.referenceCode}
                onChange={(e) => setNewReturn({ ...newReturn, referenceCode: e.target.value })}
                onBlur={() => fetchOrderDetails(newReturn.type, newReturn.referenceCode)}
                helperText="Press Enter or tab outside to fetch order items"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    fetchOrderDetails(newReturn.type, newReturn.referenceCode);
                  }
                }}
              />

              {isOrderLoaded ? (
                <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, mt: 1, maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, width: 50, bgcolor: 'action.hover' }}>Select</TableCell>
                        <TableCell sx={{ fontWeight: 600, bgcolor: 'action.hover' }}>Item</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 110, bgcolor: 'action.hover' }}>Qty</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 160, bgcolor: 'action.hover' }}>Return Bin</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.keys(selectedItems).map((key) => {
                        const itemId = Number(key);
                        const line = selectedItems[itemId];
                        return (
                          <TableRow key={itemId} hover>
                            <TableCell>
                              <Checkbox
                                size="small"
                                checked={line.checked}
                                disabled={!line.binId}
                                onChange={(e) => setSelectedItems({
                                  ...selectedItems,
                                  [itemId]: { ...line, checked: e.target.checked }
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.825rem', color: !line.binId ? 'text.secondary' : 'inherit' }}>
                                {line.itemName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                                {line.itemCode} • Max: {line.maxQty} {line.uom}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <TextField
                                type="number"
                                size="small"
                                disabled={!line.checked}
                                value={line.quantity}
                                onChange={(e) => {
                                  const val = Math.min(line.maxQty, Math.max(1, Number(e.target.value)));
                                  setSelectedItems({
                                    ...selectedItems,
                                    [itemId]: { ...line, quantity: val }
                                  });
                                }}
                                inputProps={{ min: 1, max: line.maxQty }}
                                variant="standard"
                              />
                            </TableCell>
                            <TableCell>
                              {line.binId ? (
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
                                  {line.binCode}
                                </Typography>
                              ) : (
                                <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
                                  Not in Bin (Blocked)
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Please enter a valid Order Code and trigger lookup to display and select items for return.
                </Alert>
              )}

              <TextField
                label="Return Reason / Remarks (General)"
                multiline
                rows={2}
                fullWidth
                size="small"
                disabled={!Object.values(selectedItems).some(l => l.checked)}
                value={newReturn.reason}
                onChange={(e) => setNewReturn({ ...newReturn, reason: e.target.value })}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReceiveDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Register Return</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dialog 2: Process QC */}
      <Dialog open={qcDialogOpen} onClose={() => setQcDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Quality Check Inspection & Routing</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2"><strong>Return Code:</strong> {selectedReturn?.ReturnCode}</Typography>
            <Typography variant="body2"><strong>Item:</strong> {selectedReturn?.ItemName} ({selectedReturn?.ItemCode})</Typography>
            <Typography variant="body2"><strong>Quantity:</strong> {selectedReturn?.Quantity} units</Typography>
            
            <FormControl component="fieldset">
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Inspection Result</Typography>
              <RadioGroup
                row
                value={qcForm.qcPassed}
                onChange={(e) => setQcForm({ ...qcForm, qcPassed: e.target.value })}
              >
                <FormControlLabel value="true" control={<Radio color="success" />} label="QC Passed (Restock to Active)" />
                <FormControlLabel value="false" control={<Radio color="error" />} label="QC Failed (Route to Damage Quarantine)" />
              </RadioGroup>
            </FormControl>

            <FormControl fullWidth size="small" required>
              <InputLabel>{qcForm.qcPassed === 'true' ? 'Restocking Target Bin' : 'Damage/Quarantine Bin'}</InputLabel>
              <Select
                value={qcForm.qcBinId}
                label={qcForm.qcPassed === 'true' ? 'Restocking Target Bin' : 'Damage/Quarantine Bin'}
                onChange={(e) => setQcForm({ ...qcForm, qcBinId: e.target.value })}
              >
                {bins.map(b => <MenuItem key={b.BinId} value={b.BinId}>{b.Code}</MenuItem>)}
              </Select>
            </FormControl>

            <TextField
              label="QC Inspection Remarks"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={qcForm.remarks}
              onChange={(e) => setQcForm({ ...qcForm, remarks: e.target.value })}
              placeholder="State any package damage, cosmetic defects, or RESTOCK details..."
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQcDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleQcSubmit} color={qcForm.qcPassed === 'true' ? 'success' : 'error'}>
            Complete Inspection
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
