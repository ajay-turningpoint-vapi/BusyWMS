import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Grid, FormControl, InputLabel, 
  Select, MenuItem, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, TextField, Alert, CircularProgress, Divider, Chip
} from '@mui/material';
import { ArrowRight, History, Layers, FileDown } from 'lucide-react';
import api from '../../services/api';
import TransactionLink from '../../components/TransactionLink';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function Transfer() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [bins, setBins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [fromBinId, setFromBinId] = useState<number | string>('');
  const [toBinId, setToBinId] = useState<number | string>('');
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [quantity, setQuantity] = useState(0);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search & Pagination State for Bin Wise Stock
  const [stockQuery, setStockQuery] = useState('');
  const stockPagination = usePagination(10);

  // Search & Pagination State for Transfer Logs
  const [histQuery, setHistQuery] = useState('');
  const histPagination = usePagination(10);

  const loadData = async () => {
    setLoading(true);
    try {
      const stockRes = await api.get('/inventory/stock');
      setStocks(stockRes.data);
      const histRes = await api.get('/inventory/transfers');
      setHistory(histRes.data);
      const binRes = await api.get('/masters/bins');
      setBins(binRes.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch stock adjustments data.');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSourceBinChange = (binId: number | string) => {
    setFromBinId(binId);
    setSelectedStock(null);
    setQuantity(0);
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!fromBinId || !toBinId || !selectedStock || quantity <= 0) {
      setError('Please fill in all transaction fields.');
      return;
    }

    if (fromBinId === toBinId) {
      setError('Source and Destination bins cannot be the same.');
      return;
    }

    try {
      const payload = {
        fromBinId,
        toBinId,
        itemId: selectedStock.ItemId,
        batchId: selectedStock.BatchId || null,
        quantity
      };
      
      const res = await api.post('/inventory/transfer', payload);
      toast.showSuccess(`Stock transfer successful: ${res.data.transferCode}`);
      setFromBinId('');
      setToBinId('');
      setSelectedStock(null);
      setQuantity(0);
      loadData();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Transfer failed');
    }
  };

  // Stock Filter & Pagination
  const filteredStocks = useMemo(() => {
    let data = stocks;
    if (stockQuery) {
      const q = stockQuery.toLowerCase();
      data = data.filter((s: any) =>
        s.BinCode?.toLowerCase().includes(q) ||
        s.ItemName?.toLowerCase().includes(q) ||
        s.ItemCode?.toLowerCase().includes(q) ||
        (s.BatchNumber && s.BatchNumber.toLowerCase().includes(q))
      );
    }
    return data;
  }, [stocks, stockQuery]);

  const paginatedStocks = stockPagination.paginate(filteredStocks);

  // History Filter & Pagination
  const filteredHistory = useMemo(() => {
    let data = history;
    if (histQuery) {
      const q = histQuery.toLowerCase();
      data = data.filter((h: any) =>
        h.TransferCode?.toLowerCase().includes(q) ||
        h.ItemName?.toLowerCase().includes(q) ||
        h.FromBinCode?.toLowerCase().includes(q) ||
        h.ToBinCode?.toLowerCase().includes(q) ||
        h.OperatorName?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [history, histQuery]);

  const paginatedHistory = histPagination.paginate(filteredHistory);

  const handleExportStockCSV = () => {
    exportToCSV(filteredStocks, [
      { key: 'WarehouseCode', header: 'Warehouse' },
      { key: 'BinCode', header: 'Bin Code' },
      { key: 'ItemName', header: 'Item Name' },
      { key: 'ItemCode', header: 'Item Code' },
      { key: 'BatchNumber', header: 'Batch Number' },
      { key: 'Quantity', header: 'Total Qty' },
      { key: 'ReservedQty', header: 'Reserved' },
      { key: 'AvailableQty', header: 'Available' }
    ], 'WMS_Stocks_Export');
  };

  const handleExportHistoryCSV = () => {
    exportToCSV(filteredHistory, [
      { key: 'TransferCode', header: 'Transfer Code' },
      { key: 'ItemName', header: 'Item Name' },
      { key: 'FromBinCode', header: 'From Bin' },
      { key: 'ToBinCode', header: 'To Bin' },
      { key: 'Quantity', header: 'Quantity' },
      { key: 'OperatorName', header: 'Operator' }
    ], 'WMS_Transfers_Export');
  };

  // Filter stocks available in the selected source bin
  const availableItems = stocks.filter(s => s.BinId === Number(fromBinId));

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h2" sx={{ mb: 1, fontWeight: 700 }}>Internal Stock Transfer</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Transfer stock between warehouse bins (Bin-to-Bin) or warehouse zones for storage reorganization.
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={3}>
        {/* Transfer Form Panel */}
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 3 }}>
            <Typography variant="h4" sx={{ mb: 3, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <Layers size={18} color="#1a73e8" /> Movement Form
            </Typography>
            <Box component="form" onSubmit={handleTransferSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              
              {/* Source Bin */}
              <FormControl fullWidth size="small">
                <InputLabel>Source Bin Locator</InputLabel>
                <Select
                  value={fromBinId}
                  label="Source Bin Locator"
                  onChange={(e) => handleSourceBinChange(e.target.value)}
                >
                  <MenuItem value="">-- Select Source Bin --</MenuItem>
                  {bins.map(b => (
                    <MenuItem key={b.BinId} value={b.BinId}>{b.Code}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Item selection from that bin */}
              <FormControl fullWidth size="small" disabled={!fromBinId}>
                <InputLabel>Item to Transfer</InputLabel>
                <Select
                  value={selectedStock ? JSON.stringify(selectedStock) : ''}
                  label="Item to Transfer"
                  onChange={(e) => setSelectedStock(e.target.value ? JSON.parse(e.target.value as string) : null)}
                >
                  <MenuItem value="">-- Select Item --</MenuItem>
                  {availableItems.map((s, idx) => (
                    <MenuItem key={idx} value={JSON.stringify(s)}>
                      {s.ItemName} {s.BatchNumber ? `(Batch: ${s.BatchNumber})` : ''} - Avail: {s.AvailableQty}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Destination Bin */}
              <FormControl fullWidth size="small">
                <InputLabel>Destination Bin Locator</InputLabel>
                <Select
                  value={toBinId}
                  label="Destination Bin Locator"
                  onChange={(e) => setToBinId(e.target.value)}
                >
                  <MenuItem value="">-- Select Destination Bin --</MenuItem>
                  {bins.map(b => (
                    <MenuItem key={b.BinId} value={b.BinId}>{b.Code}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Quantity */}
              <TextField
                label="Quantity to Move"
                type="number"
                size="small"
                fullWidth
                disabled={!selectedStock}
                value={quantity || ''}
                onChange={(e) => setQuantity(Math.min(parseFloat(e.target.value || '0'), selectedStock?.AvailableQty || 0))}
                helperText={selectedStock ? `Max transferable: ${selectedStock.AvailableQty}` : ''}
              />

              <Button 
                type="submit" 
                variant="contained" 
                color="primary"
                startIcon={<ArrowRight size={16} />}
                sx={{ mt: 1, py: 1, fontWeight: 600 }}
              >
                Execute Transfer
              </Button>
            </Box>
          </Card>
        </Grid>

        {/* Live Stocks Grid */}
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 700 }}>Bin Wise Stock Levels</Typography>
              <Button variant="outlined" startIcon={<FileDown size={14} />} size="small" onClick={handleExportStockCSV}>
                Export
              </Button>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
              <SearchBar value={stockQuery} onChange={(v) => { setStockQuery(v); stockPagination.resetPage(); }} placeholder="Search stock/bin..." />
            </Box>

            <TableContainer sx={{ maxHeight: 300 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
              ) : (
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Warehouse / Bin</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Batch Number</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Total Qty</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Reserved</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Available Qty</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedStocks.map((s: any, idx: number) => (
                      <TableRow key={idx} hover>
                        <TableCell sx={{ fontWeight: 600 }}>{s.WarehouseCode} / {s.BinCode}</TableCell>
                        <TableCell>{s.ItemName} ({s.ItemCode})</TableCell>
                        <TableCell>{s.BatchNumber ? <Chip size="small" label={s.BatchNumber} color="primary" variant="outlined" /> : 'N/A'}</TableCell>
                        <TableCell>{s.Quantity} PCS</TableCell>
                        <TableCell color="error.main">{s.ReservedQty} PCS</TableCell>
                        <TableCell sx={{ fontWeight: 700, color: 'success.main' }}>{s.AvailableQty} PCS</TableCell>
                      </TableRow>
                    ))}
                    {filteredStocks.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 3 }}>No stock levels found matching search.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
            <TablePaginationBar
              count={filteredStocks.length}
              page={stockPagination.page}
              rowsPerPage={stockPagination.rowsPerPage}
              onPageChange={stockPagination.setPage}
              onRowsPerPageChange={stockPagination.setRowsPerPage}
              rowsPerPageOptions={[5, 10, 20]}
            />
          </Card>

          {/* Transfer history logs */}
          <Card sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h4" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <History size={18} /> Transfer Log History
              </Typography>
              <Button variant="outlined" startIcon={<FileDown size={14} />} size="small" onClick={handleExportHistoryCSV}>
                Export
              </Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
              <SearchBar value={histQuery} onChange={(v) => { setHistQuery(v); histPagination.resetPage(); }} placeholder="Search log..." />
            </Box>

            <TableContainer sx={{ maxHeight: 220 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>From Bin</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>To Bin</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Qty</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Transferred By</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedHistory.map((h: any) => (
                    <TableRow key={h.TransferId}>
                      <TableCell><TransactionLink type="Transfer" id={h.TransferCode} /></TableCell>
                      <TableCell>{h.ItemName}</TableCell>
                      <TableCell><code>{h.FromBinCode}</code></TableCell>
                      <TableCell><code>{h.ToBinCode}</code></TableCell>
                      <TableCell>{h.Quantity} PCS</TableCell>
                      <TableCell>{h.OperatorName}</TableCell>
                    </TableRow>
                  ))}
                  {filteredHistory.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 3 }}>No stock transfer logs found.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePaginationBar
              count={filteredHistory.length}
              page={histPagination.page}
              rowsPerPage={histPagination.rowsPerPage}
              onPageChange={histPagination.setPage}
              onRowsPerPageChange={histPagination.setRowsPerPage}
              rowsPerPageOptions={[5, 10, 20]}
            />
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
