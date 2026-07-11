import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Button, Card, Grid, Autocomplete,
  Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, TextField, Alert, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { ArrowLeft, Check, Printer, Scan } from 'lucide-react';
import api from '../../services/api';
import BarcodePrintDialog from '../../components/BarcodePrintDialog';
import { CODE128_PATTERNS } from '../../components/Barcode';
import { useToast } from '../../contexts/ToastContext';

export default function GRN() {
  const [pos, setPos] = useState<any[]>([]);
  const [selectedPOId, setSelectedPOId] = useState<number | string>('');
  const [poDetails, setPoDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState('');
  
  // Barcode scanning / Printing state
  const [printOpen, setPrintOpen] = useState(false);
  const [printItem, setPrintItem] = useState<any>(null);
  
  // Automatic print confirmation state
  const [confirmPrintOpen, setConfirmPrintOpen] = useState(false);
  const [itemsToPrint, setItemsToPrint] = useState<any[]>([]);
  
  // Received values state
  const [receivedQtys, setReceivedQtys] = useState<Record<number, number>>({});
  const [batches, setBatches] = useState<Record<number, string>>({});
  const [expiries, setExpiries] = useState<Record<number, string>>({});
  const [serials, setSerials] = useState<Record<number, string>>({}); // comma separated serials

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const toast = useToast();

  // Selected PO object for Autocomplete
  const [selectedPO, setSelectedPO] = useState<any | null>(null);
  const [poSearchQuery, setPoSearchQuery] = useState('');
  const [posLoading, setPosLoading] = useState(false);

  useEffect(() => {
    const trimmed = poSearchQuery.trim();
    if (!trimmed) {
      setPos([]);
      setPosLoading(false);
      setLoading(false);
      return;
    }
    setPosLoading(true);
    const delayDebounce = setTimeout(() => {
      api.get('/inbound/pending-pos', {
        params: {
          search: trimmed
        }
      })
        .then(res => {
          setPos(res.data || []);
          setPosLoading(false);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setPosLoading(false);
          setLoading(false);
        });
    }, 400); // 400ms debounce
    return () => clearTimeout(delayDebounce);
  }, [poSearchQuery]);

  const handlePOChange = async (poId: number | string) => {
    setSelectedPOId(poId);
    if (!poId) {
      setPoDetails([]);
      return;
    }
    setDetailsLoading(true);
    try {
      const res = await api.get(`/inbound/po-details/${poId}`);
      setPoDetails(res.data);
      
      // Initialize states
      const qtys: Record<number, number> = {};
      const btchs: Record<number, string> = {};
      const exps: Record<number, string> = {};
      const srls: Record<number, string> = {};
      
      res.data.forEach((item: any) => {
        qtys[item.ItemId] = item.PendingQty;
        if (item.TrackBatch) btchs[item.ItemId] = `BAT-${Date.now().toString().slice(-4)}`;
        if (item.TrackSerial) srls[item.ItemId] = '';
      });

      setReceivedQtys(qtys);
      setBatches(btchs);
      setExpiries(exps);
      setSerials(srls);
      
      setDetailsLoading(false);
    } catch (err) {
      setError('Failed to load PO lines');
      setDetailsLoading(false);
    }
  };

  const handleQtyChange = (itemId: number, val: number) => {
    setReceivedQtys(prev => ({ ...prev, [itemId]: val }));
  };

  const handleBatchChange = (itemId: number, val: string) => {
    setBatches(prev => ({ ...prev, [itemId]: val }));
  };

  const handleExpiryChange = (itemId: number, val: string) => {
    setExpiries(prev => ({ ...prev, [itemId]: val }));
  };

  const handleSerialChange = (itemId: number, val: string) => {
    setSerials(prev => ({ ...prev, [itemId]: val }));
  };

  const handleSubmitGRN = async () => {
    setError('');
    setSuccess('');

    if (!invoiceNo) {
      setError('Invoice number is required');
      return;
    }

    // BUG-004 FIX: Validate serials BEFORE .map() so errors are caught correctly
    // A throw inside .map() doesn't propagate to the surrounding async try/catch
    const validationErrors: string[] = [];
    for (const item of poDetails) {
      const receivedQty = receivedQtys[item.ItemId] || 0;
      if (item.TrackSerial && receivedQty > 0) {
        const parsedSerials = (serials[item.ItemId] || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
        if (parsedSerials.length !== receivedQty) {
          validationErrors.push(
            `Serial count (${parsedSerials.length}) must match received quantity (${receivedQty}) for item ${item.ItemName}`
          );
        }
      }
    }
    if (validationErrors.length > 0) {
      setError(validationErrors.join(' | '));
      return;
    }

    const itemsPayload = poDetails.map(item => {
      const receivedQty = receivedQtys[item.ItemId] || 0;
      
      // Parse serials (already validated above)
      let parsedSerials: string[] = [];
      if (item.TrackSerial) {
        parsedSerials = (serials[item.ItemId] || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0);
      }

      return {
        itemId: item.ItemId,
        receivedQty,
        trackBatch: item.TrackBatch,
        batchNumber: batches[item.ItemId] || null,
        expiryDate: expiries[item.ItemId] || null,
        trackSerial: item.TrackSerial,
        serialNumbers: parsedSerials
      };
    });

    try {
      const payload = {
        poId: selectedPOId,
        invoiceNo,
        items: itemsPayload
      };
      
      const res = await api.post('/inbound/grn', payload);
      setSuccess(`GRN created successfully: ${res.data.grnCode}. Proceed to QC Inspection.`);
      
      // Save items for printing before clearing
      const printed = poDetails.map(item => ({
        itemCode: item.ItemCode,
        itemName: item.ItemName,
        qty: receivedQtys[item.ItemId] || 0,
        batch: batches[item.ItemId] || ''
      })).filter(x => x.qty > 0);

      if (printed.length > 0) {
        setItemsToPrint(printed);
        setConfirmPrintOpen(true);
      }

      setSelectedPOId('');
      setSelectedPO(null);
      setPoDetails([]);
      setPoSearchQuery('');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'GRN saving failed');
    }
  };

  const handleBulkPrint = () => {
    setConfirmPrintOpen(false);
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Load defaults from localStorage
    const barcodeType = localStorage.getItem('wms_default_barcode_type') || 'Code128';
    const barcodeWidth = parseInt(localStorage.getItem('wms_default_barcode_width') || '2', 10);
    const barcodeHeight = parseInt(localStorage.getItem('wms_default_barcode_height') || '60', 10);
    const labelSize = localStorage.getItem('wms_default_label_size') || '3x2';

    let widthStyle = '3in';
    let heightStyle = '2in';
    if (labelSize === '2x1') {
      widthStyle = '2in';
      heightStyle = '1in';
    } else if (labelSize === '4x3') {
      widthStyle = '4in';
      heightStyle = '3in';
    }

    const qrSize = labelSize === '2x1' ? 70 : 110;
    const isQR = barcodeType === 'QRCode';

    let labelHtml = '';
    
    itemsToPrint.forEach(item => {
      for (let idx = 0; idx < item.qty; idx++) {
        labelHtml += `
          <div class="label-sheet">
            <div class="label-content ${isQR ? 'qr-layout' : ''}">
              <div class="label-info">
                <div class="item-name">${item.itemName}</div>
                <div class="item-code">Code: ${item.itemCode}</div>
                ${item.batch ? `<div class="item-batch">Batch: ${item.batch}</div>` : ''}
              </div>
              <div class="barcode-wrapper">
                ${
                  isQR 
                  ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(item.itemCode)}" />`
                  : barcodeType === 'EAN13' && item.itemCode.replace(/\D/g, '').length === 13
                    ? `<img src="https://bwipjs-api.metafloor.com/?bcid=ean13&text=${item.itemCode.replace(/\D/g, '')}&scale=2&height=${barcodeHeight}&includetext" />`
                    : `<div class="native-code128">${renderNativeCode128SvgHtml(item.itemCode, barcodeWidth, barcodeHeight, true)}</div>`
                }
              </div>
            </div>
          </div>
        `;
      }
    });

    const html = `
      <html>
        <head>
          <title>Print GRN Barcode Labels</title>
          <style>
            @page {
              size: ${widthStyle} ${heightStyle};
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: Arial, sans-serif;
              -webkit-print-color-adjust: exact;
            }
            .label-sheet {
              width: ${widthStyle};
              height: ${heightStyle};
              page-break-after: always;
              display: flex;
              align-items: center;
              justify-content: center;
              box-sizing: border-box;
              padding: 0.15in;
              overflow: hidden;
            }
            .label-content {
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: center;
              text-align: center;
            }
            .label-content.qr-layout {
              flex-direction: row;
              text-align: left;
              justify-content: space-around;
            }
            .label-info {
              width: 100%;
            }
            .qr-layout .label-info {
              width: 50%;
            }
            .item-name {
              font-size: 11px;
              font-weight: bold;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              margin-bottom: 2px;
            }
            .item-code, .item-batch {
              font-size: 8px;
              color: #555;
            }
            .barcode-wrapper {
              margin-top: 4px;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .native-code128 {
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .native-code128 svg {
              display: block;
            }
            .native-code128 span {
              font-size: 8px;
              font-family: monospace;
              margin-top: 2px;
            }
            img {
              max-height: 100%;
              max-width: 100%;
            }
          </style>
        </head>
        <body>
          ${labelHtml}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const triggerBarcodePrint = (item: any) => {
    setPrintItem({
      code: item.ItemCode,
      name: item.ItemName,
      batch: batches[item.ItemId] || 'N/A',
      qty: receivedQtys[item.ItemId] || 0
    });
    setPrintOpen(true);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h2" sx={{ mb: 1, fontWeight: 700 }}>Goods Receipt Note (GRN)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Receive inventory against open Purchase Orders, register batches and serial numbers, and print barcodes.
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={6}>
            <Autocomplete
              options={pos}
              value={selectedPO}
              loading={posLoading}
              onInputChange={(event, newInputValue) => {
                setPoSearchQuery(newInputValue);
              }}
              onChange={(_event, newValue) => {
                setSelectedPO(newValue);
                handlePOChange(newValue ? newValue.POId : '');
              }}
              getOptionLabel={(option: any) =>
                option ? `${option.POCode} — ${option.VendorName} (${option.VendorCode})` : ''
              }
              isOptionEqualToValue={(option: any, value: any) => option.POId === value?.POId}
              renderOption={(props, option: any) => (
                <Box component="li" {...props} key={option.POId} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', gap: 0.25, py: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {option.POCode}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {option.VendorName} ({option.VendorCode}) &bull; {option.OrderDate ? new Date(option.OrderDate).toLocaleDateString() : ''}
                  </Typography>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Search & Select Purchase Order"
                  placeholder="Type PO code, vendor name, or vendor code..."
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {posLoading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              noOptionsText="No matching Purchase Orders"
              clearOnEscape
              size="small"
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Supplier Invoice Reference"
              size="small"
              fullWidth
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
            />
          </Grid>
        </Grid>
      </Card>

      {detailsLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : poDetails.length > 0 ? (
        <Card sx={{ p: 3 }}>
          <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>PO Line Items</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Ordered Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Pending Qty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Recv Qty Now</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Batch / Serial Tracking</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {poDetails.map((item) => (
                  <React.Fragment key={item.ItemId}>
                    <TableRow hover>
                      <TableCell sx={{ fontWeight: 600 }}>{item.ItemName} ({item.ItemCode})</TableCell>
                      <TableCell>{item.OrderQty} {item.ItemUOM}</TableCell>
                      <TableCell>{item.PendingQty} {item.ItemUOM}</TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          size="small"
                          sx={{ width: 100 }}
                          value={receivedQtys[item.ItemId] || ''}
                          onChange={(e) => handleQtyChange(item.ItemId, parseFloat(e.target.value))}
                        />
                      </TableCell>
                      <TableCell>
                        {item.TrackBatch && <Chip label="Batch" color="primary" size="small" variant="outlined" sx={{ mr: 0.5 }} />}
                        {item.TrackSerial && <Chip label="Serial" color="secondary" size="small" variant="outlined" />}
                        {!item.TrackBatch && !item.TrackSerial && <Chip label="Standard" size="small" variant="outlined" />}
                      </TableCell>
                      <TableCell>
                        <Button 
                          size="small" 
                          variant="outlined" 
                          startIcon={<Printer size={14} />} 
                          onClick={() => triggerBarcodePrint(item)}
                        >
                          Print Barcodes
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Batch details / Serials inputs if needed */}
                    {(item.TrackBatch || item.TrackSerial) && (
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell colSpan={6} sx={{ py: 1.5, px: 3 }}>
                          <Grid container spacing={2}>
                            {item.TrackBatch && (
                              <>
                                <Grid item xs={12} sm={6} md={3}>
                                  <TextField 
                                    label="Batch Number" 
                                    size="small" 
                                    fullWidth
                                    value={batches[item.ItemId] || ''} 
                                    onChange={(e) => handleBatchChange(item.ItemId, e.target.value)} 
                                  />
                                </Grid>
                                <Grid item xs={12} sm={6} md={3}>
                                  <TextField 
                                    label="Expiry Date" 
                                    type="date" 
                                    size="small" 
                                    fullWidth 
                                    InputLabelProps={{ shrink: true }}
                                    value={expiries[item.ItemId] || ''} 
                                    onChange={(e) => handleExpiryChange(item.ItemId, e.target.value)} 
                                  />
                                </Grid>
                              </>
                            )}
                            {item.TrackSerial && (
                              <Grid item xs={12} sm={12} md={6}>
                                <TextField 
                                  label="Serial Numbers (Comma-separated)" 
                                  size="small" 
                                  placeholder="SN-001, SN-002, SN-003..."
                                  fullWidth
                                  value={serials[item.ItemId] || ''} 
                                  onChange={(e) => handleSerialChange(item.ItemId, e.target.value)} 
                                />
                              </Grid>
                            )}
                          </Grid>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 4 }}>
            <Button variant="outlined" onClick={() => handlePOChange('')}>Cancel</Button>
            <Button variant="contained" color="success" startIcon={<Check size={18} />} onClick={handleSubmitGRN}>
              Submit Inward (GRN)
            </Button>
          </Box>
        </Card>
      ) : (
        <Box sx={{ p: 4, textAlign: 'center', border: '2px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <Typography variant="body1" color="text.secondary">
            Select a synchronized Purchase Order above to begin receiving goods.
          </Typography>
        </Box>
      )}

      {/* Barcode Print Dialog Preview */}
      {printItem && (
        <BarcodePrintDialog 
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          itemCode={printItem.code}
          itemName={printItem.name}
          batchNumber={printItem.batch !== 'N/A' ? printItem.batch : undefined}
          defaultQty={printItem.qty || 1}
        />
      )}

      {/* Confirmation Dialog for Automatic Printing */}
      <Dialog
        open={confirmPrintOpen}
        onClose={() => setConfirmPrintOpen(false)}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Print Barcode Labels?</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            GRN submitted successfully. Would you like to print barcode labels for the received goods now?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will print a total of {itemsToPrint.reduce((acc, curr) => acc + curr.qty, 0)} label(s) using your default printer settings.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmPrintOpen(false)}>No, Skip</Button>
          <Button onClick={handleBulkPrint} variant="contained" color="primary" autoFocus>
            Yes, Print Now
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Inline pure Code128 pattern drawing to embed vector graphics inside printing popup window
function renderNativeCode128SvgHtml(text: string, width: number, height: number, includeText: boolean): string {
  try {
    let sum = 104;
    const chars = [104];
    
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      const value = code - 32;
      if (value < 0 || value > 95) continue;
      sum += value * (i + 1);
      chars.push(value);
    }
    
    const checksum = sum % 103;
    chars.push(checksum);
    chars.push(106);
    
    const widthString = chars.map(c => CODE128_PATTERNS[c]).join('');
    let currentX = 0;
    let rectsHtml = '';
    
    for (let i = 0; i < widthString.length; i++) {
      const w = parseInt(widthString[i], 10);
      if (i % 2 === 0) {
        rectsHtml += `<rect x="${currentX * width}" y="0" width="${w * width}" height="${height}" fill="#000" />`;
      }
      currentX += w;
    }
    
    const totalWidth = currentX * width;
    
    return `
      <svg width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}">
        ${rectsHtml}
      </svg>
      ${includeText ? `<span>${text}</span>` : ''}
    `;
  } catch (err) {
    return `<span>${text}</span>`;
  }
}
