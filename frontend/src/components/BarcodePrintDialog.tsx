import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, 
  Grid, FormControl, InputLabel, Select, MenuItem, TextField, 
  Box, Typography, Paper, Divider, Slider, FormControlLabel, Checkbox,
  CircularProgress, Alert, Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import { Printer, Settings, Sliders, Eye, ChevronDown } from 'lucide-react';
import api from '../services/api';

interface BarcodePrintDialogProps {
  open: boolean;
  onClose: () => void;
  itemCode: string;
  itemName: string;
  batchNumber?: string;
  defaultQty?: number;
  isBin?: boolean;
}

export default function BarcodePrintDialog({ 
  open, 
  onClose, 
  itemCode, 
  itemName, 
  batchNumber = '', 
  defaultQty = 1,
  isBin = false
}: BarcodePrintDialogProps) {
  
  // State variables for templates
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Print field values (Read-Only database values)
  const [printItemName, setPrintItemName] = useState('');
  const [printItemCode, setPrintItemCode] = useState('');
  const [printSKU, setPrintSKU] = useState('');
  const [printBarcodeNumber, setPrintBarcodeNumber] = useState('');
  const [printBatchNumber, setPrintBatchNumber] = useState('');
  const [printSerialNumber, setPrintSerialNumber] = useState('');
  const [printMRP, setPrintMRP] = useState('');
  const [printSalePrice, setPrintSalePrice] = useState('');
  const [printMfgDate, setPrintMfgDate] = useState('');
  const [printExpiryDate, setPrintExpiryDate] = useState('');
  const [printCompanyName, setPrintCompanyName] = useState('BusyWMS Enterprise');
  const [printUOM, setPrintUOM] = useState('');
  const [numLabels, setNumLabels] = useState(defaultQty);

  // Template settings customization overrides
  const [customizeSettings, setCustomizeSettings] = useState(false);
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
  const [barcodeWidth, setBarcodeWidth] = useState(2);
  const [barcodeHeight, setBarcodeHeight] = useState(40);

  // Display toggles from template
  const [showCompanyName, setShowCompanyName] = useState(true);
  const [showItemName, setShowItemName] = useState(true);
  const [showItemCode, setShowItemCode] = useState(true);
  const [showSKU, setShowSKU] = useState(false);
  const [showBarcodeNumber, setShowBarcodeNumber] = useState(true);
  const [showBatchNumber, setShowBatchNumber] = useState(false);
  const [showSerialNumber, setShowSerialNumber] = useState(false);
  const [showMRP, setShowMRP] = useState(false);
  const [showSalePrice, setShowSalePrice] = useState(false);
  const [showMfgDate, setShowMfgDate] = useState(false);
  const [showExpiryDate, setShowExpiryDate] = useState(false);
  const [showUOM, setShowUOM] = useState(false);

  // Fetch templates and item details when dialog opens
  useEffect(() => {
    if (open) {
      fetchTemplates();
      if (isBin) {
        setPrintItemName('');
        setPrintItemCode(itemName); // bin locator code
        setPrintSKU('');
        setPrintBarcodeNumber(itemCode); // bin barcode
        setPrintBatchNumber('');
        setPrintSerialNumber('');
        setPrintMRP('');
        setPrintSalePrice('');
        setPrintMfgDate('');
        setPrintExpiryDate('');
        setPrintUOM('');
        // Adjust default visibility for bin
        setShowCompanyName(false);
        setShowItemName(false);
        setShowItemCode(true); // bin locator code
        setShowSKU(false);
        setShowBarcodeNumber(true); // bin barcode
        setShowBatchNumber(false);
        setShowSerialNumber(false);
        setShowMRP(false);
        setShowSalePrice(false);
        setShowMfgDate(false);
        setShowExpiryDate(false);
      } else {
        fetchItemDetails();
      }
      setNumLabels(defaultQty);
    }
  }, [open, itemCode, itemName, batchNumber, defaultQty, isBin]);

  // Sync customize variables with template selection
  useEffect(() => {
    if (selectedTemplate) {
      setPageSize(selectedTemplate.PageSize);
      setLabelWidth(selectedTemplate.LabelWidth);
      setLabelHeight(selectedTemplate.LabelHeight);
      setMarginLeft(selectedTemplate.MarginLeft);
      setMarginTop(selectedTemplate.MarginTop);
      setRowsPerPage(selectedTemplate.RowsPerPage);
      setColsPerPage(selectedTemplate.ColsPerPage);
      setGapX(selectedTemplate.GapX);
      setGapY(selectedTemplate.GapY);
      setOrientation(selectedTemplate.Orientation);
      setBarcodeType(selectedTemplate.BarcodeType);
      setBarcodePosition(selectedTemplate.BarcodePosition);
      setTextPosition(selectedTemplate.TextPosition);
      setFontSize(selectedTemplate.FontSize);
      setFontStyle(selectedTemplate.FontStyle);
      setAlignment(selectedTemplate.Alignment);

      if (isBin) {
        setShowCompanyName(false);
        setShowItemName(false);
        setShowItemCode(true);
        setShowSKU(false);
        setShowBarcodeNumber(true);
        setShowBatchNumber(false);
        setShowSerialNumber(false);
        setShowMRP(false);
        setShowSalePrice(false);
        setShowMfgDate(false);
        setShowExpiryDate(false);
      } else {
        setShowCompanyName(selectedTemplate.PrintCompanyName === 1);
        setShowItemName(selectedTemplate.PrintItemName === 1);
        setShowItemCode(selectedTemplate.PrintItemCode === 1);
        setShowSKU(selectedTemplate.PrintSKU === 1);
        setShowBarcodeNumber(selectedTemplate.PrintBarcodeNumber === 1);
        setShowBatchNumber(selectedTemplate.PrintBatchNumber === 1);
        setShowSerialNumber(selectedTemplate.PrintSerialNumber === 1);
        setShowMRP(selectedTemplate.PrintMRP === 1);
        setShowSalePrice(selectedTemplate.PrintSalePrice === 1);
        setShowMfgDate(selectedTemplate.PrintMfgDate === 1);
        setShowExpiryDate(selectedTemplate.PrintExpiryDate === 1);
      }
      setPrintCompanyName(selectedTemplate.CompanyName || 'BusyWMS Enterprise');
      
      let initialHeight = 15;
      if (selectedTemplate.LabelHeight > 40) initialHeight = 25;
      if (selectedTemplate.LabelHeight > 60) initialHeight = 40;
      setBarcodeHeight(initialHeight);
      setBarcodeWidth(2);
    }
  }, [selectedTemplate, isBin]);

  const fetchTemplates = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get('/barcode/templates');
      setTemplates(res.data);
      if (res.data.length > 0) {
        const def = res.data.find((t: any) => t.IsDefault === 1) || res.data[0];
        setSelectedTemplate(def);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to fetch barcode templates.');
    } finally {
      setLoading(false);
    }
  };

  const fetchItemDetails = async () => {
    setLoadingDetails(true);
    try {
      const res = await api.get(`/barcode/print-details?itemCode=${encodeURIComponent(itemCode)}&batchNumber=${encodeURIComponent(batchNumber)}`);
      const details = res.data;
      setPrintItemName(details.itemName || itemName);
      setPrintItemCode(details.itemCode || itemCode);
      setPrintSKU(details.sku || details.itemCode || itemCode);
      setPrintBarcodeNumber(details.barcodeNumber || details.itemCode || itemCode);
      setPrintBatchNumber(details.batchNumber || batchNumber || '');
      setPrintSerialNumber(details.serialNumber || '');
      setPrintMRP(details.mrp || '0.00');
      setPrintSalePrice(details.salePrice || '0.00');
      setPrintMfgDate(details.mfgDate || '');
      setPrintExpiryDate(details.expiryDate || '');
      setPrintUOM(details.uom || '');
    } catch (err) {
      console.error('Failed to load item details for printing', err);
      // Fallback to props
      setPrintItemName(itemName);
      setPrintItemCode(itemCode);
      setPrintSKU(itemCode);
      setPrintBarcodeNumber(itemCode);
      setPrintBatchNumber(batchNumber || '');
      setPrintSerialNumber('');
      setPrintMRP('0.00');
      setPrintSalePrice('0.00');
      setPrintMfgDate('');
      setPrintExpiryDate('');
      setPrintUOM('');
    } finally {
      setLoadingDetails(false);
    }
  };

  if (!open) return null;

  const handlePrintLabels = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Use customized settings if toggled, otherwise fall back to template settings
    const activeWidth = labelWidth;
    const activeHeight = labelHeight;
    const activeMarginLeft = marginLeft;
    const activeMarginTop = marginTop;
    const activeRows = rowsPerPage;
    const activeCols = colsPerPage;
    const activeGapX = gapX;
    const activeGapY = gapY;
    const activeOrientation = orientation;
    const activePageSize = pageSize;
    const activeBarcodeType = barcodeType;
    const activeFontSize = fontSize;
    const activeFontStyle = fontStyle;
    const activeAlignment = alignment;

    const renderLabelHtml = (serialIndex?: number) => {
      const barcodeVal = showSerialNumber && printSerialNumber 
        ? `${printSerialNumber}${serialIndex !== undefined ? `-${serialIndex + 1}` : ''}`
        : printBarcodeNumber;

      const itemsToPrint: string[] = [];

      if (showCompanyName && printCompanyName) {
        itemsToPrint.push(`<div class="company-header" style="font-size: ${activeFontSize - 2}px; font-weight: bold; text-transform: uppercase; margin-bottom: 2px;">${printCompanyName}</div>`);
      }
      
      const detailsHtml: string[] = [];
      if (showItemName && printItemName) {
        detailsHtml.push(`<div class="item-name" style="font-weight: ${activeFontStyle === 'bold' ? 'bold' : 'normal'}; font-style: ${activeFontStyle === 'italic' ? 'italic' : 'normal'}; margin-bottom: 1px;">${printItemName}</div>`);
      }
      if (showItemCode && printItemCode) {
        detailsHtml.push(`<div class="detail-row">${isBin ? 'Bin: ' : 'Code: '}${printItemCode}</div>`);
      }
      if (showSKU && printSKU) {
        detailsHtml.push(`<div class="detail-row">SKU: ${printSKU}</div>`);
      }
      if (showUOM && printUOM) {
        detailsHtml.push(`<div class="detail-row">Unit: ${printUOM}</div>`);
      }
      if (showBatchNumber && printBatchNumber) {
        detailsHtml.push(`<div class="detail-row">Batch: ${printBatchNumber}</div>`);
      }
      if (showSerialNumber && printSerialNumber) {
        detailsHtml.push(`<div class="detail-row">SN: ${printSerialNumber}${serialIndex !== undefined ? `-${serialIndex + 1}` : ''}</div>`);
      }
      if (showMRP && Number(printMRP) > 0) {
        detailsHtml.push(`<div class="detail-row">MRP: ₹${printMRP}</div>`);
      }
      if (showSalePrice && Number(printSalePrice) > 0) {
        detailsHtml.push(`<div class="detail-row" style="font-weight: bold;">Price: ₹${printSalePrice}</div>`);
      }
      if (showMfgDate && printMfgDate) {
        detailsHtml.push(`<div class="detail-row">Mfg: ${printMfgDate}</div>`);
      }
      if (showExpiryDate && printExpiryDate) {
        detailsHtml.push(`<div class="detail-row">Exp: ${printExpiryDate}</div>`);
      }

      const textSection = `<div class="fields-box">${detailsHtml.join('')}</div>`;

      // Symbology generation endpoint url
      const typeLower = activeBarcodeType.toLowerCase();
      const includeDigits = activeBarcodeType !== 'QRCODE' && showBarcodeNumber;
      
      const barcodeImgUrl = `/api/barcode/generate?text=${encodeURIComponent(barcodeVal)}&type=${typeLower}&scale=${barcodeWidth}&height=${barcodeHeight}&includetext=${includeDigits}`;

      const barcodeSection = `
        <div class="barcode-box" style="height: ${barcodeHeight}px; display: flex; justify-content: center; align-items: center; margin-top: 2px; margin-bottom: 2px;">
          <img src="${barcodeImgUrl}" style="max-height: 100%; max-width: 100%; object-fit: contain;" />
        </div>
      `;

      return `
        <div class="label-box">
          ${itemsToPrint.join('')}
          ${barcodePosition === 'TOP' ? barcodeSection + textSection : textSection + barcodeSection}
        </div>
      `;
    };

    let pagesHtml = '';

    if (activePageSize === 'CUSTOM') {
      // Thermal label rolls (Each label is a page)
      for (let i = 0; i < numLabels; i++) {
        pagesHtml += `
          <div class="thermal-label-page">
            ${renderLabelHtml(showSerialNumber && printSerialNumber ? i : undefined)}
          </div>
        `;
      }
    } else {
      // Sheet labels (A4 or Letter) formatted in rows x columns grid
      const labelsPerPage = activeRows * activeCols;
      const totalPages = Math.ceil(numLabels / labelsPerPage);

      for (let p = 0; p < totalPages; p++) {
        let gridCellsHtml = '';
        for (let l = 0; l < labelsPerPage; l++) {
          const labelIndex = p * labelsPerPage + l;
          if (labelIndex < numLabels) {
            gridCellsHtml += `
              <div class="grid-label-wrapper">
                ${renderLabelHtml(showSerialNumber && printSerialNumber ? labelIndex : undefined)}
              </div>
            `;
          }
        }

        pagesHtml += `
          <div class="grid-page-container">
            ${gridCellsHtml}
          </div>
        `;
      }
    }

    const pageOrientationCss = activePageSize === 'CUSTOM'
      ? `${activeWidth}mm ${activeHeight}mm`
      : `${activePageSize === 'A4' ? '210mm 297mm' : '8.5in 11in'} ${activeOrientation.toLowerCase()}`;

    const html = `
      <html>
        <head>
          <title>Print Barcode Labels</title>
          <style>
            @page {
              size: ${pageOrientationCss};
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: 'Arial', sans-serif;
              -webkit-print-color-adjust: exact;
              background-color: white;
            }
            * {
              box-sizing: border-box;
            }

            /* Thermal formatting */
            .thermal-label-page {
              width: ${activeWidth}mm;
              height: ${activeHeight}mm;
              padding-top: ${activeMarginTop}mm;
              padding-left: ${activeMarginLeft}mm;
              padding-right: ${activeMarginLeft}mm;
              padding-bottom: ${activeMarginTop}mm;
              page-break-after: always;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }

            /* Grid Layout formatting (A4 / Letter) */
            .grid-page-container {
              width: ${activePageSize === 'A4' ? '210mm' : '8.5in'};
              height: ${activePageSize === 'A4' ? '297mm' : '11in'};
              padding-top: ${activeMarginTop}mm;
              padding-left: ${activeMarginLeft}mm;
              padding-right: ${activeMarginLeft}mm;
              padding-bottom: ${activeMarginTop}mm;
              page-break-after: always;
              display: grid;
              grid-template-columns: repeat(${activeCols}, ${activeWidth}mm);
              grid-template-rows: repeat(${activeRows}, ${activeHeight}mm);
              grid-column-gap: ${activeGapX}mm;
              grid-row-gap: ${activeGapY}mm;
              align-content: start;
              justify-content: start;
              overflow: hidden;
            }

            .grid-label-wrapper {
              width: ${activeWidth}mm;
              height: ${activeHeight}mm;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              justify-content: center;
            }

            /* Core Label Styling */
            .label-box {
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              align-items: ${activeAlignment === 'center' ? 'center' : activeAlignment === 'left' ? 'flex-start' : 'flex-end'};
              text-align: ${activeAlignment};
              font-size: ${activeFontSize}px;
              line-height: 1.15;
            }

            .company-header {
              width: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .fields-box {
              width: 100%;
            }

            .item-name {
              width: 100%;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .detail-row {
              font-size: ${activeFontSize - 2}px;
              color: #333;
            }

            .barcode-box {
              width: 100%;
              display: flex;
              justify-content: center;
              align-items: center;
              margin-top: 2px;
              margin-bottom: 2px;
            }

            .barcode-box img {
              display: block;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Settings size={20} />
        Barcode Configuration & Printing
      </DialogTitle>

      <DialogContent dividers sx={{ maxHeight: '78vh' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            {/* Config & Tweak Panel */}
            <Grid item xs={12} md={7}>
              {errorMsg && <Alert severity="error" sx={{ mb: 2 }}>{errorMsg}</Alert>}
              
              <Typography variant="h5" fontWeight={600} sx={{ mb: 2 }}>Print Details & Templates</Typography>
              
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={8}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Barcode Template</InputLabel>
                    <Select
                      value={selectedTemplate ? selectedTemplate.TemplateId : ''}
                      label="Barcode Template"
                      onChange={(e) => {
                        const found = templates.find((t: any) => t.TemplateId === e.target.value);
                        if (found) setSelectedTemplate(found);
                      }}
                    >
                      {templates.map((t) => (
                        <MenuItem key={t.TemplateId} value={t.TemplateId}>
                          {t.Name} {t.IsDefault === 1 ? '(Default)' : ''} ({t.LabelWidth}x{t.LabelHeight}mm)
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} sm={4}>
                  <TextField 
                    label="Label Copies"
                    type="number"
                    size="small"
                    fullWidth
                    value={numLabels}
                    onChange={(e) => setNumLabels(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  />
                </Grid>
              </Grid>

              {/* Data Display - strictly static read-only database values */}
              <Accordion defaultExpanded variant="outlined" sx={{ mb: 2, borderRadius: 1 }}>
                <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                  <Typography variant="subtitle2" fontWeight={700}>1. Database Record Details (Read-Only)</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {loadingDetails ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>
                  ) : (
                    <Box>
                      <Alert severity="info" sx={{ mb: 2, py: 0.5 }}>
                        All data below is loaded directly from database records. Modify them in the Item/Batch Masters.
                      </Alert>
                      <Grid container spacing={1.5}>
                        <Grid item xs={12}>
                          <TextField 
                            label="Company Name Header" 
                            value={printCompanyName} 
                            onChange={(e) => setPrintCompanyName(e.target.value)}
                            size="small" 
                            fullWidth 
                            helperText="Derived from Barcode Template / Settings"
                            disabled={isBin}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField 
                            label={isBin ? "N/A" : "Item Name"} 
                            value={printItemName} 
                            size="small" 
                            fullWidth 
                            disabled 
                            helperText={isBin ? "Not applicable for Bins" : "Source: Item Master (Read-Only)"}
                          />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <TextField 
                            label={isBin ? "Bin Code (Locator)" : "Item Code"} 
                            value={printItemCode} 
                            size="small" 
                            fullWidth 
                            disabled 
                            helperText={isBin ? "Source: Bin Master (Read-Only)" : "Source: Item Master (Read-Only)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label="SKU" 
                            value={printSKU} 
                            size="small" 
                            fullWidth 
                            disabled 
                            helperText={isBin ? "Not applicable for Bins" : "Source: Item Master (Read-Only)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label={isBin ? "Bin Barcode" : "Barcode Number"} 
                            value={printBarcodeNumber} 
                            size="small" 
                            fullWidth 
                            disabled 
                            helperText={isBin ? "Source: Bin Master (Read-Only)" : "Source: Item Master (Read-Only)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label="Unit (UOM)" 
                            value={printUOM} 
                            size="small" 
                            fullWidth 
                            disabled 
                            helperText={isBin ? "Not applicable for Bins" : "Source: Item Master (Read-Only)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label="Batch No" 
                            value={printBatchNumber} 
                            onChange={(e) => setPrintBatchNumber(e.target.value)}
                            size="small" 
                            fullWidth 
                            disabled={isBin}
                            helperText={isBin ? "Not applicable for Bins" : "Source: Batch Master (Editable)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label="Serial No" 
                            value={printSerialNumber} 
                            onChange={(e) => setPrintSerialNumber(e.target.value)}
                            size="small" 
                            fullWidth 
                            disabled={isBin}
                            helperText={isBin ? "Not applicable for Bins" : "Source: Serial Number Master (Editable)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label="MRP (₹)" 
                            value={printMRP} 
                            onChange={(e) => setPrintMRP(e.target.value)}
                            size="small" 
                            fullWidth 
                            disabled={isBin}
                            helperText={isBin ? "Not applicable for Bins" : "Source: Item Master (Editable)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label="Sale Price (₹)" 
                            value={printSalePrice} 
                            onChange={(e) => setPrintSalePrice(e.target.value)}
                            size="small" 
                            fullWidth 
                            disabled={isBin}
                            helperText={isBin ? "Not applicable for Bins" : "Source: Item Master (Editable)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label="Mfg Date" 
                            value={printMfgDate} 
                            onChange={(e) => setPrintMfgDate(e.target.value)}
                            size="small" 
                            fullWidth 
                            disabled={isBin}
                            helperText={isBin ? "Not applicable for Bins" : "Source: Batch Master (Editable)"}
                          />
                        </Grid>
                        <Grid item xs={6} sm={4}>
                          <TextField 
                            label="Expiry Date" 
                            value={printExpiryDate} 
                            onChange={(e) => setPrintExpiryDate(e.target.value)}
                            size="small" 
                            fullWidth 
                            disabled={isBin}
                            helperText={isBin ? "Not applicable for Bins" : "Source: Batch Master (Editable)"}
                          />
                        </Grid>
                      </Grid>
                    </Box>
                  )}
                </AccordionDetails>
              </Accordion>

              {/* Layout settings tweak */}
              <Accordion variant="outlined" sx={{ mb: 2, borderRadius: 1 }}>
                <AccordionSummary expandIcon={<ChevronDown size={18} />}>
                  <Typography variant="subtitle2" fontWeight={700}>2. Adjust Printing Layout Options</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <FormControlLabel 
                    control={<Checkbox checked={customizeSettings} onChange={(e) => setCustomizeSettings(e.target.checked)} />} 
                    label="Override Default Template Settings" 
                    sx={{ mb: 2 }}
                  />

                  <Grid container spacing={2} sx={{ opacity: customizeSettings ? 1 : 0.6, pointerEvents: customizeSettings ? 'auto' : 'none' }}>
                    <Grid item xs={6} sm={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Page Format</InputLabel>
                        <Select value={pageSize} label="Page Format" onChange={(e) => setPageSize(e.target.value)}>
                          <MenuItem value="CUSTOM">Custom Roll / Thermal</MenuItem>
                          <MenuItem value="A4">A4 Sheet</MenuItem>
                          <MenuItem value="LETTER">Letter Sheet</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Orientation</InputLabel>
                        <Select value={orientation} label="Orientation" onChange={(e) => setOrientation(e.target.value)}>
                          <MenuItem value="PORTRAIT">Portrait</MenuItem>
                          <MenuItem value="LANDSCAPE">Landscape</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Symbology</InputLabel>
                        <Select value={barcodeType} label="Symbology" onChange={(e) => setBarcodeType(e.target.value)}>
                          <MenuItem value="CODE128">Code 128</MenuItem>
                          <MenuItem value="CODE39">Code 39</MenuItem>
                          <MenuItem value="EAN13">EAN-13</MenuItem>
                          <MenuItem value="EAN8">EAN-8</MenuItem>
                          <MenuItem value="UPC">UPC-A</MenuItem>
                          <MenuItem value="QRCODE">QR Code</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField label="Label Width (mm)" type="number" value={labelWidth} onChange={(e) => setLabelWidth(Number(e.target.value))} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField label="Label Height (mm)" type="number" value={labelHeight} onChange={(e) => setLabelHeight(Number(e.target.value))} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField label="Margin Left (mm)" type="number" value={marginLeft} onChange={(e) => setMarginLeft(Number(e.target.value))} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField label="Margin Top (mm)" type="number" value={marginTop} onChange={(e) => setMarginTop(Number(e.target.value))} size="small" fullWidth />
                    </Grid>

                    {pageSize !== 'CUSTOM' && (
                      <>
                        <Grid item xs={6} sm={3}>
                          <TextField label="Rows Per Page" type="number" value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} size="small" fullWidth />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <TextField label="Cols Per Page" type="number" value={colsPerPage} onChange={(e) => setColsPerPage(Number(e.target.value))} size="small" fullWidth />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <TextField label="Gap X (mm)" type="number" value={gapX} onChange={(e) => setGapX(Number(e.target.value))} size="small" fullWidth />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                          <TextField label="Gap Y (mm)" type="number" value={gapY} onChange={(e) => setGapY(Number(e.target.value))} size="small" fullWidth />
                        </Grid>
                      </>
                    )}

                    <Grid item xs={6} sm={3}>
                      <TextField label="Font Size (px)" type="number" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} size="small" fullWidth />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Font Weight</InputLabel>
                        <Select value={fontStyle} label="Font Weight" onChange={(e) => setFontStyle(e.target.value)}>
                          <MenuItem value="normal">Regular</MenuItem>
                          <MenuItem value="bold">Bold</MenuItem>
                          <MenuItem value="italic">Italic</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={3}>
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

                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ mb: 1 }}>VISIBILITY SETTINGS</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5 }}>
                    <FormControlLabel control={<Checkbox checked={showCompanyName} onChange={(e) => setShowCompanyName(e.target.checked)} disabled={isBin} />} label="Company" />
                    <FormControlLabel control={<Checkbox checked={showItemName} onChange={(e) => setShowItemName(e.target.checked)} disabled={isBin} />} label="Item Name" />
                    <FormControlLabel control={<Checkbox checked={showItemCode} onChange={(e) => setShowItemCode(e.target.checked)} />} label={isBin ? "Bin Code" : "Item Code"} />
                    <FormControlLabel control={<Checkbox checked={showSKU} onChange={(e) => setShowSKU(e.target.checked)} disabled={isBin} />} label="SKU" />
                    <FormControlLabel control={<Checkbox checked={showUOM} onChange={(e) => setShowUOM(e.target.checked)} disabled={isBin} />} label="Unit (UOM)" />
                    <FormControlLabel control={<Checkbox checked={showBarcodeNumber} onChange={(e) => setShowBarcodeNumber(e.target.checked)} />} label={isBin ? "Bin Barcode" : "Barcode Digits"} />
                    <FormControlLabel control={<Checkbox checked={showBatchNumber} onChange={(e) => setShowBatchNumber(e.target.checked)} disabled={isBin} />} label="Batch" />
                    <FormControlLabel control={<Checkbox checked={showSerialNumber} onChange={(e) => setShowSerialNumber(e.target.checked)} disabled={isBin} />} label="Serial No" />
                    <FormControlLabel control={<Checkbox checked={showMRP} onChange={(e) => setShowMRP(e.target.checked)} disabled={isBin} />} label="MRP Price" />
                    <FormControlLabel control={<Checkbox checked={showSalePrice} onChange={(e) => setShowSalePrice(e.target.checked)} disabled={isBin} />} label="Sale Price" />
                    <FormControlLabel control={<Checkbox checked={showMfgDate} onChange={(e) => setShowMfgDate(e.target.checked)} disabled={isBin} />} label="Mfg Date" />
                    <FormControlLabel control={<Checkbox checked={showExpiryDate} onChange={(e) => setShowExpiryDate(e.target.checked)} disabled={isBin} />} label="Expiry Date" />
                  </Box>
                </AccordionDetails>
              </Accordion>

              {/* Barcode Graphic Dimension controls */}
              <Paper variant="outlined" sx={{ p: 2, mt: 2, borderRadius: 1 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>3. Adjust Barcode Dimension (Width & Height)</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Typography variant="body2" color="text.primary">Barcode scale width ({barcodeWidth}x)</Typography>
                    <Slider
                      value={barcodeWidth}
                      min={1}
                      max={5}
                      step={0.5}
                      onChange={(e, val) => setBarcodeWidth(val as number)}
                      valueLabelDisplay="auto"
                    />
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.primary">Barcode bar height ({barcodeHeight}px)</Typography>
                    <Slider
                      value={barcodeHeight}
                      min={10}
                      max={120}
                      step={5}
                      onChange={(e, val) => setBarcodeHeight(val as number)}
                      valueLabelDisplay="auto"
                    />
                  </Box>
                </Box>
              </Paper>
            </Grid>

            {/* Real-time preview */}
            <Grid item xs={12} md={5} sx={{ display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h5" fontWeight={600} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Eye size={18} /> Live Label Preview
              </Typography>
              
              <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'action.hover', p: 3, borderRadius: 2, minHeight: 300 }}>
                <Paper 
                  variant="outlined"
                  sx={{ 
                    width: `${labelWidth * 4.5}px`,
                    height: `${labelHeight * 4.5}px`,
                    pt: `${marginTop * 4.5}px`,
                    pl: `${marginLeft * 4.5}px`,
                    pr: `${marginLeft * 4.5}px`,
                    pb: `${marginTop * 4.5}px`,
                    bgcolor: '#fff',
                    border: '1px solid #ccc',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: alignment === 'center' ? 'center' : alignment === 'left' ? 'flex-start' : 'flex-end',
                    textAlign: alignment,
                    overflow: 'hidden',
                    boxShadow: 3,
                    fontFamily: 'Arial',
                    fontSize: `${fontSize}px`,
                    lineHeight: 1.15,
                    color: '#000',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Box sx={{ width: '100%' }}>
                    {showCompanyName && printCompanyName && (
                      <Typography variant="caption" sx={{ fontSize: `${fontSize - 2}px`, fontWeight: 'bold', display: 'block', textTransform: 'uppercase', color: 'primary.main' }}>
                        {printCompanyName}
                      </Typography>
                    )}
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.1 }}>
                      {showItemName && printItemName && (
                        <Typography sx={{ fontSize: `${fontSize}px`, fontWeight: fontStyle === 'bold' ? 'bold' : 'normal', fontStyle: fontStyle === 'italic' ? 'italic' : 'normal', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {printItemName}
                        </Typography>
                      )}
                      {showItemCode && printItemCode && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>{isBin ? `Bin: ${printItemCode}` : `Code: ${printItemCode}`}</Typography>
                      )}
                      {showSKU && printSKU && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>SKU: {printSKU}</Typography>
                      )}
                      {showUOM && printUOM && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>Unit: {printUOM}</Typography>
                      )}
                      {showBatchNumber && printBatchNumber && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>Batch: {printBatchNumber}</Typography>
                      )}
                      {showSerialNumber && printSerialNumber && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>SN: {printSerialNumber}-1</Typography>
                      )}
                      {showMRP && Number(printMRP) > 0 && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>MRP: ₹{printMRP}</Typography>
                      )}
                      {showSalePrice && Number(printSalePrice) > 0 && (
                        <Typography sx={{ fontSize: `${fontSize - 1}px`, fontWeight: 'bold' }}>Price: ₹{printSalePrice}</Typography>
                      )}
                      {showMfgDate && printMfgDate && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>Mfg: {printMfgDate}</Typography>
                      )}
                      {showExpiryDate && printExpiryDate && (
                        <Typography sx={{ fontSize: `${fontSize - 2}px` }}>Exp: {printExpiryDate}</Typography>
                      )}
                    </Box>
                  </Box>

                  {/* Render simulated barcode preview via backend generation endpoint */}
                  <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center', my: 0.5, height: `${barcodeHeight}px`, maxHeight: '45%' }}>
                    {barcodeType === 'QRCODE' ? (
                      <img 
                        src={`/api/barcode/generate?text=${encodeURIComponent(printBarcodeNumber)}&type=qrcode&scale=${barcodeWidth}`} 
                        style={{ height: '100%', width: 'auto', objectFit: 'contain' }} 
                        alt="QR Code"
                      />
                    ) : (
                      <img 
                        src={`/api/barcode/generate?text=${encodeURIComponent(printBarcodeNumber)}&type=${barcodeType.toLowerCase()}&scale=${barcodeWidth}&height=${barcodeHeight}&includetext=${showBarcodeNumber ? 'true' : 'false'}`} 
                        style={{ height: '100%', maxWidth: '100%', objectFit: 'contain' }} 
                        alt="Barcode"
                      />
                    )}
                  </Box>
                </Paper>
              </Box>
            </Grid>
          </Grid>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button 
          variant="contained" 
          color="primary" 
          startIcon={<Printer size={16} />} 
          onClick={handlePrintLabels}
          disabled={loading || !selectedTemplate}
        >
          Print {numLabels} Labels
        </Button>
      </DialogActions>
    </Dialog>
  );
}
