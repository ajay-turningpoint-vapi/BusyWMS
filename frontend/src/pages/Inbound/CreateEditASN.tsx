import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Box, Typography, Button, Card, Grid, FormControl, InputLabel, 
  Select, MenuItem, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, TextField, Alert, CircularProgress, 
  IconButton, Paper, Autocomplete, Divider, CardContent
} from '@mui/material';
import { ArrowLeft, Check, Plus, Trash2, Save } from 'lucide-react';
import api from '../../services/api';

export default function CreateEditASN() {
  const navigate = useNavigate();
  const { id } = useParams(); // ASN ID if in Edit Mode
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Lookups
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [itemsList, setItemsList] = useState<any[]>([]);

  // Header State
  const [supplierId, setSupplierId] = useState<number | string>('');
  const [poId, setPoId] = useState<number | string>('');
  const [warehouseId, setWarehouseId] = useState<number | string>('');
  const [shipmentDate, setShipmentDate] = useState(new Date().toISOString().slice(0, 16));
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(new Date(Date.now() + 24*60*60*1000).toISOString().slice(0, 16));
  const [transporter, setTransporter] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState('Draft');

  // Detail State (Items list)
  const [asnLines, setAsnLines] = useState<any[]>([
    { itemId: '', expectedQty: 1, uom: 'PCS', batchNumber: '', serialNumber: '', expiryDate: '' }
  ]);

  const loadLookups = async () => {
    try {
      const [supRes, whRes, poRes, itemsRes] = await Promise.all([
        api.get('/masters/suppliers'),
        api.get('/masters/warehouses'),
        api.get('/inbound/purchase-orders'),
        api.get('/masters/items')
      ]);
      setSuppliers(supRes.data);
      setWarehouses(whRes.data);
      setPurchaseOrders(poRes.data);
      setItemsList(itemsRes.data);
    } catch (err) {
      console.error('Failed to load lookup data', err);
    }
  };

  const loadASNDetails = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await api.get(`/inbound/asn/${id}`);
      const { header, items } = res.data;
      
      setSupplierId(header.SupplierId);
      setPoId(header.POId || '');
      setWarehouseId(header.WarehouseId);
      setShipmentDate(new Date(header.ShipmentDate).toISOString().slice(0, 16));
      setExpectedArrivalDate(new Date(header.ExpectedArrivalDate).toISOString().slice(0, 16));
      setTransporter(header.Transporter || '');
      setVehicleNumber(header.VehicleNumber || '');
      setTrackingNumber(header.TrackingNumber || '');
      setRemarks(header.Remarks || '');
      setStatus(header.Status);

      const formattedLines = items.map((it: any) => ({
        itemId: it.ItemId,
        expectedQty: it.ExpectedQty,
        uom: it.UOM,
        batchNumber: it.BatchNumber || '',
        serialNumber: it.SerialNumber || '',
        expiryDate: it.ExpiryDate ? new Date(it.ExpiryDate).toISOString().slice(0, 10) : ''
      }));
      setAsnLines(formattedLines);
      setLoading(false);
    } catch (err: any) {
      setError('Failed to load ASN details.');
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await loadLookups();
      if (isEditMode) {
        await loadASNDetails();
      }
    };
    init();
  }, [id]);

  // Handle PO selection - auto-populates supplier and PO lines if available
  const handlePOChange = async (selectedPoId: number | string) => {
    setPoId(selectedPoId);
    if (!selectedPoId) return;

    try {
      const po = purchaseOrders.find(p => p.POId === selectedPoId);
      if (po) {
        // Auto-match vendor if code matches supplier list
        const matchSup = suppliers.find(s => s.Code === po.VendorCode);
        if (matchSup) {
          setSupplierId(matchSup.SupplierId);
        }
      }

      // Load PO details to suggest items
      const detailsRes = await api.get(`/inbound/purchase-orders/${selectedPoId}`);
      if (detailsRes.data && detailsRes.data.length > 0) {
        const suggestedLines = detailsRes.data.map((line: any) => ({
          itemId: line.ItemId,
          expectedQty: line.OrderQty - line.ReceivedQty,
          uom: line.UOM || 'PCS',
          batchNumber: '',
          serialNumber: '',
          expiryDate: ''
        })).filter((line: any) => line.expectedQty > 0);
        
        if (suggestedLines.length > 0) {
          setAsnLines(suggestedLines);
        }
      }
    } catch (err) {
      console.error('Failed to load PO detail lines', err);
    }
  };

  const handleAddLine = () => {
    setAsnLines(prev => [
      ...prev,
      { itemId: '', expectedQty: 1, uom: 'PCS', batchNumber: '', serialNumber: '', expiryDate: '' }
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (asnLines.length === 1) return;
    setAsnLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleLineChange = (index: number, key: string, value: any) => {
    const updated = [...asnLines];
    updated[index][key] = value;
    
    // Auto-update UOM if item changes
    if (key === 'itemId' && value) {
      const selectedItem = itemsList.find(i => i.ItemId === value);
      if (selectedItem) {
        updated[index].uom = selectedItem.UOM || 'PCS';
      }
    }

    setAsnLines(updated);
  };

  const handleSave = async () => {
    setError('');
    setSuccess('');

    // Validations
    if (!supplierId) return setError('Supplier is required');
    if (!warehouseId) return setError('Warehouse is required');
    if (!shipmentDate) return setError('Shipment date is required');
    if (!expectedArrivalDate) return setError('Expected arrival date is required');
    
    // Filter out invalid items
    const validLines = asnLines.filter(line => line.itemId && line.expectedQty > 0);
    if (validLines.length === 0) {
      return setError('At least one item line with expected quantity greater than zero is required');
    }

    setSaving(true);
    const payload = {
      supplierId,
      poId: poId || null,
      shipmentDate,
      expectedArrivalDate,
      transporter,
      vehicleNumber,
      trackingNumber,
      warehouseId,
      remarks,
      items: validLines
    };

    try {
      if (isEditMode) {
        await api.put(`/inbound/asn/${id}`, payload);
        // If status was changed, update it too
        if (status !== 'Draft') {
          await api.put(`/inbound/asn/${id}/status`, { status });
        }
        setSuccess('Advanced Shipment Notice updated successfully.');
      } else {
        await api.post('/inbound/asn', payload);
        setSuccess('Advanced Shipment Notice created successfully.');
      }

      setTimeout(() => {
        navigate('/inbound/asn');
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save Advanced Shipment Notice');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton onClick={() => navigate('/inbound/asn')} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1 }}>
            <ArrowLeft size={18} />
          </IconButton>
          <Box sx={{ ml: 1 }}>
            <Typography variant="h2" sx={{ fontWeight: 700 }}>
              {isEditMode ? 'Edit Shipment Notice (ASN)' : 'Create Shipment Notice (ASN)'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isEditMode ? `Edit ASN Draft #${id}` : 'Create a pre-shipment notice for incoming goods.'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button 
            variant="outlined" 
            onClick={() => navigate('/inbound/asn')}
          >
            Cancel
          </Button>
          <Button 
            variant="contained" 
            startIcon={<Save size={18} />}
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Saving...' : 'Save ASN'}
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 3 }}>{success}</Alert>}

      <Grid container spacing={3}>
        {/* Header Info Card */}
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Shipment Details</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small" required>
                    <InputLabel>Warehouse</InputLabel>
                    <Select
                      value={warehouseId}
                      label="Warehouse"
                      onChange={(e) => setWarehouseId(e.target.value)}
                    >
                      {warehouses.map(wh => (
                        <MenuItem key={wh.WarehouseId} value={wh.WarehouseId}>{wh.Name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>PO Reference (Optional)</InputLabel>
                    <Select
                      value={poId}
                      label="PO Reference (Optional)"
                      onChange={(e) => handlePOChange(e.target.value)}
                    >
                      <MenuItem value="">Direct Inward (No PO)</MenuItem>
                      {purchaseOrders.map(po => (
                        <MenuItem key={po.POId} value={po.POId}>{po.POCode} ({po.VendorName})</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small" required>
                    <InputLabel>Supplier</InputLabel>
                    <Select
                      value={supplierId}
                      label="Supplier"
                      onChange={(e) => setSupplierId(e.target.value)}
                    >
                      {suppliers.map(sup => (
                        <MenuItem key={sup.SupplierId} value={sup.SupplierId}>{sup.Name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                {isEditMode && (
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>ASN Status</InputLabel>
                      <Select
                        value={status}
                        label="ASN Status"
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <MenuItem value="Draft">Draft</MenuItem>
                        <MenuItem value="Confirmed">Confirmed</MenuItem>
                        <MenuItem value="In Transit">In Transit</MenuItem>
                        <MenuItem value="Cancelled">Cancelled</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                )}
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Shipment Date"
                    type="datetime-local"
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={shipmentDate}
                    onChange={(e) => setShipmentDate(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Expected Arrival Date"
                    type="datetime-local"
                    fullWidth
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    value={expectedArrivalDate}
                    onChange={(e) => setExpectedArrivalDate(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Transporter Name"
                    fullWidth
                    size="small"
                    placeholder="e.g. DHL, Fedex"
                    value={transporter}
                    onChange={(e) => setTransporter(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Vehicle Number"
                    fullWidth
                    size="small"
                    placeholder="e.g. DL-1CA-1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Tracking Number"
                    fullWidth
                    size="small"
                    placeholder="AWB / consignment no."
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={9}>
                  <TextField
                    label="Remarks"
                    fullWidth
                    size="small"
                    placeholder="Any loading instructions or notes"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Detail Lines Table Card */}
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>Item Detail Lines</Typography>
                <Button 
                  variant="outlined" 
                  size="small"
                  startIcon={<Plus size={14} />}
                  onClick={handleAddLine}
                >
                  Add Item Line
                </Button>
              </Box>
              
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width="35%">Item Code & Name</TableCell>
                      <TableCell width="12%">Expected Qty</TableCell>
                      <TableCell width="10%">UOM</TableCell>
                      <TableCell width="15%">Batch (Optional)</TableCell>
                      <TableCell width="18%">Expiry (Optional)</TableCell>
                      <TableCell width="10%" align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {asnLines.map((row, idx) => {
                      const selectedItem = itemsList.find(i => i.ItemId === row.itemId);
                      const isBatchTracked = selectedItem ? selectedItem.TrackBatch === 1 : false;

                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <Autocomplete
                              size="small"
                              options={itemsList}
                              getOptionLabel={(option) => `${option.Code} - ${option.Name}`}
                              value={itemsList.find(item => item.ItemId === row.itemId) || null}
                              onChange={(_, newValue) => {
                                handleLineChange(idx, 'itemId', newValue ? newValue.ItemId : '');
                              }}
                              renderInput={(params) => (
                                <TextField {...params} placeholder="Search Item..." variant="outlined" size="small" />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              type="number"
                              size="small"
                              fullWidth
                              value={row.expectedQty}
                              onChange={(e) => handleLineChange(idx, 'expectedQty', parseFloat(e.target.value) || 0)}
                              inputProps={{ min: 1 }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              disabled
                              value={row.uom || ''}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              size="small"
                              fullWidth
                              placeholder="Batch Number"
                              disabled={!isBatchTracked}
                              value={row.batchNumber}
                              onChange={(e) => handleLineChange(idx, 'batchNumber', e.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              type="date"
                              size="small"
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                              disabled={!isBatchTracked}
                              value={row.expiryDate}
                              onChange={(e) => handleLineChange(idx, 'expiryDate', e.target.value)}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <IconButton 
                              color="error" 
                              size="small"
                              disabled={asnLines.length === 1}
                              onClick={() => handleRemoveLine(idx)}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
