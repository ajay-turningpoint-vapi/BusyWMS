import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Alert, CircularProgress, 
  Chip
} from '@mui/material';
import { Play, RotateCw, FileDown } from 'lucide-react';
import api from '../../services/api';
import SearchBar from '../../components/SearchBar';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import { exportToCSV } from '../../utils/exportCSV';
import { useToast } from '../../contexts/ToastContext';

export default function Replenishments() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [executingId, setExecutingId] = useState<string | null>(null);
  const toast = useToast();

  // Search & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const pagination = usePagination(25);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/inventory/replenishment/suggestions');
      setSuggestions(res.data);
      setLoading(false);
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to fetch replenishment suggestions.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, []);

  const handleExecute = async (sugg: any, idx: number) => {
    setError('');
    setSuccess('');
    const idKey = `${sugg.itemId}-${idx}`;
    setExecutingId(idKey);
    
    try {
      const payload = {
        fromBinId: sugg.fromBinId,
        toBinId: sugg.toBinId,
        itemId: sugg.itemId,
        batchId: sugg.batchId || null,
        quantity: sugg.suggestedQty
      };

      await api.post('/inventory/replenishment/execute', payload);
      toast.showSuccess(`Replenished ${sugg.suggestedQty} ${sugg.uom} of '${sugg.itemName}' from Bin ${sugg.fromBinCode} to Bin ${sugg.toBinCode}.`);
      fetchSuggestions();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Replenishment execution failed.');
    } finally {
      setExecutingId(null);
    }
  };

  // Filter & Search
  const filteredSuggestions = useMemo(() => {
    let data = suggestions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter((s: any) =>
        s.itemName?.toLowerCase().includes(q) ||
        s.itemCode?.toLowerCase().includes(q) ||
        s.fromBinCode?.toLowerCase().includes(q) ||
        s.toBinCode?.toLowerCase().includes(q)
      );
    }
    return data;
  }, [suggestions, searchQuery]);

  const paginatedSuggestions = pagination.paginate(filteredSuggestions);

  const handleExportCSV = () => {
    exportToCSV(filteredSuggestions, [
      { key: 'itemName', header: 'Item Name' },
      { key: 'itemCode', header: 'Item Code' },
      { key: 'fromBinCode', header: 'Bulk Source Bin' },
      { key: 'toBinCode', header: 'Target Pick Bin' },
      { key: 'suggestedQty', header: 'Suggested Qty' }
    ], 'ReplenishmentSuggestions');
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Stock Replenishment Engine</Typography>
          <Typography variant="body2" color="text.secondary">Automatically scan forward picking bins and transfer reserve stock from bulk storage zones to avoid picking stockouts.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={handleExportCSV} sx={{ fontWeight: 600 }}>
            Export CSV
          </Button>
          <Button variant="outlined" startIcon={<RotateCw size={16} />} onClick={fetchSuggestions}>
            Refresh Diagnostics
          </Button>
        </Box>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Search Bar */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search item/bin..." />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredSuggestions.length} of {suggestions.length} suggestions
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
                  <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Picking Stock / Min</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Bulk Source Bin</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Batch Number</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Target Pick Bin</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Suggested Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedSuggestions.map((sugg: any, idx: number) => {
                  const idKey = `${sugg.itemId}-${idx}`;
                  const isExecuting = executingId === idKey;
                  
                  return (
                    <TableRow key={idx} hover>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {sugg.itemName} ({sugg.itemCode})
                      </TableCell>
                      <TableCell>
                        {Number(sugg.currentPickingStock).toFixed(3)} / {Number(sugg.minStock).toFixed(3)} {sugg.uom}
                      </TableCell>
                      <TableCell>
                        <Chip label="Critical Shortage" color="error" size="small" variant="outlined" />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{sugg.fromBinCode}</TableCell>
                      <TableCell>{sugg.batchNumber || 'Standard'}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{sugg.toBinCode}</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                        {Number(sugg.suggestedQty).toFixed(3)} {sugg.uom}
                      </TableCell>
                      <TableCell align="right">
                        <Button 
                          size="small" 
                          variant="contained" 
                          startIcon={<Play size={12} />} 
                          disabled={isExecuting}
                          onClick={() => handleExecute(sugg, idx)}
                        >
                          {isExecuting ? 'Replenishing...' : 'Execute Move'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredSuggestions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                      {suggestions.length === 0 ? '🎉 All forward picking stocks are healthy and above minStock thresholds. No replenishments needed.' : 'No matching suggestions found.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        <TablePaginationBar
          count={filteredSuggestions.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>
    </Box>
  );
}
