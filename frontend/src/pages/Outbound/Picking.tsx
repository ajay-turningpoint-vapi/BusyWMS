import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, CircularProgress, Alert, 
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, 
  Chip, List, ListItem, ListItemText, Divider, FormControl, InputLabel, Select, MenuItem, IconButton,
  Stepper, Step, StepLabel, StepContent
} from '@mui/material';
import { Play, Clipboard, CheckSquare, ListPlus, FileDown, MapPin } from 'lucide-react';
import api from '../../services/api';
import TransactionLink from '../../components/TransactionLink';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function Picking() {
  const [pickLists, setPickLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const pagination = usePagination(25);

  // Dialog states
  const [openGenDialog, setOpenGenDialog] = useState(false);
  const [soList, setSoList] = useState<any[]>([]);
  const [selectedSOId, setSelectedSOId] = useState<number | string>('');
  
  const [activePickList, setActivePickList] = useState<any>(null);
  const [pickLines, setPickLines] = useState<any[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  
  // Pick confirmation quantities
  const [pickedQtys, setPickedQtys] = useState<Record<number, number>>({});
  const [scannedBarcodes, setScannedBarcodes] = useState<Record<number, string>>({});

  const [locatorOpen, setLocatorOpen] = useState(false);
  const [locatorTarget, setLocatorTarget] = useState<any>(null);

  const handleLocateBin = (line: any) => {
    setLocatorTarget(line);
    setLocatorOpen(true);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/outbound/pick-lists');
      setPickLists(res.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch pick lists');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openGenModal = async () => {
    setSelectedSOId('');
    try {
      const res = await api.get('/outbound/sales-orders');
      // Show orders that are RESERVED and don't have pick lists generated
      setSoList(res.data.filter((so: any) => so.Status === 'RESERVED' || so.Status === 'PARTIAL_RESERVED'));
      setOpenGenDialog(true);
    } catch (err) {
      toast.showError('Failed to load reserved orders');
    }
  };

  const handleCreatePickList = async () => {
    if (!selectedSOId) return;
    try {
      await api.post('/outbound/pick-list', { soId: selectedSOId });
      toast.showSuccess('Pick list generated successfully');
      setOpenGenDialog(false);
      loadData();
    } catch (err) {
      toast.showError('Failed to generate pick list');
    }
  };

  const openPickConfirmModal = async (list: any) => {
    setActivePickList(list);
    setLinesLoading(true);
    try {
      const res = await api.get(`/outbound/pick-list/${list.PickListId}`);
      setPickLines(res.data);
      
      const pQtys: Record<number, number> = {};
      const scans: Record<number, string> = {};
      res.data.forEach((line: any) => {
        pQtys[line.PickDetailId] = line.Quantity - line.PickedQty;
        scans[line.PickDetailId] = '';
      });
      setPickedQtys(pQtys);
      setScannedBarcodes(scans);
      setLinesLoading(false);
    } catch (err) {
      toast.showError('Failed to fetch picking details');
      setLinesLoading(false);
    }
  };

  const handleQtyChange = (detailId: number, val: number, max: number) => {
    setPickedQtys(prev => ({ ...prev, [detailId]: Math.min(val, max) }));
  };

  const handleBarcodeScanChange = (detailId: number, val: string) => {
    setScannedBarcodes(prev => ({ ...prev, [detailId]: val }));
  };

  const handleSubmitPicking = async () => {
    if (!activePickList) return;

    // Verify barcode scan for all lines with picked Qty > 0
    for (const line of pickLines) {
      const picked = pickedQtys[line.PickDetailId] || 0;
      if (picked > 0) {
        const scanVal = (scannedBarcodes[line.PickDetailId] || '').trim().toLowerCase();
        if (!scanVal) {
          toast.showError(`Verification required: Please scan the Bin Barcode for item "${line.ItemName}" in bin "${line.BinCode}".`);
          return;
        }

        const matchBarcode = line.BinBarcode ? line.BinBarcode.toString().trim().toLowerCase() : '';
        const matchCode = line.BinCode ? line.BinCode.toString().trim().toLowerCase() : '';

        if (scanVal !== matchBarcode && scanVal !== matchCode) {
          toast.showError(`Verification Failed for "${line.ItemName}"! Scanned value "${scannedBarcodes[line.PickDetailId]}" does not match Bin Barcode ("${line.BinBarcode || ''}") or Bin Code ("${line.BinCode || ''}").`);
          return;
        }
      }
    }

    const payloadLines = pickLines.map(line => ({
      pickDetailId: line.PickDetailId,
      pickedQty: pickedQtys[line.PickDetailId] || 0
    }));

    try {
      await api.post('/outbound/pick-confirm', {
        pickListId: activePickList.PickListId,
        items: payloadLines
      });
      toast.showSuccess('Picking confirmation recorded.');
      setActivePickList(null);
      loadData();
    } catch (err) {
      toast.showError('Failed to submit picking report');
    }
  };

  // Filter and search
  const filteredPickLists = useMemo(() => {
    let data = pickLists;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((l: any) =>
        l.PickCode?.toLowerCase().includes(q) ||
        l.SOCode?.toLowerCase().includes(q) ||
        l.CreatorName?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [pickLists, searchQuery]);

  const paginatedPickLists = pagination.paginate(filteredPickLists);

  const handleExportCSV = () => {
    exportToCSV(filteredPickLists, [
      { key: 'PickCode', header: 'Pick Code' },
      { key: 'SOCode', header: 'Sales Order' },
      { key: 'CreatorName', header: 'Generated By' },
      { key: 'Status', header: 'Status' },
      { key: 'CreatedAt', header: 'Date' }
    ], 'PickLists');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Order Picking (Pick Lists)</Typography>
          <Typography variant="body2" color="text.secondary">
            Generate pick waves for reserved Sales Orders, verify storage locations, and execute pick scans.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={handleExportCSV} sx={{ fontWeight: 600 }}>
            Export CSV
          </Button>
          <Button 
            variant="contained" 
            startIcon={<ListPlus size={16} />}
            onClick={openGenModal}
          >
            Generate Pick List
          </Button>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search Bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search Pick Code, SO, Creator..." />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredPickLists.length} of {pickLists.length} lists
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
                  <TableCell sx={{ fontWeight: 600 }}>Generated By</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedPickLists.map((list: any) => (
                  <TableRow key={list.PickListId} hover>
                    <TableCell><TransactionLink type="Pick" id={list.PickCode} /></TableCell>
                    <TableCell><TransactionLink type="SO" id={list.SOCode} /></TableCell>
                    <TableCell>{list.CreatorName}</TableCell>
                    <TableCell>
                      <Chip 
                        label={list.Status} 
                        color={list.Status === 'COMPLETED' ? 'success' : 'warning'} 
                        size="small" 
                        sx={{ fontWeight: 600 }} 
                      />
                    </TableCell>
                    <TableCell>{new Date(list.CreatedAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {list.Status !== 'COMPLETED' && (
                        <Button 
                          variant="outlined" 
                          size="small" 
                          startIcon={<Play size={14} />}
                          onClick={() => openPickConfirmModal(list)}
                        >
                          Execute Pick
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPickLists.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      {pickLists.length === 0 ? 'No pick lists generated yet.' : 'No results match search query.'}
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

      {/* Generate Pick List Dialog */}
      <Dialog open={openGenDialog} onClose={() => setOpenGenDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Generate Order Pick List</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Reserved Sales Order</InputLabel>
            <Select
              value={selectedSOId}
              label="Reserved Sales Order"
              onChange={(e) => setSelectedSOId(e.target.value)}
            >
              <MenuItem value="">-- Select Order --</MenuItem>
              {soList.map(so => (
                <MenuItem key={so.SOId} value={so.SOId}>{so.SOCode} - {so.CustomerName}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenGenDialog(false)}>Cancel</Button>
          <Button variant="contained" disabled={!selectedSOId} onClick={handleCreatePickList}>Generate</Button>
        </DialogActions>
      </Dialog>

      {/* Picking Execution Dialog */}
      <Dialog open={!!activePickList} onClose={() => setActivePickList(null)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: 700 }}>Picking Verification: {activePickList?.PickCode}</DialogTitle>
        <DialogContent>
          {linesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
          ) : (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" sx={{ mb: 2 }}>Retrieve items from the designated bins. FIFO rules apply.</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Bin Location</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Zone / Rack</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Batch</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Allocated Qty</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Picked Qty</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Scan Bin Barcode</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Pick Quantity</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pickLines.map((line) => {
                      const max = line.Quantity - line.PickedQty;
                      return (
                        <TableRow key={line.PickDetailId} hover>
                          <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <code>{line.BinCode}</code>
                              <IconButton 
                                size="small" 
                                color="primary" 
                                title="Locate Bin"
                                onClick={() => handleLocateBin(line)}
                                sx={{ p: 0.25 }}
                              >
                                <MapPin size={13} />
                              </IconButton>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{line.ZoneCode || 'N/A'}</Typography>
                            <Typography variant="caption" color="text.secondary">{line.RackName || line.RackCode || 'N/A'}</Typography>
                          </TableCell>
                          <TableCell>{line.ItemName} ({line.ItemCode})</TableCell>
                          <TableCell>{line.BatchNumber ? <Chip size="small" label={line.BatchNumber} color="primary" variant="outlined" /> : 'N/A'}</TableCell>
                          <TableCell>{line.Quantity} PCS</TableCell>
                          <TableCell>{line.PickedQty} PCS</TableCell>
                          <TableCell>
                            <TextField
                              placeholder="Scan bin..."
                              size="small"
                              sx={{ width: 145 }}
                              value={scannedBarcodes[line.PickDetailId] ?? ''}
                              onChange={(e) => handleBarcodeScanChange(line.PickDetailId, e.target.value)}
                              disabled={max === 0}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              type="number"
                              size="small"
                              sx={{ width: 90 }}
                              value={pickedQtys[line.PickDetailId] ?? ''}
                              onChange={(e) => handleQtyChange(line.PickDetailId, parseFloat(e.target.value || '0'), max)}
                              disabled={max === 0}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActivePickList(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmitPicking}>Confirm Pick Completion</Button>
        </DialogActions>
      </Dialog>
      {/* Dialog 3: Visual Bin Locator Map */}
      <Dialog open={locatorOpen} onClose={() => setLocatorOpen(false)} fullWidth maxWidth="xs">
        <style>{`
          @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(26, 115, 232, 0.5); }
            70% { box-shadow: 0 0 0 12px rgba(26, 115, 232, 0); }
            100% { box-shadow: 0 0 0 0 rgba(26, 115, 232, 0); }
          }
        `}</style>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <MapPin size={22} color="#1a73e8" />
          Visual Bin Locator: {locatorTarget?.BinCode}
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ bgcolor: 'background.paper', p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 3 }}>Location Path Finder</Typography>
            <Stepper orientation="vertical" activeStep={4} sx={{
              '& .MuiStepConnector-line': {
                borderColor: 'primary.main',
                borderWidth: 2
              }
            }}>
              <Step completed>
                <StepLabel>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    Zone: {locatorTarget?.ZoneName || 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Code: {locatorTarget?.ZoneCode || 'N/A'}
                  </Typography>
                </StepLabel>
              </Step>
              <Step completed>
                <StepLabel>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    Rack: {locatorTarget?.RackName || 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Code: {locatorTarget?.RackCode || 'N/A'}
                  </Typography>
                </StepLabel>
              </Step>
              <Step completed>
                <StepLabel>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: 'text.primary' }}>
                    Shelf: {locatorTarget?.ShelfName || locatorTarget?.ShelfCode || 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Code: {locatorTarget?.ShelfCode || 'N/A'}
                  </Typography>
                </StepLabel>
              </Step>
              <Step completed>
                <StepLabel>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: 'success.main' }}>
                    Bin Label: {locatorTarget?.BinCode || 'N/A'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Barcode to Scan: <strong>{locatorTarget?.BinBarcode || 'N/A'}</strong>
                  </Typography>
                </StepLabel>
              </Step>
            </Stepper>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="contained" onClick={() => setLocatorOpen(false)} sx={{ fontWeight: 600 }}>
            Got It, Proceed
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
