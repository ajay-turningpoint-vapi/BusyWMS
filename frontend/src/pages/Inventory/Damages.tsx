import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Dialog, DialogTitle, 
  DialogContent, DialogActions, TextField, FormControl, 
  InputLabel, Select, MenuItem, Chip, Alert, CircularProgress, 
  Grid, Divider
} from '@mui/material';
import { Plus, Trash2, ShieldCheck, HeartPulse, RefreshCw, FileDown } from 'lucide-react';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import StatusFilter from '../../components/StatusFilter';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function Damages() {
  const [damages, setDamages] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const pagination = usePagination(25);

  // Dialog state
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedDamage, setSelectedDamage] = useState<any>(null);

  // Form states
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [formData, setFormData] = useState({
    qty: 1,
    reason: '',
    type: 'PHYSICAL'
  });
  const [reviewRemarks, setReviewRemarks] = useState('');

  const { user } = useAuthStore();
  const isManager = user?.role === 'Admin' || user?.role === 'Warehouse Manager';

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const damagesRes = await api.get('/inventory/damages');
      setDamages(damagesRes.data);
      const stockRes = await api.get('/inventory/stock');
      setStocks(stockRes.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load damaged stock data.');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReportOpen = () => {
    setSelectedStock(null);
    setFormData({ qty: 1, reason: '', type: 'PHYSICAL' });
    setReportDialogOpen(true);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStock) {
      setError('Please select stock to report.');
      return;
    }

    const available = selectedStock.Quantity - selectedStock.ReservedQty;
    if (formData.qty <= 0 || formData.qty > available) {
      setError(`Invalid quantity. Must be between 1 and ${available} (available).`);
      return;
    }

    try {
      const payload = {
        itemId: selectedStock.ItemId,
        binId: selectedStock.BinId,
        batchId: selectedStock.BatchId || null,
        quantity: formData.qty,
        damageReason: formData.reason,
        damageType: formData.type
      };

      await api.post('/inventory/damage/report', payload);
      toast.showSuccess('Damaged stock reported. Stock balances updated.');
      setReportDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to report damage');
    }
  };

  const handleReviewOpen = (dmg: any) => {
    setSelectedDamage(dmg);
    setReviewRemarks('');
    setReviewDialogOpen(true);
  };

  const handleReviewAction = async (action: 'APPROVED' | 'REJECTED') => {
    try {
      await api.post('/inventory/damage/review', {
        damageId: selectedDamage.DamageId,
        action,
        remarks: reviewRemarks || 'Reviewed from supervisor desk'
      });
      toast.showSuccess(`Damage report reviewed: ${action}`);
      setReviewDialogOpen(false);
      loadData();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to submit review');
    }
  };

  // Filter & Search
  const filteredDamages = useMemo(() => {
    let data = damages;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((dmg: any) =>
        dmg.DamageCode?.toLowerCase().includes(q) ||
        dmg.BinCode?.toLowerCase().includes(q) ||
        dmg.ItemName?.toLowerCase().includes(q) ||
        dmg.ItemCode?.toLowerCase().includes(q) ||
        dmg.ReportedByName?.toLowerCase().includes(q)
      );
    }
    if (statusFilter) {
      data = data.filter((dmg: any) => dmg.Status === statusFilter);
    }
    return data;
  }, [damages, searchQuery, statusFilter]);

  const paginatedDamages = pagination.paginate(filteredDamages);

  const handleExportCSV = () => {
    exportToCSV(filteredDamages, [
      { key: 'DamageCode', header: 'Damage Code' },
      { key: 'BinCode', header: 'Bin Locator' },
      { key: 'ItemName', header: 'Item Name' },
      { key: 'ItemCode', header: 'Item Code' },
      { key: 'Quantity', header: 'Qty' },
      { key: 'DamageType', header: 'Damage Type' },
      { key: 'DamageReason', header: 'Reason' },
      { key: 'ReportedByName', header: 'Reported By' },
      { key: 'Status', header: 'Status' }
    ], 'DamagedStock');
  };

  const getStatusChip = (status: string) => {
    if (status === 'APPROVED') return <Chip label="Approved (Written Off)" color="error" size="small" sx={{ fontWeight: 600 }} />;
    if (status === 'REJECTED') return <Chip label="Rejected (Restored)" color="success" size="small" sx={{ fontWeight: 600 }} />;
    return <Chip label="Reported (Pending Review)" color="warning" size="small" sx={{ fontWeight: 600 }} />;
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Damaged Goods Manager</Typography>
          <Typography variant="body2" color="text.secondary">Report physical warehouse damage, write off broken stock, or review quarantine restorations.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={handleExportCSV} sx={{ fontWeight: 600 }}>
            Export CSV
          </Button>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={handleReportOpen} sx={{ fontWeight: 600 }}>
            Report Broken Stock
          </Button>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search & Filter Bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search damage report..." />
        <StatusFilter
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); pagination.resetPage(); }}
          options={[
            { value: 'REPORTED', label: 'Reported (Pending Review)' },
            { value: 'APPROVED', label: 'Approved (Written Off)' },
            { value: 'REJECTED', label: 'Rejected (Restored)' },
          ]}
        />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredDamages.length} of {damages.length} reports
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
                  <TableCell sx={{ fontWeight: 600 }}>Damage Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Bin Locator</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Batch</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Damage Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reported By</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  {isManager && <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedDamages.map((dmg: any) => (
                  <TableRow key={dmg.DamageId} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{dmg.DamageCode}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{dmg.BinCode}</TableCell>
                    <TableCell>{dmg.ItemName} ({dmg.ItemCode})</TableCell>
                    <TableCell>{dmg.BatchNumber || 'Standard'}</TableCell>
                    <TableCell>{Number(dmg.Quantity).toFixed(3)}</TableCell>
                    <TableCell>
                      <Chip label={dmg.DamageType} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{dmg.DamageReason || 'N/A'}</TableCell>
                    <TableCell>{dmg.ReportedByName}</TableCell>
                    <TableCell>{getStatusChip(dmg.Status)}</TableCell>
                    {isManager && (
                      <TableCell align="right">
                        {dmg.Status === 'REPORTED' && (
                          <Button 
                            size="small" 
                            variant="outlined" 
                            onClick={() => handleReviewOpen(dmg)}
                          >
                            Review
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filteredDamages.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isManager ? 10 : 9} align="center" sx={{ py: 5 }}>
                      {damages.length === 0 ? 'No damage reports found.' : 'No results match search query.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        <TablePaginationBar
          count={filteredDamages.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>

      {/* Dialog 1: Report Damage */}
      <Dialog open={reportDialogOpen} onClose={() => setReportDialogOpen(false)} fullWidth maxWidth="sm">
        <form onSubmit={handleReportSubmit}>
          <DialogTitle sx={{ fontWeight: 700 }}>Report Broken / Damaged Inventory</DialogTitle>
          <DialogContent sx={{ pt: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <FormControl fullWidth size="small" required>
                <InputLabel>Select Stock Entry</InputLabel>
                <Select
                  value={selectedStock ? selectedStock.InventoryId : ''}
                  label="Select Stock Entry"
                  onChange={(e) => {
                    const stock = stocks.find(s => s.InventoryId === e.target.value);
                    setSelectedStock(stock);
                  }}
                >
                  {stocks.filter(s => s.Quantity - s.ReservedQty > 0).map(s => (
                    <MenuItem key={s.InventoryId} value={s.InventoryId}>
                      {s.ItemName} ({s.ItemCode}) - Bin: {s.BinCode} - Avail: {s.Quantity - s.ReservedQty} {s.UOM || 'PCS'} {s.BatchNumber ? `(Batch: ${s.BatchNumber})` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {selectedStock && (
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <TextField
                      label="Damage Quantity"
                      type="number"
                      size="small"
                      required
                      fullWidth
                      value={formData.qty}
                      onChange={(e) => setFormData({ ...formData, qty: Number(e.target.value) })}
                      inputProps={{ min: 1, max: selectedStock.Quantity - selectedStock.ReservedQty }}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Damage Type</InputLabel>
                      <Select
                        value={formData.type}
                        label="Damage Type"
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      >
                        <MenuItem value="PHYSICAL">Physical Damage</MenuItem>
                        <MenuItem value="EXPIRED">Expired Shelf Life</MenuItem>
                        <MenuItem value="WATER">Water / Liquid Damage</MenuItem>
                        <MenuItem value="INFESTATION">Infestation</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              )}

              <TextField
                label="Mishap / Loss Description"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                required
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReportDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" color="error">Report Damage</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Dialog 2: Review Damage */}
      <Dialog open={reviewDialogOpen} onClose={() => setReviewDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Review Damage Report ({selectedDamage?.DamageCode})</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2"><strong>Item Name:</strong> {selectedDamage?.ItemName}</Typography>
            <Typography variant="body2"><strong>Quantity:</strong> {selectedDamage?.Quantity} units</Typography>
            <Typography variant="body2"><strong>Reported Reason:</strong> {selectedDamage?.DamageReason}</Typography>
            <Typography variant="body2"><strong>Quarantine Bin:</strong> {selectedDamage?.BinCode}</Typography>

            <Divider sx={{ my: 1 }} />

            <TextField
              label="Reviewer Comments"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={reviewRemarks}
              onChange={(e) => setReviewRemarks(e.target.value)}
              placeholder="Record write-off approval or restoration remarks..."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setReviewDialogOpen(false)}>Cancel</Button>
          <Button 
            variant="contained" 
            color="success" 
            startIcon={<HeartPulse size={16} />}
            onClick={() => handleReviewAction('REJECTED')}
          >
            Reject & Restore Stock
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            startIcon={<Trash2 size={16} />}
            onClick={() => handleReviewAction('APPROVED')}
          >
            Approve Write-Off
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
