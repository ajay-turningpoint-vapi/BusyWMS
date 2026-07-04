import React, { useEffect, useState } from 'react';
import { 
  Box, Typography, Button, Card, Grid, FormControl, InputLabel, 
  Select, MenuItem, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, TextField, Alert, CircularProgress, Chip
} from '@mui/material';
import { Check, Clipboard, AlertCircle } from 'lucide-react';
import api from '../../services/api';
import SearchBar from '../../components/SearchBar';
import { useToast } from '../../contexts/ToastContext';

const REJECT_REASONS = [
  'Damaged Stock',
  'Expired Product',
  'Incorrect Specification/Variant',
  'Short Receipt Qty',
  'Labeling/Packaging Issue',
  'Quality/Purity Defect'
];

export default function QC() {
  const [grns, setGrns] = useState<any[]>([]);
  const [selectedGRNId, setSelectedGRNId] = useState<number | string>('');
  const [grnItems, setGrnItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  
  // QC evaluation states
  const [qcStatus, setQcStatus] = useState('APPROVED');
  const [remarks, setRemarks] = useState('');
  const [acceptedQtys, setAcceptedQtys] = useState<Record<number, number>>({});
  const [rejectedQtys, setRejectedQtys] = useState<Record<number, number>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Search filter for GRN dropdown
  const [grnSearch, setGrnSearch] = useState('');

  const loadGRNs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inbound/grns');
      // Only display GRNs with status PENDING (awaiting QC)
      setGrns(res.data.filter((g: any) => g.Status === 'PENDING'));
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch pending GRNs');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGRNs();
  }, []);

  const handleGRNChange = async (grnId: number | string) => {
    setSelectedGRNId(grnId);
    if (!grnId) {
      setGrnItems([]);
      return;
    }
    setDetailsLoading(true);
    try {
      const res = await api.get(`/inbound/grn-details/${grnId}`);
      setGrnItems(res.data);
      
      const acc: Record<number, number> = {};
      const rej: Record<number, number> = {};
      const reas: Record<number, string> = {};

      res.data.forEach((item: any) => {
        const totalQty = item.ReceivedQty || 0;
        acc[item.ItemId] = totalQty;
        rej[item.ItemId] = 0;
        reas[item.ItemId] = '';
      });

      setAcceptedQtys(acc);
      setRejectedQtys(rej);
      setReasons(reas);
      setDetailsLoading(false);
    } catch (err) {
      setError('Failed to load GRN details');
      setDetailsLoading(false);
    }
  };

  const handleQtyChange = (itemId: number, type: 'acc' | 'rej', value: number, total: number) => {
    if (type === 'acc') {
      const cleanVal = Math.min(value, total);
      setAcceptedQtys(prev => ({ ...prev, [itemId]: cleanVal }));
      setRejectedQtys(prev => ({ ...prev, [itemId]: total - cleanVal }));
    } else {
      const cleanVal = Math.min(value, total);
      setRejectedQtys(prev => ({ ...prev, [itemId]: cleanVal }));
      setAcceptedQtys(prev => ({ ...prev, [itemId]: total - cleanVal }));
    }
  };

  const handleReasonChange = (itemId: number, value: string) => {
    setReasons(prev => ({ ...prev, [itemId]: value }));
  };

  const handleSubmitQC = async () => {
    setError('');
    setSuccess('');

    const itemsPayload = grnItems.map(item => {
      const acceptedQty = acceptedQtys[item.ItemId] || 0;
      const rejectedQty = rejectedQtys[item.ItemId] || 0;
      return {
        itemId: item.ItemId,
        acceptedQty,
        rejectedQty,
        rejectionReason: reasons[item.ItemId] || null
      };
    });

    try {
      const payload = {
        grnId: selectedGRNId,
        status: qcStatus,
        remarks,
        items: itemsPayload
      };

      await api.post('/inbound/qc', payload);
      toast.showSuccess('Quality control inspection logged successfully. Inventory is queued for Putaway.');
      setSelectedGRNId('');
      setGrnItems([]);
      loadGRNs();
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'QC submission failed');
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h2" sx={{ mb: 1, fontWeight: 700 }}>Quality Control (QC)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Perform physical goods inspection, accept/reject items, record damage details, and release to putaway.
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <SearchBar value={grnSearch} onChange={setGrnSearch} placeholder="Filter GRNs..." fullWidth />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth size="small">
              <InputLabel>Select GRN Arrival</InputLabel>
              <Select
                value={selectedGRNId}
                label="Select GRN Arrival"
                onChange={(e) => handleGRNChange(e.target.value)}
              >
                <MenuItem value="">-- Select Pending GRN --</MenuItem>
                {grns.filter((g: any) => {
                  if (!grnSearch) return true;
                  const q = grnSearch.toLowerCase();
                  return g.GRNCode?.toLowerCase().includes(q) || (g.InvoiceNo && g.InvoiceNo.toLowerCase().includes(q)) || g.OperatorName?.toLowerCase().includes(q);
                }).map(g => (
                  <MenuItem key={g.GRNId} value={g.GRNId}>
                    {g.GRNCode} (Invoice: {g.InvoiceNo || 'N/A'}) - Recv By {g.OperatorName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Overall QC Decision</InputLabel>
              <Select
                value={qcStatus}
                label="Overall QC Decision"
                onChange={(e) => setQcStatus(e.target.value)}
              >
                <MenuItem value="APPROVED">Pass (Approved)</MenuItem>
                <MenuItem value="PARTIAL">Partial Pass (Accept & Reject)</MenuItem>
                <MenuItem value="REJECTED">Fail (Rejected)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <TextField
              label="Inspection Remarks"
              size="small"
              fullWidth
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </Grid>
        </Grid>
      </Card>

      {detailsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : grnItems.length > 0 ? (
        <Card sx={{ p: 3 }}>
          <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>Inspection Items Checklist</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Received Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Accepted Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Rejected Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Rejection Reason (If any)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grnItems.map((item) => {
                  const total = item.ReceivedQty !== undefined ? item.ReceivedQty : (item.PendingPutawayQty || item.AcceptedQty || 10);
                  return (
                    <TableRow key={item.ItemId} hover>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {item.ItemName} ({item.ItemCode})
                        {item.BatchNumber && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: 11 }}>Batch: {item.BatchNumber}</Typography>}
                      </TableCell>
                      <TableCell>{total} PCS</TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          sx={{ width: 110 }}
                          value={acceptedQtys[item.ItemId] ?? total}
                          onChange={(e) => handleQtyChange(item.ItemId, 'acc', parseFloat(e.target.value), total)}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          sx={{ width: 110 }}
                          value={rejectedQtys[item.ItemId] ?? 0}
                          onChange={(e) => handleQtyChange(item.ItemId, 'rej', parseFloat(e.target.value), total)}
                        />
                      </TableCell>
                      <TableCell>
                        <FormControl fullWidth size="small" disabled={(rejectedQtys[item.ItemId] || 0) === 0}>
                          <Select
                            value={reasons[item.ItemId] || ''}
                            onChange={(e) => handleReasonChange(item.ItemId, e.target.value)}
                            displayEmpty
                          >
                            <MenuItem value="">-- Select Reason --</MenuItem>
                            {REJECT_REASONS.map(reason => (
                              <MenuItem key={reason} value={reason}>{reason}</MenuItem>
                            ))}
                            <MenuItem value="Other">Other (Check Remarks)</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
            <Button variant="outlined" onClick={() => handleGRNChange('')}>Cancel</Button>
            <Button variant="contained" color="primary" startIcon={<Check size={18} />} onClick={handleSubmitQC}>
              Submit QC Report
            </Button>
          </Box>
        </Card>
      ) : (
        <Box sx={{ p: 4, textAlign: 'center', border: '2px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Select a pending GRN arrival above to perform Quality Control inspection.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
