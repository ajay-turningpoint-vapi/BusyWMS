import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Card, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, 
  TextField, Alert, CircularProgress, Chip, Dialog, 
  DialogTitle, DialogContent, DialogActions, Button,
  InputAdornment, Grid, Switch, FormControlLabel
} from '@mui/material';
import { Search, Layers, Box as BoxIcon, FileDown, Eye, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '../../services/api';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import { exportToCSV } from '../../utils/exportCSV';

export default function StockAvailable() {
  const [items, setItems] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const pagination = usePagination(25);

  // Dialog state for bin breakdown
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [selectedItemInfo, setSelectedItemInfo] = useState<any>(null);
  const [itemBins, setItemBins] = useState<any[]>([]);

  const fetchStockSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/inventory/stock-available', {
        params: {
          page: pagination.page,
          limit: pagination.rowsPerPage,
          q: searchQuery,
          inStockOnly
        }
      });
      setItems(res.data.items || []);
      setTotalRows(res.data.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load stock available data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockSummary();
  }, [pagination.page, pagination.rowsPerPage, searchQuery, inStockOnly]);

  const handleOpenBinBreakdown = async (item: any) => {
    setSelectedItemInfo(item);
    setDialogOpen(true);
    setDialogLoading(true);
    try {
      const res = await api.get(`/inventory/item-bins/${item.ItemId}`);
      setItemBins(res.data.bins || []);
    } catch (err) {
      console.error('Failed to load bin breakdown', err);
    } finally {
      setDialogLoading(false);
    }
  };

  const handleExportCSV = () => {
    const columns = [
      { key: 'ItemCode', header: 'Item Code' },
      { key: 'ItemName', header: 'Item Name' },
      { key: 'Category', header: 'Category' },
      { key: 'UOM', header: 'UOM' },
      { key: 'TotalQuantity', header: 'Total Physical Stock' },
      { key: 'TotalReserved', header: 'Reserved Stock' },
      { key: 'TotalAvailable', header: 'Available Stock' },
      { key: 'MinStock', header: 'Min Stock' },
      { key: 'MaxStock', header: 'Max Stock' },
      { key: 'BinCount', header: 'Bin Locations Count' }
    ];
    exportToCSV(items, columns, `Stock_Available_Summary_${Date.now()}`);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
            Stock Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            View total consolidated stock per item across all warehouse bins, including safety stock min/max limits. Click any item name to view its exact bin breakdown.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<FileDown size={16} />}
          onClick={handleExportCSV}
          disabled={items.length === 0}
          sx={{ fontWeight: 600 }}
        >
          Export CSV
        </Button>
      </Box>

      {/* Filter Card */}
      <Card sx={{ p: 2.5, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={8} md={6}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search by item code, name, category, or barcode..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                pagination.resetPage();
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={18} />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={4} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={inStockOnly}
                  onChange={(e) => {
                    setInStockOnly(e.target.checked);
                    pagination.resetPage();
                  }}
                  color="primary"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Show In-Stock Only
                </Typography>
              }
            />
          </Grid>
        </Grid>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {/* Main Table Card */}
      <Card sx={{ border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
        <TableContainer sx={{ maxHeight: 620 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Item Code</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Item Name</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Total Stock</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Reserved Qty</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Available Stock</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Min Qty</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Max Qty</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">Bins Count</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                      <Typography variant="body2" color="text.secondary">
                        No stock items found matching your filter criteria.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const totalQty = parseFloat(item.TotalQuantity || '0');
                    const minQty = parseFloat(item.MinStock || '0');
                    const maxQty = parseFloat(item.MaxStock || '0');
                    const availableQty = parseFloat(item.TotalAvailable || '0');
                    const stockStatus = item.StockStatus || 'Optimal';
                    
                    const isBelowMin = stockStatus === 'Below Min';
                    const isAboveMax = stockStatus === 'Exceeds Max';

                    return (
                      <TableRow key={item.ItemId} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {item.ItemCode}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            onClick={() => handleOpenBinBreakdown(item)}
                            sx={{
                              fontWeight: 700,
                              color: 'primary.main',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              '&:hover': { textDecoration: 'underline' }
                            }}
                          >
                            {item.ItemName}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={item.Category || 'General'} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 800 }}>
                            {totalQty.toLocaleString()} {item.UOM}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color={parseFloat(item.TotalReserved) > 0 ? 'error.main' : 'text.secondary'}>
                            {parseFloat(item.TotalReserved).toLocaleString()} {item.UOM}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 800, color: 'success.main' }}>
                            {availableQty.toLocaleString()} {item.UOM}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                            {isBelowMin && <AlertTriangle size={14} color="#dc2626" />}
                            <Typography variant="body2" color={isBelowMin ? 'error.main' : 'text.secondary'}>
                              {minQty.toLocaleString()}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color={isAboveMax ? 'warning.main' : 'text.secondary'}>
                            {maxQty > 999990 ? '∞' : maxQty.toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {isBelowMin ? (
                            <Chip 
                              label={`Below Min (-${(minQty - totalQty).toLocaleString()})`} 
                              size="small" 
                              color="error" 
                            />
                          ) : isAboveMax ? (
                            <Chip 
                              label={`Exceeds Max (+${(totalQty - maxQty).toLocaleString()})`} 
                              size="small" 
                              color="warning" 
                            />
                          ) : (
                            <Chip label="Optimal" size="small" color="success" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Chip 
                            icon={<Eye size={14} />}
                            label={`${item.BinCount} Bin${item.BinCount === 1 ? '' : 's'}`}
                            size="small" 
                            color={item.BinCount > 0 ? 'primary' : 'default'} 
                            variant={item.BinCount > 0 ? 'filled' : 'outlined'}
                            onClick={() => handleOpenBinBreakdown(item)}
                            sx={{ 
                              cursor: 'pointer',
                              fontWeight: 600,
                              '&:hover': { opacity: 0.9 }
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>

        <TablePaginationBar
          count={totalRows}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>

      {/* Bin Breakdown Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={() => setDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyBetween: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BoxIcon size={20} color="#2563eb" />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Bin Stock Breakdown
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {selectedItemInfo && (
            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 1, mb: 3, border: '1px solid #e2e8f0' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main', mb: 0.5 }}>
                {selectedItemInfo.ItemName} ({selectedItemInfo.ItemCode})
              </Typography>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Total Stock</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700 }}>
                    {parseFloat(selectedItemInfo.TotalQuantity || '0').toLocaleString()} {selectedItemInfo.UOM}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Available Stock</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: 'success.main' }}>
                    {parseFloat(selectedItemInfo.TotalAvailable || '0').toLocaleString()} {selectedItemInfo.UOM}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Min Stock Limit</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {parseFloat(selectedItemInfo.MinStock || '0').toLocaleString()} {selectedItemInfo.UOM}
                  </Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Max Stock Limit</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {parseFloat(selectedItemInfo.MaxStock || '0') > 999990 ? 'Unlimited' : `${parseFloat(selectedItemInfo.MaxStock || '0').toLocaleString()} ${selectedItemInfo.UOM}`}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}

          {dialogLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={30} />
            </Box>
          ) : itemBins.length === 0 ? (
            <Alert severity="info">
              This item is currently not stored in any bin (Zero Stock).
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Warehouse</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Zone</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Bin Code</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Batch Number</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Physical Quantity</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Reserved Qty</TableCell>
                    <TableCell sx={{ fontWeight: 700 }} align="right">Available Qty</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {itemBins.map((bin) => (
                    <TableRow key={bin.InventoryId} hover>
                      <TableCell>{bin.WarehouseName} ({bin.WarehouseCode})</TableCell>
                      <TableCell><Chip label={bin.ZoneCode} size="small" variant="outlined" /></TableCell>
                      <TableCell sx={{ fontWeight: 700 }}><code>{bin.BinCode}</code></TableCell>
                      <TableCell>{bin.BatchNumber ? <Chip label={bin.BatchNumber} size="small" color="primary" variant="outlined" /> : 'Standard'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(bin.Quantity).toLocaleString()}</TableCell>
                      <TableCell align="right" color="error.main">{parseFloat(bin.ReservedQty).toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: 'success.main' }}>{parseFloat(bin.AvailableQty).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="outlined" onClick={() => setDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
