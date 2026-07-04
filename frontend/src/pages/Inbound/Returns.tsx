import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Dialog, DialogTitle, 
  DialogContent, DialogActions, TextField, FormControl, 
  InputLabel, Select, MenuItem, Chip, Alert, CircularProgress, 
  Grid, RadioGroup, FormControlLabel, Radio
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

  // Form states
  const [newReturn, setNewReturn] = useState({
    type: 'CUSTOMER',
    referenceCode: '',
    itemId: '',
    batchId: '',
    quantity: 1,
    reason: '',
    binId: ''
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

  useEffect(() => {
    loadData();
  }, []);

  const handleReceiveOpen = () => {
    setNewReturn({
      type: 'CUSTOMER',
      referenceCode: '',
      itemId: '',
      batchId: '',
      quantity: 1,
      reason: '',
      binId: ''
    });
    setReceiveDialogOpen(true);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReturn.itemId || !newReturn.binId || newReturn.quantity <= 0) {
      setError('Item, Bin and Quantity are required.');
      return;
    }

    try {
      await api.post('/inventory/returns/receive', newReturn);
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
                  onChange={(e) => setNewReturn({ ...newReturn, type: e.target.value })}
                >
                  <FormControlLabel value="CUSTOMER" control={<Radio />} label="Customer Return" />
                  <FormControlLabel value="VENDOR" control={<Radio />} label="Vendor Return / RTO" />
                </RadioGroup>
              </FormControl>

              <TextField
                label="Reference Invoice / Order No."
                size="small"
                fullWidth
                value={newReturn.referenceCode}
                onChange={(e) => setNewReturn({ ...newReturn, referenceCode: e.target.value })}
              />

              <FormControl fullWidth size="small" required>
                <InputLabel>Returned Item</InputLabel>
                <Select
                  value={newReturn.itemId}
                  label="Returned Item"
                  onChange={(e) => setNewReturn({ ...newReturn, itemId: e.target.value })}
                >
                  {items.map(i => <MenuItem key={i.ItemId} value={i.ItemId}>{i.Name} ({i.Code})</MenuItem>)}
                </Select>
              </FormControl>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    label="Returned Qty"
                    type="number"
                    size="small"
                    required
                    fullWidth
                    value={newReturn.quantity}
                    onChange={(e) => setNewReturn({ ...newReturn, quantity: Number(e.target.value) })}
                    inputProps={{ min: 1 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small" required>
                    <InputLabel>Receiving Bin (Dock)</InputLabel>
                    <Select
                      value={newReturn.binId}
                      label="Receiving Bin (Dock)"
                      onChange={(e) => setNewReturn({ ...newReturn, binId: e.target.value })}
                    >
                      {bins.map(b => <MenuItem key={b.BinId} value={b.BinId}>{b.Code}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <TextField
                label="Return Reason / Remarks"
                multiline
                rows={2}
                fullWidth
                size="small"
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
