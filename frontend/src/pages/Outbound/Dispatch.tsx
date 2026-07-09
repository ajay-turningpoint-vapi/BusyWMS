import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, CircularProgress, Alert, 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip
} from '@mui/material';
import { Truck, CheckCircle2, FileDown } from 'lucide-react';
import api from '../../services/api';
import TransactionLink from '../../components/TransactionLink';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function Dispatch() {
  const [packedOrders, setPackedOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const pagination = usePagination(25);

  // Form states
  const [activeSO, setActiveSO] = useState<any>(null);
  const [dcNo, setDcNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [carrier, setCarrier] = useState('');
  const [lrNo, setLrNo] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/outbound/sales-orders');
      // Show orders ready to be dispatched: PACKED (also fallback to PICKED for developer testing)
      setPackedOrders(res.data.filter((so: any) => so.Status === 'PACKED' || so.Status === 'PICKED'));
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch dispatch queue');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openDispatchModal = (so: any) => {
    setActiveSO(so);
    setDcNo(`DC-${Date.now().toString().slice(-6)}`);
    setVehicleNo('DL-3C-AQ-8976');
    setCarrier('BlueDart Logistics');
    setLrNo(`LR-${Date.now().toString().slice(-5)}`);
  };

  const handleConfirmDispatch = async () => {
    if (!activeSO) return;
    try {
      const payload = {
        soId: activeSO.SOId,
        deliveryChallanNo: dcNo,
        vehicleNo,
        transporterName: carrier,
        lrNumber: lrNo
      };

      await api.post('/outbound/dispatch', payload);
      toast.showSuccess(`Order ${activeSO.SOCode} dispatched successfully. Challan & dispatch details synced back to BUSY ERP.`);
      setActiveSO(null);
      loadData();
    } catch (err) {
      toast.showError('Failed to execute dispatch transaction');
    }
  };

  // Filter and search
  const filteredOrders = useMemo(() => {
    let data = packedOrders;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((so: any) =>
        so.SOCode?.toLowerCase().includes(q) ||
        so.CustomerName?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [packedOrders, searchQuery]);

  const paginatedOrders = pagination.paginate(filteredOrders);

  const handleExportCSV = () => {
    exportToCSV(filteredOrders, [
      { key: 'SOCode', header: 'Sales Order' },
      { key: 'CustomerName', header: 'Customer' },
      { key: 'Status', header: 'Status' },
      { key: 'OrderDate', header: 'Sync Date' }
    ], 'DispatchQueue');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Dispatch & Outward Shipping</Typography>
          <Typography variant="body2" color="text.secondary">
            Confirm vehicle gate entries, transporter details, and LR numbers to execute outbound dispatch and trigger ERP updates.
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={handleExportCSV} sx={{ fontWeight: 600 }}>
          Export CSV
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search Bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search SO, Customer..." />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredOrders.length} of {packedOrders.length} orders
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
                  <TableCell sx={{ fontWeight: 600 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Sync Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedOrders.map((so: any) => (
                  <TableRow key={so.SOId} hover>
                    <TableCell><TransactionLink type="SO" id={so.SOCode} /></TableCell>
                    <TableCell>{so.CustomerName}</TableCell>
                    <TableCell>
                      <Chip label={so.Status} color="secondary" size="small" sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell>{new Date(so.OrderDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button 
                        variant="contained" 
                        color="success"
                        size="small" 
                        startIcon={<Truck size={14} />}
                        onClick={() => openDispatchModal(so)}
                      >
                        Confirm Gate Out
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      {packedOrders.length === 0 ? 'No packed orders ready for dispatch.' : 'No results match search query.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        <TablePaginationBar
          count={filteredOrders.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>

      {/* Dispatch Gate Out Details Modal */}
      <Dialog open={!!activeSO} onClose={() => setActiveSO(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Dispatch Gate-Out Challan</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1.5, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField 
              label="Delivery Challan No" 
              fullWidth 
              size="small" 
              value={dcNo} 
              onChange={(e) => setDcNo(e.target.value)} 
            />
            <TextField 
              label="Carrier / Transporter Name" 
              fullWidth 
              size="small" 
              value={carrier} 
              onChange={(e) => setCarrier(e.target.value)} 
            />
            <TextField 
              label="Vehicle Registration Number" 
              fullWidth 
              size="small" 
              value={vehicleNo} 
              onChange={(e) => setVehicleNo(e.target.value)} 
            />
            <TextField 
              label="LR (Lorry Receipt) Number" 
              fullWidth 
              size="small" 
              value={lrNo} 
              onChange={(e) => setLrNo(e.target.value)} 
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveSO(null)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={handleConfirmDispatch}>Execute Gate-Out</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
