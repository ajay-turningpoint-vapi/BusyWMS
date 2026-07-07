import React, { useEffect, useState } from 'react';
import { 
  Box, Typography, Grid, Card, TextField, Button, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Paper, Checkbox, 
  FormControlLabel, FormControl, InputLabel, Select, MenuItem, 
  Divider, Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  FormGroup, Switch, Slider, CircularProgress
} from '@mui/material';
import { Printer, Plus, Save, Trash, Check, Sliders, Eye } from 'lucide-react';
import api from '../services/api';
import ConfirmDialog from '../components/ConfirmDialog';

export default function BarcodeConfig() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null);

  // Confirm delete dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [pageSize, setPageSize] = useState('CUSTOM');
  const [labelWidth, setLabelWidth] = useState(50.0);
  const [labelHeight, setLabelHeight] = useState(30.0);
  const [marginLeft, setMarginLeft] = useState(2.0);
  const [marginTop, setMarginTop] = useState(2.0);
  const [rowsPerPage, setRowsPerPage] = useState(1);
  const [colsPerPage, setColsPerPage] = useState(1);
  const [gapX, setGapX] = useState(1.0);
  const [gapY, setGapY] = useState(1.0);
  const [orientation, setOrientation] = useState('PORTRAIT');
  const [barcodeType, setBarcodeType] = useState('CODE128');
  const [barcodePosition, setBarcodePosition] = useState('CENTER');
  const [textPosition, setTextPosition] = useState('BOTTOM');
  const [fontSize, setFontSize] = useState(10);
  const [fontStyle, setFontStyle] = useState('normal');
  const [alignment, setAlignment] = useState('center');
  const [printItemName, setPrintItemName] = useState(true);
  const [printItemCode, setPrintItemCode] = useState(true);
  const [printSKU, setPrintSKU] = useState(false);
  const [printBarcodeNumber, setPrintBarcodeNumber] = useState(true);
  const [printBatchNumber, setPrintBatchNumber] = useState(false);
  const [printSerialNumber, setPrintSerialNumber] = useState(false);
  const [printMRP, setPrintMRP] = useState(false);
  const [printSalePrice, setPrintSalePrice] = useState(false);
  const [printMfgDate, setPrintMfgDate] = useState(false);
  const [printExpiryDate, setPrintExpiryDate] = useState(false);
  const [printCompanyName, setPrintCompanyName] = useState(true);
  const [companyName, setCompanyName] = useState('BusyWMS Enterprise');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/barcode/templates');
      setTemplates(res.data);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to load barcode templates.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setName('');
    setPageSize('CUSTOM');
    setLabelWidth(50.0);
    setLabelHeight(30.0);
    setMarginLeft(2.0);
    setMarginTop(2.0);
    setRowsPerPage(1);
    setColsPerPage(1);
    setGapX(1.0);
    setGapY(1.0);
    setOrientation('PORTRAIT');
    setBarcodeType('CODE128');
    setBarcodePosition('CENTER');
    setTextPosition('BOTTOM');
    setFontSize(10);
    setFontStyle('normal');
    setAlignment('center');
    setPrintItemName(true);
    setPrintItemCode(true);
    setPrintSKU(false);
    setPrintBarcodeNumber(true);
    setPrintBatchNumber(false);
    setPrintSerialNumber(false);
    setPrintMRP(false);
    setPrintSalePrice(false);
    setPrintMfgDate(false);
    setPrintExpiryDate(false);
    setPrintCompanyName(true);
    setCompanyName('BusyWMS Enterprise');
    setDialogOpen(true);
  };

  const handleOpenEdit = (t: any) => {
    setEditingTemplate(t);
    setName(t.Name);
    setPageSize(t.PageSize);
    setLabelWidth(t.LabelWidth);
    setLabelHeight(t.LabelHeight);
    setMarginLeft(t.MarginLeft);
    setMarginTop(t.MarginTop);
    setRowsPerPage(t.RowsPerPage);
    setColsPerPage(t.ColsPerPage);
    setGapX(t.GapX);
    setGapY(t.GapY);
    setOrientation(t.Orientation);
    setBarcodeType(t.BarcodeType);
    setBarcodePosition(t.BarcodePosition);
    setTextPosition(t.TextPosition);
    setFontSize(t.FontSize);
    setFontStyle(t.FontStyle);
    setAlignment(t.Alignment);
    setPrintItemName(t.PrintItemName === 1);
    setPrintItemCode(t.PrintItemCode === 1);
    setPrintSKU(t.PrintSKU === 1);
    setPrintBarcodeNumber(t.PrintBarcodeNumber === 1);
    setPrintBatchNumber(t.PrintBatchNumber === 1);
    setPrintSerialNumber(t.PrintSerialNumber === 1);
    setPrintMRP(t.PrintMRP === 1);
    setPrintSalePrice(t.PrintSalePrice === 1);
    setPrintMfgDate(t.PrintMfgDate === 1);
    setPrintExpiryDate(t.PrintExpiryDate === 1);
    setPrintCompanyName(t.PrintCompanyName === 1);
    setCompanyName(t.CompanyName);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');

    const payload = {
      name, pageSize, labelWidth, labelHeight, marginLeft, marginTop,
      rowsPerPage, colsPerPage, gapX, gapY, orientation, barcodeType, barcodePosition,
      textPosition, fontSize, fontStyle, alignment, 
      printItemName: printItemName ? 1 : 0,
      printItemCode: printItemCode ? 1 : 0,
      printSKU: printSKU ? 1 : 0,
      printBarcodeNumber: printBarcodeNumber ? 1 : 0,
      printBatchNumber: printBatchNumber ? 1 : 0,
      printSerialNumber: printSerialNumber ? 1 : 0,
      printMRP: printMRP ? 1 : 0,
      printSalePrice: printSalePrice ? 1 : 0,
      printMfgDate: printMfgDate ? 1 : 0,
      printExpiryDate: printExpiryDate ? 1 : 0,
      printCompanyName: printCompanyName ? 1 : 0,
      companyName
    };

    try {
      if (editingTemplate) {
        await api.put(`/barcode/templates/${editingTemplate.TemplateId}`, payload);
        setSuccessMsg('Barcode template updated successfully.');
      } else {
        await api.post('/barcode/templates', payload);
        setSuccessMsg('Barcode template created successfully.');
      }
      setDialogOpen(false);
      fetchTemplates();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Failed to save template.');
    }
  };

  const handleDeleteClick = (id: number) => {
    setDeleteTarget(id);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setConfirmOpen(false);
    try {
      await api.delete(`/barcode/templates/${deleteTarget}`);
      setSuccessMsg('Barcode template deleted successfully.');
      fetchTemplates();
    } catch (err: any) {
      setErrorMsg('Failed to delete template.');
    }
    setDeleteTarget(null);
  };

  const handleSetDefault = async (id: number) => {
    try {
      await api.post(`/barcode/templates/${id}/default`);
      setSuccessMsg('Default barcode template updated.');
      fetchTemplates();
    } catch (err: any) {
      setErrorMsg('Failed to set default template.');
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Barcode Templates Config</Typography>
          <Typography variant="body2" color="text.secondary">Design custom print layouts for items, batches, and locations.</Typography>
        </Box>
        <Button 
          variant="contained" 
          startIcon={<Plus size={16} />} 
          onClick={handleOpenCreate}
          sx={{ fontWeight: 600 }}
        >
          Create Template
        </Button>
      </Box>

      {successMsg && <Alert severity="success" sx={{ mb: 3 }}>{successMsg}</Alert>}
      {errorMsg && <Alert severity="error" sx={{ mb: 3 }}>{errorMsg}</Alert>}

      <Card>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 700 }}>Template Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Barcode Symbology</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Label Size (W x H)</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Grid Layout</TableCell>
                <TableCell align="center" sx={{ fontWeight: 700 }}>Default</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t.TemplateId}>
                    <TableCell sx={{ fontWeight: 600 }}>{t.Name}</TableCell>
                    <TableCell>{t.BarcodeType}</TableCell>
                    <TableCell>{t.LabelWidth}mm x {t.LabelHeight}mm</TableCell>
                    <TableCell>{t.ColsPerPage} Col(s) x {t.RowsPerPage} Row(s)</TableCell>
                    <TableCell align="center">
                      {t.IsDefault === 1 ? (
                        <Check size={18} color="green" style={{ strokeWidth: 3 }} />
                      ) : (
                        <Button size="small" onClick={() => handleSetDefault(t.TemplateId)}>Set Default</Button>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => handleOpenEdit(t)}>Edit</Button>
                      <Button size="small" color="error" onClick={() => handleDeleteClick(t.TemplateId)} sx={{ ml: 1 }}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {templates.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} align="center">No barcode templates found. Create one to begin custom printing.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Editor & Preview Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {editingTemplate ? 'Edit Barcode Template' : 'Create Barcode Template'}
        </DialogTitle>
        <form onSubmit={handleSave}>
          <DialogContent dividers sx={{ maxHeight: '70vh', overflowY: 'auto' }}>
            <Grid container spacing={3}>
              {/* Properties Editor */}
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Sliders size={16} /> Layout Properties
                </Typography>
                
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField 
                      label="Template Name" 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      fullWidth 
                      required 
                      size="small"
                    />
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Page Format</InputLabel>
                      <Select value={pageSize} label="Page Format" onChange={(e) => setPageSize(e.target.value)}>
                        <MenuItem value="CUSTOM">Custom (Roll/Thermal)</MenuItem>
                        <MenuItem value="A4">A4 Sheet (Sticker Sheet)</MenuItem>
                        <MenuItem value="LETTER">Letter Sheet</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Orientation</InputLabel>
                      <Select value={orientation} label="Orientation" onChange={(e) => setOrientation(e.target.value)}>
                        <MenuItem value="PORTRAIT">Portrait</MenuItem>
                        <MenuItem value="LANDSCAPE">Landscape</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Barcode Type</InputLabel>
                      <Select value={barcodeType} label="Barcode Type" onChange={(e) => setBarcodeType(e.target.value)}>
                        <MenuItem value="CODE128">Code 128</MenuItem>
                        <MenuItem value="CODE39">Code 39</MenuItem>
                        <MenuItem value="EAN13">EAN-13</MenuItem>
                        <MenuItem value="EAN8">EAN-8</MenuItem>
                        <MenuItem value="UPC">UPC-A</MenuItem>
                        <MenuItem value="QRCODE">QR Code</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <TextField 
                      label="Company Header" 
                      value={companyName} 
                      onChange={(e) => setCompanyName(e.target.value)} 
                      fullWidth 
                      size="small"
                    />
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <TextField 
                      label="Label Width (mm)" 
                      type="number" 
                      value={labelWidth} 
                      onChange={(e) => setLabelWidth(Number(e.target.value))} 
                      fullWidth 
                      size="small"
                    />
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <TextField 
                      label="Label Height (mm)" 
                      type="number" 
                      value={labelHeight} 
                      onChange={(e) => setLabelHeight(Number(e.target.value))} 
                      fullWidth 
                      size="small"
                    />
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <TextField 
                      label="Margin Left (mm)" 
                      type="number" 
                      value={marginLeft} 
                      onChange={(e) => setMarginLeft(Number(e.target.value))} 
                      fullWidth 
                      size="small"
                    />
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <TextField 
                      label="Margin Top (mm)" 
                      type="number" 
                      value={marginTop} 
                      onChange={(e) => setMarginTop(Number(e.target.value))} 
                      fullWidth 
                      size="small"
                    />
                  </Grid>

                  {pageSize !== 'CUSTOM' && (
                    <>
                      <Grid item xs={6} md={3}>
                        <TextField 
                          label="Rows per Page" 
                          type="number" 
                          value={rowsPerPage} 
                          onChange={(e) => setRowsPerPage(Number(e.target.value))} 
                          fullWidth 
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6} md={3}>
                        <TextField 
                          label="Cols per Page" 
                          type="number" 
                          value={colsPerPage} 
                          onChange={(e) => setColsPerPage(Number(e.target.value))} 
                          fullWidth 
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6} md={3}>
                        <TextField 
                          label="Gap X (mm)" 
                          type="number" 
                          value={gapX} 
                          onChange={(e) => setGapX(Number(e.target.value))} 
                          fullWidth 
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={6} md={3}>
                        <TextField 
                          label="Gap Y (mm)" 
                          type="number" 
                          value={gapY} 
                          onChange={(e) => setGapY(Number(e.target.value))} 
                          fullWidth 
                          size="small"
                        />
                      </Grid>
                    </>
                  )}

                  <Grid item xs={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Select Information to Print</Typography>
                    <FormGroup sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                      <FormControlLabel control={<Checkbox checked={printCompanyName} onChange={(e) => setPrintCompanyName(e.target.checked)} />} label="Company Name" />
                      <FormControlLabel control={<Checkbox checked={printItemName} onChange={(e) => setPrintItemName(e.target.checked)} />} label="Item Name" />
                      <FormControlLabel control={<Checkbox checked={printItemCode} onChange={(e) => setPrintItemCode(e.target.checked)} />} label="Item Code" />
                      <FormControlLabel control={<Checkbox checked={printSKU} onChange={(e) => setPrintSKU(e.target.checked)} />} label="SKU / Barcode" />
                      <FormControlLabel control={<Checkbox checked={printBarcodeNumber} onChange={(e) => setPrintBarcodeNumber(e.target.checked)} />} label="Barcode Digits" />
                      <FormControlLabel control={<Checkbox checked={printBatchNumber} onChange={(e) => setPrintBatchNumber(e.target.checked)} />} label="Batch Number" />
                      <FormControlLabel control={<Checkbox checked={printSerialNumber} onChange={(e) => setPrintSerialNumber(e.target.checked)} />} label="Serial Number" />
                      <FormControlLabel control={<Checkbox checked={printMRP} onChange={(e) => setPrintMRP(e.target.checked)} />} label="MRP Price" />
                      <FormControlLabel control={<Checkbox checked={printSalePrice} onChange={(e) => setPrintSalePrice(e.target.checked)} />} label="Selling Price" />
                      <FormControlLabel control={<Checkbox checked={printMfgDate} onChange={(e) => setPrintMfgDate(e.target.checked)} />} label="Mfg Date" />
                      <FormControlLabel control={<Checkbox checked={printExpiryDate} onChange={(e) => setPrintExpiryDate(e.target.checked)} />} label="Expiry Date" />
                    </FormGroup>
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <TextField 
                      label="Font Size (px)" 
                      type="number" 
                      value={fontSize} 
                      onChange={(e) => setFontSize(Number(e.target.value))} 
                      fullWidth 
                      size="small"
                    />
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Font Weight</InputLabel>
                      <Select value={fontStyle} label="Font Weight" onChange={(e) => setFontStyle(e.target.value)}>
                        <MenuItem value="normal">Regular</MenuItem>
                        <MenuItem value="bold">Bold</MenuItem>
                        <MenuItem value="italic">Italic</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={6} md={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Text Align</InputLabel>
                      <Select value={alignment} label="Text Align" onChange={(e) => setAlignment(e.target.value)}>
                        <MenuItem value="center">Center</MenuItem>
                        <MenuItem value="left">Left</MenuItem>
                        <MenuItem value="right">Right</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Grid>

              {/* Live Preview Pane */}
              <Grid item xs={12} md={4} sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Eye size={16} /> Live Label Preview
                </Typography>
                
                <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'action.hover', p: 3, borderRadius: 2, minHeight: 300 }}>
                  <Paper 
                    variant="outlined"
                    sx={{ 
                      width: `${labelWidth * 4}px`,
                      height: `${labelHeight * 4}px`,
                      p: 1.5, 
                      bgcolor: '#fff',
                      border: '1px solid #ddd',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: alignment === 'center' ? 'center' : alignment === 'left' ? 'flex-start' : 'flex-end',
                      textAlign: alignment,
                      overflow: 'hidden',
                      boxShadow: 2
                    }}
                  >
                    <Box sx={{ width: '100%' }}>
                      {printCompanyName && (
                        <Typography variant="caption" sx={{ fontSize: `${fontSize - 3}px`, fontWeight: 'bold', display: 'block', textTransform: 'uppercase', color: 'primary.main' }}>
                          {companyName}
                        </Typography>
                      )}
                      {printItemName && (
                        <Typography sx={{ fontSize: `${fontSize}px`, fontWeight: fontStyle === 'bold' ? 'bold' : 'normal', fontStyle: fontStyle === 'italic' ? 'italic' : 'normal', lineHeight: 1.1 }}>
                          Logitech G102 Mouse
                        </Typography>
                      )}
                      {printItemCode && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>
                          Code: ITM-001
                        </Typography>
                      )}
                      {printBatchNumber && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>
                          Batch: BAT-2026A
                        </Typography>
                      )}
                      {printSalePrice && (
                        <Typography sx={{ fontSize: `${fontSize - 1}px`, fontWeight: 'bold' }}>
                          Price: ₹850.00
                        </Typography>
                      )}
                    </Box>

                    {/* Barcode Image Mock */}
                    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', my: 0.5 }}>
                      {barcodeType === 'QRCODE' ? (
                        <img 
                          src="/api/barcode/generate?text=ITM-001&type=qrcode&scale=2" 
                          style={{ maxHeight: '40%', maxWidth: '40%' }} 
                          alt="QR Code Preview"
                        />
                      ) : (
                        <img 
                          src={`/api/barcode/generate?text=ITM-001&type=${barcodeType.toLowerCase()}&scale=1&height=20&includetext=${printBarcodeNumber ? 'true' : 'false'}`} 
                          style={{ maxHeight: '100%', maxWidth: '100%' }} 
                          alt="Barcode Preview"
                        />
                      )}
                    </Box>
                  </Paper>
                </Box>
              </Grid>
            </Grid>
          </DialogContent>
          
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" startIcon={<Save size={16} />}>
              Save Template
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Barcode Template"
        message="Are you sure you want to delete this barcode template? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
      />
    </Box>
  );
}
