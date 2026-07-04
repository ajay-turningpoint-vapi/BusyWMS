import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, CircularProgress, Alert, 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, 
  Chip, List, ListItem, ListItemText, Divider
} from '@mui/material';
import { Package, Printer, Check, FileDown } from 'lucide-react';
import api from '../../services/api';
import TransactionLink from '../../components/TransactionLink';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function Packing() {
  const [pickLists, setPickLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const pagination = usePagination(25);

  // Dialog and label states
  const [activeList, setActiveList] = useState<any>(null);
  const [cartonNo, setCartonNo] = useState('');
  const [palletNo, setPalletNo] = useState('');
  const [shippingLabel, setShippingLabel] = useState('');
  const [printOpen, setPrintOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/outbound/pick-lists');
      // Filter lists that are COMPLETED (meaning fully picked) but not yet dispatched/packed
      // Since packing creates a record, let's filter list.Status === 'COMPLETED'
      setPickLists(res.data.filter((l: any) => l.Status === 'COMPLETED'));
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch picked order lists');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openPackingModal = (list: any) => {
    setActiveList(list);
    setCartonNo(`CRT-${Date.now().toString().slice(-6)}`);
    setPalletNo(`PLT-${Date.now().toString().slice(-4)}`);
    setShippingLabel(`LBL-${Date.now()}`);
  };

  const handleConfirmPacking = async () => {
    if (!activeList) return;

    try {
      await api.post('/outbound/pack', {
        pickListId: activeList.PickListId,
        cartonNo,
        palletNo,
        shippingLabel
      });
      toast.showSuccess(`Order ${activeList.PickCode} packed into Carton ${cartonNo}. Shipping Label generated.`);
      setActiveList(null);
      loadData();
      setPrintOpen(true);
    } catch (err) {
      toast.showError('Failed to save packing list');
    }
  };

  // Filter and search
  const filteredPickLists = useMemo(() => {
    let data = pickLists;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((l: any) =>
        l.PickCode?.toLowerCase().includes(q) ||
        l.SOCode?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [pickLists, searchQuery]);

  const paginatedPickLists = pagination.paginate(filteredPickLists);

  const handleExportCSV = () => {
    exportToCSV(filteredPickLists, [
      { key: 'PickCode', header: 'Pick Code' },
      { key: 'SOCode', header: 'Sales Order' },
      { key: 'CreatedAt', header: 'Date Picked' }
    ], 'PackingQueue');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Packing Center</Typography>
          <Typography variant="body2" color="text.secondary">
            Consolidate picked items, assign package weights, register carton/pallet structures, and print labels.
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
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search Pick Code, SO..." />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredPickLists.length} of {pickLists.length} orders
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
                  <TableCell sx={{ fontWeight: 600 }}>Pick Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Sales Order</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date Picked</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedPickLists.map((list: any) => (
                  <TableRow key={list.PickListId} hover>
                    <TableCell><TransactionLink type="Pick" id={list.PickCode} /></TableCell>
                    <TableCell><TransactionLink type="SO" id={list.SOCode} /></TableCell>
                    <TableCell>
                      <Chip label="Picked & Ready" color="success" size="small" sx={{ fontWeight: 600 }} />
                    </TableCell>
                    <TableCell>{new Date(list.UpdatedAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button 
                        variant="contained" 
                        color="secondary"
                        size="small" 
                        startIcon={<Package size={14} />}
                        onClick={() => openPackingModal(list)}
                      >
                        Pack Items
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPickLists.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                      {pickLists.length === 0 ? 'No picked orders awaiting packing.' : 'No results match search query.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        <TablePaginationBar
          count={filteredPickLists.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>

      {/* Packing Specification Modal */}
      <Dialog open={!!activeList} onClose={() => setActiveList(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Record Packaging details</DialogTitle>
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField 
            label="Carton Number" 
            fullWidth 
            size="small" 
            value={cartonNo} 
            onChange={(e) => setCartonNo(e.target.value)} 
          />
          <TextField 
            label="Pallet Reference (Optional)" 
            fullWidth 
            size="small" 
            value={palletNo} 
            onChange={(e) => setPalletNo(e.target.value)} 
          />
          <TextField 
            label="Shipping Label Tracking Code" 
            fullWidth 
            size="small" 
            value={shippingLabel} 
            onChange={(e) => setShippingLabel(e.target.value)} 
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveList(null)}>Cancel</Button>
          <Button variant="contained" color="secondary" onClick={handleConfirmPacking}>Confirm Packing list</Button>
        </DialogActions>
      </Dialog>

      {/* Print Shipping Label Preview Dialog */}
      <Dialog open={printOpen} onClose={() => setPrintOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Print Shipping Label</DialogTitle>
        <DialogContent>
          <Box sx={{ border: '2px solid #000', p: 3, m: 2, width: 280, bgcolor: '#fff', color: '#000', fontFamily: 'monospace' }}>
            <Typography variant="h4" sx={{ fontWeight: 800, textAlign: 'center', borderBottom: '2px solid #000', pb: 1, mb: 1 }}>
              SHIPPING LABEL
            </Typography>
            <Typography variant="body2" sx={{ mb: 0.5 }}>FROM: Delhi Main Warehouse</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>TO: Apex Tech Solutions, Noida</Typography>
            
            <Divider sx={{ bgcolor: '#000', height: 2, my: 1 }} />
            
            <Typography variant="body2">CARRIER: BlueDart Express</Typography>
            <Typography variant="body2">CARTON: {cartonNo}</Typography>
            <Typography variant="body2">TRACKING: {shippingLabel}</Typography>

            {/* QR Code Simulation */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, p: 1, border: '1px solid #000' }}>
              <div style={{ width: 80, height: 80, backgroundColor: '#000', backgroundImage: 'radial-gradient(#fff 25%, transparent 25%)', backgroundSize: '10px 10px' }} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintOpen(false)}>Cancel</Button>
          <Button variant="contained" startIcon={<Printer size={16} />} onClick={() => { alert('Dispatched to thermal shipping printer.'); setPrintOpen(false); }}>Print Label</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
