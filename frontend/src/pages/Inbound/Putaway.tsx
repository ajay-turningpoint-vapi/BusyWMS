import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, CircularProgress, Alert, 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, 
  List, ListItem, ListItemButton, ListItemText, ListItemIcon, 
  Chip, Divider
} from '@mui/material';
import { ArrowDown, HelpCircle, Check, MapPin, FileDown } from 'lucide-react';
import api from '../../services/api';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';
import { useAuthStore } from '../../store/authStore';

export default function Putaway() {
  const { user } = useAuthStore();
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const pagination = usePagination(25);

  // Dialog and suggestion states
  const [activeItem, setActiveItem] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [manualBinCode, setManualBinCode] = useState('');
  const [selectedBin, setSelectedBin] = useState<any>(null);
  const [allBins, setAllBins] = useState<any[]>([]);
  const [scannedBarcode, setScannedBarcode] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/putaway/pending');
      setPendingItems(res.data);
      const binRes = await api.get('/masters/bins');
      setAllBins(binRes.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load pending putaways');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openPutawayDialog = async (item: any) => {
    setActiveItem(item);
    setSelectedBin(null);
    setManualBinCode('');
    setScannedBarcode('');
    setSuggestions([]);
    setSugLoading(true);
    
    try {
      // Get suggested bins from backend algorithm (stored procedure)
      const res = await api.post('/putaway/suggest', {
        itemId: item.ItemId,
        quantity: item.PendingPutawayQty,
        warehouseId: user?.warehouseId
      });
      setSuggestions(res.data);
      if (res.data.length > 0) {
        setSelectedBin(res.data[0]); // Default to first suggestion
        setScannedBarcode(res.data[0].BinBarcode || res.data[0].BinCode);
      }
      setSugLoading(false);
    } catch (err) {
      console.error(err);
      setSugLoading(false);
    }
  };

  const handleManualBinCodeChange = (code: string) => {
    setManualBinCode(code);
    setSelectedBin(null);
    if (code) {
      const matched = allBins.find(b => b.Code.toLowerCase() === code.trim().toLowerCase());
      if (matched) {
        setScannedBarcode(matched.Barcode || matched.Code);
      } else {
        setScannedBarcode('');
      }
    } else {
      setScannedBarcode('');
    }
  };

  const handleExecutePutaway = async () => {
    if (!activeItem) return;
    
    let targetBinId = selectedBin?.BinId;
    let expectedBarcode = selectedBin?.BinBarcode;
    let expectedCode = selectedBin?.BinCode;

    // Manual bin selection override
    if (manualBinCode) {
      const matched = allBins.find(b => b.Code.toLowerCase() === manualBinCode.trim().toLowerCase());
      if (!matched) {
        toast.showError('Invalid Bin locator code. Please enter a valid bin code like WH01-Z02-R01-S01-B01.');
        return;
      }
      targetBinId = matched.BinId;
      expectedBarcode = matched.Barcode;
      expectedCode = matched.Code;
    }

    if (!targetBinId) {
      toast.showError('Please select a storage bin locator.');
      return;
    }

    // Verify barcode scan
    const cleanScanned = (scannedBarcode || '').trim().toLowerCase();
    if (!cleanScanned) {
      toast.showError('Please scan or enter the physical Bin Barcode to confirm placement.');
      return;
    }

    const matchBarcode = expectedBarcode ? expectedBarcode.toString().trim().toLowerCase() : '';
    const matchCode = expectedCode ? expectedCode.toString().trim().toLowerCase() : '';

    if (cleanScanned !== matchBarcode && cleanScanned !== matchCode) {
      toast.showError(`Scan Verification Failed! Scanned barcode/code "${scannedBarcode}" does not match target Bin Barcode ("${expectedBarcode || ''}") or Bin Code ("${expectedCode || ''}").`);
      return;
    }

    try {
      await api.post('/putaway/execute', {
        grnDetailId: activeItem.GRNDetailId,
        binId: targetBinId,
        quantity: activeItem.PendingPutawayQty
      });
      toast.showSuccess(`Putaway for ${activeItem.ItemName} completed successfully.`);
      setActiveItem(null);
      loadData();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Putaway failed');
    }
  };

  // Filter and search
  const filteredItems = useMemo(() => {
    let data = pendingItems;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((item: any) =>
        item.GRNCode?.toLowerCase().includes(q) ||
        item.ItemName?.toLowerCase().includes(q) ||
        item.ItemCode?.toLowerCase().includes(q) ||
        item.BatchNumber?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [pendingItems, searchQuery]);

  const paginatedItems = pagination.paginate(filteredItems);

  const handleExportCSV = () => {
    exportToCSV(filteredItems, [
      { key: 'GRNCode', header: 'GRN Code' },
      { key: 'ItemName', header: 'Item' },
      { key: 'ItemCode', header: 'Item Code' },
      { key: 'BatchNumber', header: 'Batch' },
      { key: 'PendingPutawayQty', header: 'Pending Putaway Qty' },
    ], 'PendingPutaways');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Putaway Execution</Typography>
          <Typography variant="body2" color="text.secondary">
            Assign storage locations for items sitting in staging zones. System suggests bins based on remaining load capacity.
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
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search staging item/GRN..." />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredItems.length} of {pendingItems.length} items
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
                  <TableCell sx={{ fontWeight: 600 }}>GRN Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Batch Number</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Accepted Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Pending Putaway</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedItems.map((item: any) => (
                  <TableRow key={item.GRNDetailId} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{item.GRNCode}</TableCell>
                    <TableCell>{item.ItemName} ({item.ItemCode})</TableCell>
                    <TableCell>{item.BatchNumber ? <Chip size="small" label={item.BatchNumber} color="primary" variant="outlined" /> : 'N/A'}</TableCell>
                    <TableCell>{item.AcceptedQty} PCS</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {item.PendingPutawayQty} PCS
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="contained" 
                        size="small" 
                        startIcon={<ArrowDown size={14} />} 
                        onClick={() => openPutawayDialog(item)}
                      >
                        Execute Putaway
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      {pendingItems.length === 0 ? 'No items in staging queue awaiting putaway.' : 'No results match search query.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        <TablePaginationBar
          count={filteredItems.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>

      {/* Putaway Slotting Allocation Dialog */}
      <Dialog open={!!activeItem} onClose={() => setActiveItem(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Allocate Storage Bin Locator</DialogTitle>
        <DialogContent>
          {activeItem && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body1" sx={{ mb: 0.5 }}>
                Item: <b>{activeItem.ItemName}</b>
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Pending Qty: <b>{activeItem.PendingPutawayQty} PCS</b> | Batch: <b>{activeItem.BatchNumber || 'None'}</b>
              </Typography>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <MapPin size={16} /> Recommended Storage Bins (FEFO/Capacity fit)
              </Typography>

              {sugLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>
              ) : (
                <List sx={{ p: 0, mb: 3 }}>
                  {suggestions.map((bin) => {
                    const isSelected = selectedBin?.BinId === bin.BinId;
                    return (
                      <ListItem 
                        key={bin.BinId} 
                        disablePadding 
                        sx={{ 
                          mb: 1, 
                          border: '1px solid', 
                          borderColor: isSelected ? 'primary.main' : 'divider',
                          borderRadius: 2,
                          bgcolor: isSelected ? 'primary.light' : 'transparent'
                        }}
                      >
                        <ListItemButton onClick={() => { 
                          setSelectedBin(bin); 
                          setManualBinCode(''); 
                          setScannedBarcode(bin.BinBarcode || bin.BinCode);
                        }}>
                          <ListItemIcon><MapPin size={16} color={isSelected ? '#1a73e8' : '#64748b'} /></ListItemIcon>
                          <ListItemText 
                            primary={<Typography variant="body2" sx={{ fontWeight: 600 }}>{bin.BinCode}</Typography>}
                            secondary={`Zone: ${bin.ZoneName} | Available Wt: ${bin.AvailableWeight}kg | Vol: ${bin.AvailableVolume}L`} 
                          />
                          {isSelected && <Check size={16} color="#1a73e8" />}
                        </ListItemButton>
                      </ListItem>
                    );
                  })}
                  {suggestions.length === 0 && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      No available bins with matching capacity in preferred zones.
                    </Alert>
                  )}
                </List>
              )}

              <TextField 
                label="Manual Bin Code (Override)" 
                placeholder="e.g. WH01-Z02-R01-S01-B01" 
                size="small" 
                fullWidth
                value={manualBinCode}
                onChange={(e) => handleManualBinCodeChange(e.target.value)}
                sx={{ mb: 2 }}
              />

              <Divider sx={{ my: 2 }} />

              <TextField 
                label="Scan Bin Barcode to Confirm" 
                placeholder="Scan physical bin barcode..." 
                size="small" 
                fullWidth
                required
                autoFocus
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                helperText="Must match the selected target Bin Barcode or Locator Code to complete putaway."
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActiveItem(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleExecutePutaway}>Confirm Putaway Location</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
