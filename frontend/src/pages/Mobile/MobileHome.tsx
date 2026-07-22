import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, Card, CardContent, Typography, Grid, Button, IconButton, 
  TextField, Alert, Select, MenuItem, InputLabel, FormControl, Divider, 
  List, ListItem, ListItemText, InputAdornment, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, Tabs, Tab, CircularProgress, Badge
} from '@mui/material';
import { 
  Smartphone, Scan, ArrowLeft, Clipboard, MapPin, 
  Package, Truck, RefreshCcw, Check, Info, Camera, 
  Printer, ArrowRightLeft, Copy, Plus, Trash2, ShieldAlert, LogOut
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';

// Types for scanning
interface ScannedItem {
  ItemId: number;
  Code: string;
  Name: string;
  Barcode: string;
  UOM: string;
  TrackBatch: number;
  TrackSerial: number;
  Weight?: number;
  Volume?: number;
}

export default function MobileHome() {
  const { user, logout } = useAuthStore();
  const [screen, setScreen] = useState<'menu' | 'grn' | 'asn' | 'putaway' | 'pick' | 'pack' | 'dispatch' | 'count' | 'transfer' | 'print' | 'qc'>('menu');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  
  // QC States
  const [qcGRNs, setQcGRNs] = useState<any[]>([]);
  const [selectedQCGRN, setSelectedQCGRN] = useState<any>(null);
  const [qcDetails, setQcDetails] = useState<any[]>([]);
  const [qcRemarks, setQcRemarks] = useState('');
  const [qcAcceptedQtys, setQcAcceptedQtys] = useState<Record<number, number>>({});
  const [qcRejectedQtys, setQcRejectedQtys] = useState<Record<number, number>>({});
  const [qcReasons, setQcReasons] = useState<Record<number, string>>({});

  // Data lists fetched from backend
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [bins, setBins] = useState<any[]>([]);
  const [pos, setPOs] = useState<any[]>([]);
  const [pickLists, setPickLists] = useState<any[]>([]);
  const [cycleCounts, setCycleCounts] = useState<any[]>([]);
  const [pendingPutaways, setPendingPutaways] = useState<any[]>([]);
  const [inventoryList, setInventoryList] = useState<any[]>([]);

  // Focus lock for hardware scanners
  const hardwareInputRef = useRef<HTMLInputElement>(null);

  // Reusable Camera Scanner State
  const [activeCameraScan, setActiveCameraScan] = useState<{ field: string, onSuccess: (code: string) => void } | null>(null);
  const [scanCameraError, setScanCameraError] = useState('');
  const [scannerInstance, setScannerInstance] = useState<Html5Qrcode | null>(null);

  // Workflow states
  // GRN State
  const [grnSelectedPO, setGrnSelectedPO] = useState<any>(null);
  const [grnPOLines, setGrnPOLines] = useState<any[]>([]);
  const [grnScannedItems, setGrnScannedItems] = useState<any[]>([]);
  const [grnInvoiceNo, setGrnInvoiceNo] = useState('');
  const [grnScannedItem, setGrnScannedItem] = useState<any>(null);
  const [grnQty, setGrnQty] = useState(1);
  const [grnBatchNo, setGrnBatchNo] = useState('');
  const [grnExpiry, setGrnExpiry] = useState('');

  // Putaway State
  const [putawayLine, setPutawayLine] = useState<any>(null);
  const [putawaySuggestedBins, setPutawaySuggestedBins] = useState<any[]>([]);
  const [putawayTargetBin, setPutawayTargetBin] = useState<any>(null);
  const [putawayQty, setPutawayQty] = useState(0);

  // Pick State
  const [selectedPickList, setSelectedPickList] = useState<any>(null);
  const [pickDetails, setPickDetails] = useState<any[]>([]);
  const [pickScannedBin, setPickScannedBin] = useState<any>(null);
  const [pickScannedItem, setPickScannedItem] = useState<any>(null);
  const [pickQty, setPickQty] = useState(1);
  const [pickMatchedDetail, setPickMatchedDetail] = useState<any>(null);

  // Bin Transfer State
  const [transferSourceBin, setTransferSourceBin] = useState<any>(null);
  const [transferSourceStock, setTransferSourceStock] = useState<any[]>([]);
  const [transferItem, setTransferItem] = useState<any>(null);
  const [transferDestBin, setTransferDestBin] = useState<any>(null);
  const [transferQty, setTransferQty] = useState(1);

  // Cycle Count State
  const [selectedCC, setSelectedCC] = useState<any>(null);
  const [ccDetails, setCCDetails] = useState<any[]>([]);
  const [ccScannedBin, setCcScannedBin] = useState<any>(null);
  const [ccScannedItem, setCcScannedItem] = useState<any>(null);
  const [ccQty, setCcQty] = useState(1);
  const [ccMatchedDetail, setCcMatchedDetail] = useState<any>(null);

  // Packing State
  const [packPickList, setPackPickList] = useState<any>(null);
  const [cartonNo, setCartonNo] = useState('');
  const [packPalletNo, setPackPalletNo] = useState('');
  const [grossWeight, setGrossWeight] = useState('');
  const [packNotes, setPackNotes] = useState('');
  const [packItemCount, setPackItemCount] = useState(0);

  // Dispatch State
  const [sos, setSOs] = useState<any[]>([]);
  const [dispatchSelectedSO, setDispatchSelectedSO] = useState<any>(null);
  const [dispatchChallanNo, setDispatchChallanNo] = useState('');
  const [dispatchVehicleNo, setDispatchVehicleNo] = useState('');
  const [dispatchTransporter, setDispatchTransporter] = useState('');
  const [dispatchLrNumber, setDispatchLrNumber] = useState('');

  // ASN Receiving State
  const [asns, setAsns] = useState<any[]>([]);
  const [asnSelected, setAsnSelected] = useState<any>(null);
  const [asnLines, setAsnLines] = useState<any[]>([]);
  const [asnScannedItems, setAsnScannedItems] = useState<any[]>([]);
  const [asnInvoiceNo, setAsnInvoiceNo] = useState('');
  const [asnScannedItem, setAsnScannedItem] = useState<any>(null);
  const [asnQty, setAsnQty] = useState(1);
  const [asnBatchNo, setAsnBatchNo] = useState('');
  const [asnExpiry, setAsnExpiry] = useState('');
  const [asnSerial, setAsnSerial] = useState('');

  // Loading States
  const [loading, setLoading] = useState(false);

  // Load backend master lists
  const loadMasterData = async () => {
    try {
      setLoading(true);
      const results = await Promise.allSettled([
        api.get('/masters/items'),
        api.get('/masters/bins'),
        api.get('/inbound/pending-pos'),
        api.get('/outbound/pick-lists'),
        api.get('/inventory/cycle-counts'),
        api.get('/putaway/pending'),
        api.get('/inventory/stock'),
        api.get('/inbound/asn'),
        api.get('/outbound/sales-orders?limit=100'),
        api.get('/inbound/grns')
      ]);

      const getValue = (res: any) => res.status === 'fulfilled' ? res.value.data : null;

      setItems(getValue(results[0]) || []);
      setBins(getValue(results[1]) || []);
      setPOs(getValue(results[2]) || []);
      setPickLists(getValue(results[3]) || []);
      setCycleCounts((getValue(results[4]) || []).filter((c: any) => c.Status === 'PENDING' || c.Status === 'COUNTING'));
      setPendingPutaways(getValue(results[5]) || []);
      setInventoryList(getValue(results[6]) || []);
      setAsns((getValue(results[7]) || []).filter((a: any) => ['Confirmed', 'In Transit', 'Partially Received'].includes(a.Status)));
      
      const soData = getValue(results[8]);
      setSOs(soData ? (soData.items || soData || []) : []);

      const grnData = getValue(results[9]) || [];
      setQcGRNs(grnData.filter((g: any) => g.Status === 'PENDING'));
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error loading warehouse master tables.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMasterData();
  }, [screen]);

  const processScannedCodeRef = useRef<any>(null);
  useEffect(() => {
    processScannedCodeRef.current = processScannedCode;
  });

  // Handle hardware scanner trigger focusing
  useEffect(() => {
    if (screen === 'menu' || screen === 'print' || activeCameraScan) return;
    
    let barcodeString = '';
    let lastKeyTime = Date.now();
    let timeout: any = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing inside a regular input field
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        if (document.activeElement !== hardwareInputRef.current) return;
      }
      
      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 50) {
        barcodeString = ''; // Reset if typing is too slow
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (barcodeString.length > 0) {
          e.preventDefault();
          const code = barcodeString;
          barcodeString = '';
          if (processScannedCodeRef.current) {
            processScannedCodeRef.current(code);
          }
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeString += e.key;
      }

      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => { barcodeString = ''; }, 100);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeout) clearTimeout(timeout);
    };
  }, [screen, activeCameraScan]);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Reusable Camera QR/Barcode Scanning Handler
  const startCameraScan = async (field: string, onSuccess: (code: string) => void) => {
    setScanCameraError('');
    setActiveCameraScan({ field, onSuccess });
    
    setTimeout(async () => {
      try {
        const instance = new Html5Qrcode("camera-reader");
        setScannerInstance(instance);
        
        await instance.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 }
          },
          (decodedText) => {
            onSuccess(decodedText.trim());
            instance.stop().then(() => {
              setActiveCameraScan(null);
              setScannerInstance(null);
            }).catch(e => console.error("Error stopping scanner", e));
          },
          () => {} // silent error logging to avoid debug noise
        );
      } catch (err: any) {
        console.error("Camera access failed:", err);
        setScanCameraError("Cannot access back camera. Check browser permissions.");
      }
    }, 300);
  };

  const stopCameraScan = async () => {
    if (scannerInstance) {
      try {
        if (scannerInstance.isScanning) {
          await scannerInstance.stop();
        }
      } catch (e) {
        console.error(e);
      }
      setScannerInstance(null);
    }
    setActiveCameraScan(null);
  };

  // Process text scanner inputs (Keyboard emulation)
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;
    const value = barcodeInput.trim();
    setBarcodeInput('');
    processScannedCode(value);
  };

  const processScannedCode = (value: string) => {
    if (screen === 'grn') {
      handleGRNScan(value);
    } else if (screen === 'asn') {
      handleASNScan(value);
    } else if (screen === 'putaway') {
      handlePutawayScan(value);
    } else if (screen === 'pick') {
      handlePickScan(value);
    } else if (screen === 'transfer') {
      handleTransferScan(value);
    } else if (screen === 'count') {
      handleCycleCountScan(value);
    } else if (screen === 'pack') {
      handlePackScan(value);
    } else if (screen === 'dispatch') {
      handleDispatchScan(value);
    }
  };

  // 1. GRN SCAN LOGIC
  const selectASN = async (asn: any) => {
    try {
      setLoading(true);
      const res = await api.get(`/inbound/asn/${asn.ASNId}`);
      setAsnSelected(asn);
      setAsnLines(res.data.items);
      setAsnScannedItems([]);
      setAsnScannedItem(null);
      showFeedback('success', `Loaded Notice #${asn.ASNNumber}. Scan items.`);
    } catch (err: any) {
      showFeedback('error', 'Failed to load Advanced Shipment Notice detail lines.');
    } finally {
      setLoading(false);
    }
  };

  const handleASNScan = (code: string) => {
    if (!asnSelected) return;
    
    const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
    if (!matchedItem) {
      showFeedback('error', 'Item barcode not found in WMS catalogue.');
      return;
    }

    const expectedLine = asnLines.find(l => l.ItemId === matchedItem.ItemId);
    if (!expectedLine) {
      showFeedback('error', `Item '${matchedItem.Name}' is not expected in this shipment notice.`);
      return;
    }

    setAsnScannedItem(matchedItem);
    setAsnQty(1);
    
    if (matchedItem.TrackBatch === 1) {
      setAsnBatchNo(`BAT-${Date.now().toString().slice(-4)}`);
      setAsnExpiry('');
    } else {
      setAsnBatchNo('');
      setAsnExpiry('');
    }
    
    setAsnSerial('');
    showFeedback('success', `Item matched: ${matchedItem.Name}. Enter quantity.`);
  };

  const addASNScannedItem = () => {
    if (!asnScannedItem) return;
    const line = asnLines.find(l => l.ItemId === asnScannedItem.ItemId);
    const alreadyScanned = asnScannedItems
      .filter(i => i.itemId === asnScannedItem.ItemId)
      .reduce((sum, current) => sum + current.receivedQty, 0);
    const remainingExpected = line ? (line.ExpectedQty - line.ReceivedQty - alreadyScanned) : 0;

    if (asnQty <= 0 || asnQty > remainingExpected) {
      showFeedback('error', `Invalid quantity. Must be between 1 and ${remainingExpected}.`);
      return;
    }

    if (asnScannedItem.TrackBatch === 1 && !asnBatchNo) {
      showFeedback('error', 'Batch number is required for this item.');
      return;
    }

    if (asnScannedItem.TrackSerial === 1 && !asnSerial) {
      showFeedback('error', 'Serial number is required for this item.');
      return;
    }

    const newLine = {
      itemId: asnScannedItem.ItemId,
      code: asnScannedItem.Code,
      name: asnScannedItem.Name,
      receivedQty: asnQty,
      uom: asnScannedItem.UOM,
      batchNumber: asnBatchNo || null,
      expiryDate: asnExpiry || null,
      serialNumber: asnSerial || null
    };

    setAsnScannedItems(prev => [...prev, newLine]);
    setAsnScannedItem(null);
    setAsnQty(1);
    setAsnBatchNo('');
    setAsnExpiry('');
    setAsnSerial('');

    showFeedback('success', `${asnScannedItem.Name} added to receiving list.`);
  };

  const submitASNReceipt = async () => {
    if (!asnSelected || asnScannedItems.length === 0) return;
    try {
      setLoading(true);
      const payload = {
        invoiceNo: asnInvoiceNo || `INV-ASN-${Date.now().toString().slice(-6)}`,
        items: asnScannedItems.map(item => ({
          itemId: item.itemId,
          receivedQty: item.receivedQty,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          serialNumber: item.serialNumber
        }))
      };

      const res = await api.post(`/inbound/asn/${asnSelected.ASNId}/receive`, payload);
      showFeedback('success', `ASN receipt recorded. Generated GRN: ${res.data.grnCode}`);
      resetASNWorkflow();
      setScreen('menu');
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to submit ASN receipt.');
    } finally {
      setLoading(false);
    }
  };

  const resetASNWorkflow = () => {
    setAsnSelected(null);
    setAsnLines([]);
    setAsnScannedItems([]);
    setAsnInvoiceNo('');
    setAsnScannedItem(null);
    setAsnQty(1);
    setAsnBatchNo('');
    setAsnExpiry('');
    setAsnSerial('');
  };

  const selectPO = async (po: any) => {
    try {
      setLoading(true);
      const res = await api.get(`/inbound/po-details/${po.POId}`);
      setGrnSelectedPO(po);
      setGrnPOLines(res.data);
      setGrnScannedItems([]);
      setGrnInvoiceNo(`INV-M-${Date.now().toString().slice(-4)}`);
      showFeedback('success', `PO ${po.POCode} loaded. Ready to scan items.`);
    } catch (err) {
      showFeedback('error', 'Failed to retrieve PO details.');
    } finally {
      setLoading(false);
    }
  };

  const handleGRNScan = (code: string) => {
    if (!grnSelectedPO) {
      showFeedback('error', 'Please select a Purchase Order first.');
      return;
    }
    // Match item in items list first to get ItemId
    const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
    if (!matchedItem) {
      showFeedback('error', `Barcode '${code}' not found in Items list.`);
      return;
    }

    // Verify if item is in the PO detail lines
    const poLine = grnPOLines.find(l => l.ItemId === matchedItem.ItemId);
    if (!poLine) {
      showFeedback('error', `Item '${matchedItem.Name}' is not part of PO ${grnSelectedPO.POCode}.`);
      return;
    }

    // Check if already fully received
    const alreadyScanned = grnScannedItems.find(i => i.itemId === matchedItem.ItemId);
    const currentlyScannedQty = alreadyScanned ? alreadyScanned.receivedQty : 0;
    const expected = poLine.OrderQty - poLine.ReceivedQty;
    if (currentlyScannedQty >= expected) {
      showFeedback('error', `Limit reached. Expected pending qty for this item is ${expected}.`);
      return;
    }

    setGrnScannedItem(matchedItem);
    setGrnQty(1);
    setGrnBatchNo(matchedItem.TrackBatch ? `BAT-M-${Date.now().toString().slice(-4)}` : '');
    setGrnExpiry(matchedItem.TrackBatch ? new Date(Date.now() + 365*24*60*60*1000).toISOString().slice(0, 10) : '');
    showFeedback('success', `Scanned: ${matchedItem.Name}`);
  };

  const addGRNScannedItem = () => {
    if (!grnScannedItem) return;
    
    // Check if batch is required
    if (grnScannedItem.TrackBatch && !grnBatchNo) {
      showFeedback('error', 'Batch number is required for this item.');
      return;
    }

    const updated = [...grnScannedItems];
    const index = updated.findIndex(i => i.itemId === grnScannedItem.ItemId);
    
    if (index > -1) {
      updated[index].receivedQty += grnQty;
    } else {
      updated.push({
        itemId: grnScannedItem.ItemId,
        code: grnScannedItem.Code,
        name: grnScannedItem.Name,
        receivedQty: grnQty,
        trackBatch: grnScannedItem.TrackBatch === 1,
        batchNumber: grnBatchNo || undefined,
        expiryDate: grnExpiry || undefined
      });
    }

    setGrnScannedItems(updated);
    setGrnScannedItem(null);
    showFeedback('success', 'Added to scanned receipts list.');
  };

  const submitGRN = async () => {
    if (grnScannedItems.length === 0) {
      showFeedback('error', 'No items scanned.');
      return;
    }
    if (!grnInvoiceNo || grnInvoiceNo.trim() === '') {
      showFeedback('error', 'Supplier Invoice Number is required.');
      return;
    }
    try {
      setLoading(true);
      await api.post('/inbound/grn', {
        poId: grnSelectedPO.POId,
        invoiceNo: grnInvoiceNo,
        items: grnScannedItems
      });
      showFeedback('success', 'Goods Receipt Note saved and synced successfully.');
      setGrnSelectedPO(null);
      setGrnScannedItems([]);
      setScreen('menu');
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to submit GRN.');
    } finally {
      setLoading(false);
    }
  };

  // 2. PUTAWAY LOGIC
  const handlePutawayScan = async (code: string) => {
    if (!putawayLine) {
      // 1. Scanning Item
      const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
      if (!matchedItem) {
        showFeedback('error', 'Scanned barcode does not match any item.');
        return;
      }
      
      const matchedPutaway = pendingPutaways.find(p => p.ItemId === matchedItem.ItemId);
      if (!matchedPutaway) {
        showFeedback('error', `Item '${matchedItem.Name}' has no pending putaway queue.`);
        return;
      }

      setPutawayLine(matchedPutaway);
      setPutawayQty(matchedPutaway.PendingPutawayQty);
      
      // Fetch suggested slotting
      try {
        const suggest = await api.post('/putaway/suggest', {
          itemId: matchedPutaway.ItemId,
          quantity: matchedPutaway.PendingPutawayQty,
          warehouseId: user?.warehouseId
        });
        setPutawaySuggestedBins(suggest.data || []);
      } catch (err) {
        console.error(err);
      }
      
      showFeedback('success', `Item Identified: ${matchedItem.Name}. Now scan Target Bin.`);
    } else {
      // 2. Scanning Destination Bin
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Bin location barcode.');
        return;
      }
      setPutawayTargetBin(matchedBin);
      showFeedback('success', `Target Bin Location: ${matchedBin.Code}`);
    }
  };

  const confirmPutaway = async () => {
    if (!putawayLine || !putawayTargetBin) return;
    if (putawayQty <= 0 || putawayQty > putawayLine.PendingPutawayQty) {
      showFeedback('error', `Invalid putaway quantity. Must be between 1 and ${putawayLine.PendingPutawayQty}.`);
      return;
    }
    try {
      setLoading(true);
      const res = await api.post('/putaway/execute', {
        grnDetailId: putawayLine.GRNDetailId,
        binId: putawayTargetBin.BinId,
        quantity: putawayQty
      });
      showFeedback('success', 'Putaway slotting committed successfully.');
      setPutawayLine(null);
      setPutawayTargetBin(null);
      setPutawayQty(0);
      setPutawaySuggestedBins([]);
      
      // Reload pending putaways
      const putRes = await api.get('/putaway/pending');
      setPendingPutaways(putRes.data);
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to confirm putaway.');
    } finally {
      setLoading(false);
    }
  };

  // 3. PICKING LOGIC
  const selectPickList = async (list: any) => {
    try {
      setLoading(true);
      const res = await api.get(`/outbound/pick-list/${list.PickListId}`);
      setSelectedPickList(list);
      setPickDetails(res.data);
      setPickScannedBin(null);
      setPickScannedItem(null);
      showFeedback('success', `Pick List ${list.PickCode} loaded.`);
    } catch (err) {
      showFeedback('error', 'Failed to retrieve Pick List details.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickScan = (code: string) => {
    if (!selectedPickList) {
      showFeedback('error', 'Please select a Pick List first.');
      return;
    }

    if (!pickScannedBin) {
      // Step 1: Scan Bin Barcode
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Bin location barcode.');
        return;
      }
      
      // Verify if bin belongs to this pick list
      const binInList = pickDetails.some(d => d.BinId === matchedBin.BinId && d.Status === 'PENDING');
      if (!binInList) {
        showFeedback('error', `Bin ${matchedBin.Code} is not listed in active pick details.`);
        return;
      }

      setPickScannedBin(matchedBin);
      showFeedback('success', `Bin verified. Now scan expected item barcode inside ${matchedBin.Code}.`);
    } else {
      // Step 2: Scan Item Barcode
      const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
      if (!matchedItem) {
        showFeedback('error', 'Item barcode not found.');
        return;
      }

      // Check if item is expected in this scanned bin for this pick list
      const matchedLines = pickDetails.filter(
        d => d.BinId === pickScannedBin.BinId && d.ItemId === matchedItem.ItemId && d.Status === 'PENDING'
      );

      if (matchedLines.length === 0) {
        showFeedback('error', `Item '${matchedItem.Name}' is not expected in Bin ${pickScannedBin.Code}.`);
        return;
      }

      const matchedLine = matchedLines[0];
      setPickScannedItem(matchedItem);
      setPickMatchedDetail(matchedLine);
      setPickQty(matchedLine.Quantity - matchedLine.PickedQty);
      showFeedback('success', matchedLines.length > 1
        ? `Item confirmed. Multiple batches found; please select the correct batch below.`
        : `Item confirmed. Input quantity.`
      );
    }
  };

  const confirmPicking = async () => {
    if (!selectedPickList || !pickMatchedDetail) return;
    const maxQty = pickMatchedDetail.Quantity - pickMatchedDetail.PickedQty;
    if (pickQty <= 0 || pickQty > maxQty) {
      showFeedback('error', `Invalid pick quantity. Must be between 1 and ${maxQty}.`);
      return;
    }
    try {
      setLoading(true);
      await api.post('/outbound/pick-confirm', {
        pickListId: selectedPickList.PickListId,
        items: [{
          pickDetailId: pickMatchedDetail.PickDetailId,
          pickedQty: pickQty
        }]
      });
      showFeedback('success', 'Picking scan recorded successfully.');
      
      // Refresh pick list lines
      const res = await api.get(`/outbound/pick-list/${selectedPickList.PickListId}`);
      setPickDetails(res.data);
      
      // Reset scanning steps
      setPickScannedBin(null);
      setPickScannedItem(null);
      setPickMatchedDetail(null);
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to record pick.');
    } finally {
      setLoading(false);
    }
  };

  // 4. STOCK TRANSFER (BIN-TO-BIN) LOGIC
  const handleTransferScan = (code: string) => {
    if (!transferSourceBin) {
      // Step 1: Scan Source Bin
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Source Bin barcode.');
        return;
      }
      
      // Filter inventory to check if bin contains items
      const stock = inventoryList.filter(i => i.BinId === matchedBin.BinId && i.AvailableQty > 0);
      if (stock.length === 0) {
        showFeedback('error', `Bin ${matchedBin.Code} has no available stock.`);
        return;
      }

      setTransferSourceBin(matchedBin);
      setTransferSourceStock(stock);
      showFeedback('success', `Source Bin Set: ${matchedBin.Code}. Scan Item barcode.`);
    } 
    else if (!transferItem) {
      // Step 2: Scan Item
      const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
      if (!matchedItem) {
        showFeedback('error', 'Item barcode not found.');
        return;
      }

      const matchedRows = transferSourceStock.filter(i => i.ItemId === matchedItem.ItemId);
      if (matchedRows.length === 0) {
        showFeedback('error', `Item '${matchedItem.Name}' is not stored in Bin ${transferSourceBin.Code}.`);
        return;
      }

      const invRow = matchedRows[0];
      setTransferItem(invRow);
      setTransferQty(invRow.AvailableQty);
      showFeedback('success', matchedRows.length > 1
        ? `Item identified. Multiple batches found; select the batch below, then scan Destination Bin.`
        : `Item identified. Now scan Destination Bin.`
      );
    }
    else {
      // Step 3: Scan Destination Bin
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Destination Bin barcode.');
        return;
      }

      if (matchedBin.BinId === transferSourceBin.BinId) {
        showFeedback('error', 'Source and Destination bins must be different.');
        return;
      }

      setTransferDestBin(matchedBin);
      showFeedback('success', `Destination Bin Set: ${matchedBin.Code}. Confirm to commit.`);
    }
  };

  const confirmTransfer = async () => {
    if (!transferSourceBin || !transferItem || !transferDestBin) return;
    if (transferQty <= 0 || transferQty > transferItem.AvailableQty) {
      showFeedback('error', `Invalid transfer quantity. Must be between 1 and ${transferItem.AvailableQty}.`);
      return;
    }
    try {
      setLoading(true);
      await api.post('/inventory/transfer', {
        fromBinId: transferSourceBin.BinId,
        toBinId: transferDestBin.BinId,
        itemId: transferItem.ItemId,
        batchId: transferItem.BatchId || null,
        quantity: transferQty
      });
      showFeedback('success', `Transferred ${transferQty} ${transferItem.ItemUOM} successfully.`);
      setTransferSourceBin(null);
      setTransferSourceStock([]);
      setTransferItem(null);
      setTransferDestBin(null);
      setTransferQty(1);
      
      // Reload inventory
      const invRes = await api.get('/inventory/stock');
      setInventoryList(invRes.data);
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Transfer failed.');
    } finally {
      setLoading(false);
    }
  };

  // 5. CYCLE COUNT LOGIC
  const selectCC = async (cc: any) => {
    try {
      setLoading(true);
      const res = await api.get(`/inventory/cycle-count/${cc.CycleCountId}`);
      setSelectedCC(cc);
      setCCDetails(res.data);
      setCcScannedBin(null);
      setCcScannedItem(null);
      showFeedback('success', `Cycle Count ${cc.CountCode} loaded.`);
    } catch (err) {
      showFeedback('error', 'Failed to retrieve Cycle Count details.');
    } finally {
      setLoading(false);
    }
  };

  const handleCycleCountScan = (code: string) => {
    if (!selectedCC) {
      showFeedback('error', 'Please select a Cycle Count run first.');
      return;
    }

    if (!ccScannedBin) {
      // Step 1: Scan Bin Barcode
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Bin location barcode.');
        return;
      }

      const binInCC = ccDetails.some(d => d.BinId === matchedBin.BinId && d.Status === 'PENDING');
      if (!binInCC) {
        showFeedback('error', `Bin ${matchedBin.Code} is not listed in this cycle count.`);
        return;
      }

      setCcScannedBin(matchedBin);
      showFeedback('success', `Bin set: ${matchedBin.Code}. Scan Item barcode.`);
    } else {
      // Step 2: Scan Item Barcode
      const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
      if (!matchedItem) {
        showFeedback('error', 'Item barcode not found.');
        return;
      }

      const matchedLines = ccDetails.filter(
        d => d.BinId === ccScannedBin.BinId && d.ItemId === matchedItem.ItemId && d.Status === 'PENDING'
      );

      if (matchedLines.length === 0) {
        showFeedback('error', `Item '${matchedItem.Name}' is not expected in Bin ${ccScannedBin.Code}.`);
        return;
      }

      const matchedLine = matchedLines[0];
      setCcScannedItem(matchedItem);
      setCcMatchedDetail(matchedLine);
      setCcQty(0);
      showFeedback('success', matchedLines.length > 1
        ? `Item confirmed. Multiple batches found; select batch below and enter physical count.`
        : `Item confirmed. Input physical count.`
      );
    }
  };

  const confirmCCLine = async () => {
    if (!selectedCC || !ccMatchedDetail) return;
    try {
      setLoading(true);
      await api.post('/inventory/cycle-count/record', {
        cycleCountId: selectedCC.CycleCountId,
        items: [{
          countDetailId: ccMatchedDetail.CountDetailId,
          countedQty: ccQty,
          notes: 'Scanned via Mobile Terminal'
        }]
      });
      showFeedback('success', 'Count recorded successfully.');
      
      // Refresh details
      const res = await api.get(`/inventory/cycle-count/${selectedCC.CycleCountId}`);
      setCCDetails(res.data);

      setCcScannedBin(null);
      setCcScannedItem(null);
      setCcMatchedDetail(null);
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to record count.');
    } finally {
      setLoading(false);
    }
  };

  // 6. PACK LOGIC
  const selectPackList = async (list: any) => {
    setPackPickList(list);
    setCartonNo(`CRT-${Date.now().toString().slice(-4)}`);
    showFeedback('success', `Pack List ${list.PickCode} loaded.`);
  };

  const handlePackScan = (code: string) => {
    if (!packPickList) {
      const matched = pickLists.find(p => p.PickCode === code && p.Status === 'COMPLETED');
      if (matched) {
        selectPackList(matched);
      } else {
        showFeedback('error', 'Invalid or pending Pick List barcode.');
      }
    } else {
      showFeedback('success', 'Scanned packing info.');
    }
  };

  const submitPack = async () => {
    if (!packPickList) return;
    try {
      setLoading(true);
      await api.post('/outbound/pack', {
        pickListId: packPickList.PickListId,
        cartonNo,
        palletNo: packPalletNo,
        grossWeight: Number(grossWeight) || 0,
        itemCount: packItemCount,
        notes: packNotes
      });
      showFeedback('success', 'Packing completed successfully.');
      setPackPickList(null);
      
      const res = await api.get('/outbound/pick-lists');
      setPickLists(res.data);
      setScreen('menu');
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to submit packing.');
    } finally {
      setLoading(false);
    }
  };

  // 7. DISPATCH LOGIC
  const selectDispatchSO = async (so: any) => {
    setDispatchSelectedSO(so);
    setDispatchChallanNo(`CHAL-${so.SOCode}-${Date.now().toString().slice(-4)}`);
    showFeedback('success', `SO ${so.SOCode} loaded for dispatch.`);
  };

  const handleDispatchScan = (code: string) => {
    if (!dispatchSelectedSO) {
      const matched = sos.find(s => s.SOCode === code && s.Status === 'PACKED');
      if (matched) {
        selectDispatchSO(matched);
      } else {
        showFeedback('error', 'Invalid or non-packed Sales Order barcode.');
      }
    }
  };

  const submitDispatch = async () => {
    if (!dispatchSelectedSO || !dispatchChallanNo) {
      showFeedback('error', 'Challan Number is required.');
      return;
    }
    try {
      setLoading(true);
      await api.post('/outbound/dispatch', {
        soId: dispatchSelectedSO.SOId,
        deliveryChallanNo: dispatchChallanNo,
        vehicleNo: dispatchVehicleNo,
        transporterName: dispatchTransporter,
        lrNumber: dispatchLrNumber
      });
      showFeedback('success', 'Dispatch recorded successfully.');
      setDispatchSelectedSO(null);
      
      const res = await api.get('/outbound/sales-orders?limit=100');
      setSOs(res.data.items || res.data || []);
      setScreen('menu');
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to dispatch.');
    } finally {
      setLoading(false);
    }
  };

  // QC Handlers
  const selectQCGRN = async (grn: any) => {
    try {
      setLoading(true);
      const res = await api.get(`/inbound/grn-details/${grn.GRNId}`);
      setSelectedQCGRN(grn);
      setQcDetails(res.data);
      setQcRemarks('');
      
      const acc: Record<number, number> = {};
      const rej: Record<number, number> = {};
      const reas: Record<number, string> = {};

      res.data.forEach((item: any) => {
        const totalQty = item.ReceivedQty || 0;
        acc[item.ItemId] = totalQty;
        rej[item.ItemId] = 0;
        reas[item.ItemId] = '';
      });

      setQcAcceptedQtys(acc);
      setQcRejectedQtys(rej);
      setQcReasons(reas);
      showFeedback('success', `Loaded GRN ${grn.GRNCode}. Perform inspection.`);
    } catch (err) {
      showFeedback('error', 'Failed to retrieve GRN details.');
    } finally {
      setLoading(false);
    }
  };

  const submitQC = async () => {
    if (!selectedQCGRN || qcDetails.length === 0) return;
    try {
      setLoading(true);
      const itemsPayload = qcDetails.map(item => {
        const acceptedQty = qcAcceptedQtys[item.ItemId] || 0;
        const rejectedQty = qcRejectedQtys[item.ItemId] || 0;
        return {
          itemId: item.ItemId,
          acceptedQty,
          rejectedQty,
          rejectionReason: qcReasons[item.ItemId] || null
        };
      });

      const payload = {
        grnId: selectedQCGRN.GRNId,
        status: 'APPROVED',
        remarks: qcRemarks,
        items: itemsPayload
      };

      await api.post('/inbound/qc', payload);
      showFeedback('success', `Quality inspection logged successfully for ${selectedQCGRN.GRNCode}.`);
      setSelectedQCGRN(null);
      setQcDetails([]);
      setScreen('menu');
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to submit QC.');
    } finally {
      setLoading(false);
    }
  };

  // Helper reset functions
  const resetWorkflow = () => {
    setGrnSelectedPO(null);
    setGrnScannedItems([]);
    setGrnScannedItem(null);
    
    setPutawayLine(null);
    setPutawayTargetBin(null);
    setPutawaySuggestedBins([]);
    
    setSelectedPickList(null);
    setPickScannedBin(null);
    setPickScannedItem(null);
    setPickMatchedDetail(null);
    
    setTransferSourceBin(null);
    setTransferItem(null);
    setTransferDestBin(null);

    setSelectedCC(null);
    setCcScannedBin(null);
    setCcScannedItem(null);
    setCcMatchedDetail(null);
    resetASNWorkflow();

    setPackPickList(null);
    setDispatchSelectedSO(null);
    setSelectedQCGRN(null);
    setQcDetails([]);
    setQcRemarks('');
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
      {/* Handheld Device Emulator Container */}
      <Card sx={{ 
        width: 440, 
        height: 750, 
        bgcolor: '#0f172a', 
        borderRadius: 6, 
        boxShadow: 24, 
        p: 2, 
        border: '10px solid #334155',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        
        {/* Zebra Screen Top Speaker & Sensor Bar */}
        <Box sx={{ width: '60%', height: 18, bgcolor: '#334155', mx: 'auto', borderRadius: '0 0 10px 10px', mb: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Box sx={{ width: 45, height: 4, bgcolor: '#1e293b', borderRadius: 2 }} />
        </Box>

        {/* Operating System Window */}
        <Box sx={{ 
          flexGrow: 1, 
          bgcolor: '#f8fafc', 
          borderRadius: 4, 
          color: '#0f172a',
          p: 2,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}>
          
          {/* Mobile Screen Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, borderBottom: '1px solid #e2e8f0', pb: 1 }}>
            {screen !== 'menu' && (
              <IconButton size="small" onClick={() => { setScreen('menu'); resetWorkflow(); }}>
                <ArrowLeft size={18} />
              </IconButton>
            )}
            <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 14 }}>
              <Smartphone size={16} /> Zebra TC21 WMS
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Chip label="PRINT" size="small" variant="outlined" color="primary" onClick={() => setScreen('print')} sx={{ fontSize: 9, height: 18, cursor: 'pointer' }} />
              <Chip label="WH-01" size="small" color="primary" sx={{ fontSize: 9, height: 18, fontWeight: 700 }} />
              <IconButton size="small" color="error" onClick={() => logout()} title="Logout" sx={{ ml: 0.5 }}>
                <LogOut size={16} />
              </IconButton>
            </Box>
          </Box>

          {/* Feedback Alerts */}
          {feedback && (
            <Alert severity={feedback.type} sx={{ py: 0.5, px: 1, mb: 1.5, fontSize: 11, fontWeight: 600 }}>
              {feedback.msg}
            </Alert>
          )}

          {/* Hidden Keyboard listener text box for Hardware Gun triggers */}
          {screen !== 'menu' && screen !== 'print' && !activeCameraScan && (
            <Box component="form" onSubmit={handleBarcodeSubmit} sx={{ position: 'absolute', opacity: 0, zIndex: -1 }}>
              <input 
                ref={hardwareInputRef}
                type="text" 
                value={barcodeInput} 
                onChange={(e) => setBarcodeInput(e.target.value)} 
              />
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: MENU                                         */}
          {/* ==================================================== */}
          {screen === 'menu' && (() => {
            const roleName = user?.role || 'Admin';
            const isSuperUser = ['Admin', 'Warehouse Manager', 'Supervisor'].includes(roleName);
            const showGRN = isSuperUser || roleName === 'GRN Operator';
            const showASN = isSuperUser || roleName === 'GRN Operator';
            const showPutaway = isSuperUser || roleName === 'GRN Operator';
            const showPick = isSuperUser || roleName === 'Picker';
            const showPack = isSuperUser || roleName === 'Packer';
            const showDispatch = isSuperUser || roleName === 'Dispatcher';
            const showCount = isSuperUser || roleName === 'Auditor';
            const showTransfer = isSuperUser || roleName === 'Picker';
            const showQC = isSuperUser || roleName === 'QC Operator';

            return (
              <Box sx={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h5" align="center" sx={{ fontWeight: 800, mb: 1, fontSize: 16 }}>Operator Terminal</Typography>
                <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
                  Role: <strong>{roleName}</strong> ({user?.fullName || 'User'})
                </Typography>

                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  {showGRN && (
                    <Grid item xs={6}>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => setScreen('grn')}
                        sx={{ flexDirection: 'column', py: 2.5, gap: 1, borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, borderRadius: 2 }}
                      >
                        <Scan size={26} color="#1a73e8" />
                        <Typography variant="h6" sx={{ fontSize: 11, fontWeight: 700, color: 'text.primary' }}>GRN Scan</Typography>
                      </Button>
                    </Grid>
                  )}
                  {showASN && (
                    <Grid item xs={6}>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => setScreen('asn')}
                        sx={{ flexDirection: 'column', py: 2.5, gap: 1, borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, borderRadius: 2 }}
                      >
                        <Truck size={26} color="#0d9488" />
                        <Typography variant="h6" sx={{ fontSize: 11, fontWeight: 700, color: 'text.primary' }}>ASN Inbound</Typography>
                      </Button>
                    </Grid>
                  )}
                  {showPutaway && (
                    <Grid item xs={6}>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => setScreen('putaway')}
                        sx={{ flexDirection: 'column', py: 2.5, gap: 1, borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, borderRadius: 2 }}
                      >
                        <MapPin size={26} color="#a855f7" />
                        <Typography variant="h6" sx={{ fontSize: 11, fontWeight: 700, color: 'text.primary' }}>Putaway Scan</Typography>
                      </Button>
                    </Grid>
                  )}
                  {showPick && (
                    <Grid item xs={6}>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => setScreen('pick')}
                        sx={{ flexDirection: 'column', py: 2.5, gap: 1, borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, borderRadius: 2 }}
                      >
                        <Clipboard size={26} color="#f97316" />
                        <Typography variant="h6" sx={{ fontSize: 11, fontWeight: 700, color: 'text.primary' }}>Pick Scan</Typography>
                      </Button>
                    </Grid>
                  )}
                  {showPack && (
                    <Grid item xs={6}>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => setScreen('pack')}
                        sx={{ flexDirection: 'column', py: 2.5, gap: 1, borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, borderRadius: 2 }}
                      >
                        <Package size={26} color="#ec4899" />
                        <Typography variant="h6" sx={{ fontSize: 11, fontWeight: 700, color: 'text.primary' }}>Pack Scan</Typography>
                      </Button>
                    </Grid>
                  )}
                  {showDispatch && (
                    <Grid item xs={6}>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => setScreen('dispatch')}
                        sx={{ flexDirection: 'column', py: 2.5, gap: 1, borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, borderRadius: 2 }}
                      >
                        <Truck size={26} color="#10b981" />
                        <Typography variant="h6" sx={{ fontSize: 11, fontWeight: 700, color: 'text.primary' }}>Dispatch Scan</Typography>
                      </Button>
                    </Grid>
                  )}
                  {showCount && (
                    <Grid item xs={6}>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => setScreen('count')}
                        sx={{ flexDirection: 'column', py: 2.5, gap: 1, borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, borderRadius: 2 }}
                      >
                        <RefreshCcw size={26} color="#64748b" />
                        <Typography variant="h6" sx={{ fontSize: 11, fontWeight: 700, color: 'text.primary' }}>Cycle Count</Typography>
                      </Button>
                    </Grid>
                  )}
                  {showQC && (
                    <Grid item xs={6}>
                      <Button 
                        fullWidth 
                        variant="outlined" 
                        onClick={() => setScreen('qc')}
                        sx={{ flexDirection: 'column', py: 2.5, gap: 1, borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f1f5f9' }, borderRadius: 2 }}
                      >
                        <Check size={26} color="#059669" />
                        <Typography variant="h6" sx={{ fontSize: 11, fontWeight: 700, color: 'text.primary' }}>QC Scan</Typography>
                      </Button>
                    </Grid>
                  )}
                </Grid>

                {/* Extra Inventory Transfer Actions */}
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  {showTransfer && (
                    <Button 
                      size="small" 
                      variant="outlined" 
                      fullWidth 
                      startIcon={<ArrowRightLeft size={14} />} 
                      onClick={() => setScreen('transfer')}
                      sx={{ textTransform: 'none', fontWeight: 700, fontSize: 11 }}
                    >
                      Bin Stock Transfer
                    </Button>
                  )}
                  <Button 
                    size="small" 
                    variant="outlined" 
                    fullWidth 
                    startIcon={<Printer size={14} />} 
                    onClick={() => setScreen('print')}
                    sx={{ textTransform: 'none', fontWeight: 700, fontSize: 11 }}
                  >
                    Barcodes Cheat Sheet
                  </Button>
                </Box>

                {loading ? (
                  <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                ) : (
                  <Box sx={{ mt: 'auto', p: 1.5, bgcolor: '#f1f5f9', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Info size={12} color="#1a73e8" /> System Status
                    </Typography>
                    {showGRN && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        • Pending GRN Arrivals: <strong>{pos.length} POs</strong>
                      </Typography>
                    )}
                    {showASN && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        • Expected ASNs: <strong>{asns.length} shipments</strong>
                      </Typography>
                    )}
                    {showPutaway && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        • Pending Putaway Slots: <strong>{pendingPutaways.length} lines</strong>
                      </Typography>
                    )}
                    {showPick && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        • Active Picking Lists: <strong>{pickLists.length} lists</strong>
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            );
          })()}

          {/* ==================================================== */}
          {/* SCREEN: GRN SCAN WORKFLOW                            */}
          {/* ==================================================== */}
          {screen === 'grn' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {!grnSelectedPO ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Select PO to Inward:</Typography>
                  {pos.length === 0 ? (
                    <Alert severity="info" sx={{ py: 0 }}>No pending POs waiting for receipt.</Alert>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {pos.map(po => (
                        <ListItem key={po.POId} disablePadding sx={{ mb: 1 }}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => selectPO(po)}
                            sx={{ justifyContent: 'space-between', textTransform: 'none', py: 1, color: 'text.primary', borderColor: '#cbd5e1' }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={700}>{po.POCode}</Typography>
                              <Typography variant="caption" color="text.secondary">{po.VendorName}</Typography>
                            </Box>
                            <Chip label="Inward" size="small" color="primary" />
                          </Button>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ p: 1, bgcolor: '#eff6ff', borderRadius: 1.5, border: '1px solid #bfdbfe' }}>
                    <Typography variant="caption" display="block" color="text.secondary">Active PO Details</Typography>
                    <Typography variant="body2" fontWeight={700}>{grnSelectedPO.POCode} ({grnSelectedPO.VendorName})</Typography>
                  </Box>

                  {/* Manual / Camera Trigger buttons */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      label="Scan Item Code/Barcode"
                      size="small"
                      fullWidth
                      placeholder="Or enter barcode manually"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => { if(e.key === 'Enter') { handleGRNScan(barcodeInput); setBarcodeInput(''); } }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => startCameraScan('item', handleGRNScan)}>
                              <Camera size={16} />
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Box>

                  {grnScannedItem && (
                    <Card variant="outlined" sx={{ p: 1.5, bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                      <Typography variant="subtitle2" fontWeight={700}>{grnScannedItem.Name}</Typography>
                      <Typography variant="caption" color="text.secondary">Code: {grnScannedItem.Code} | UOM: {grnScannedItem.UOM}</Typography>
                      
                      <Grid container spacing={1} sx={{ mt: 1.5 }}>
                        <Grid item xs={grnScannedItem.TrackBatch ? 4 : 12}>
                          <TextField
                            label="Qty"
                            type="number"
                            size="small"
                            fullWidth
                            value={grnQty}
                            onChange={(e) => setGrnQty(Number(e.target.value || '1'))}
                          />
                        </Grid>
                        {grnScannedItem.TrackBatch === 1 && (
                          <>
                            <Grid item xs={4}>
                              <TextField
                                label="Batch"
                                size="small"
                                fullWidth
                                value={grnBatchNo}
                                onChange={(e) => setGrnBatchNo(e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={4}>
                              <TextField
                                label="Expiry"
                                type="date"
                                size="small"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={grnExpiry}
                                onChange={(e) => setGrnExpiry(e.target.value)}
                              />
                            </Grid>
                          </>
                        )}
                      </Grid>

                      <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                        <Button size="small" variant="outlined" color="error" fullWidth onClick={() => setGrnScannedItem(null)}>Cancel</Button>
                        <Button size="small" variant="contained" color="success" fullWidth onClick={addGRNScannedItem}>Add Item</Button>
                      </Box>
                    </Card>
                  )}

                  {grnScannedItems.length > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.5, display: 'block' }}>Items to Receive ({grnScannedItems.length})</Typography>
                      <List sx={{ p: 0, maxHeight: 160, overflowY: 'auto' }}>
                        {grnScannedItems.map((item, idx) => (
                          <ListItem key={idx} secondaryAction={
                            <IconButton edge="end" size="small" color="error" onClick={() => setGrnScannedItems(prev => prev.filter((_, i) => i !== idx))}>
                              <Trash2 size={14} />
                            </IconButton>
                          } sx={{ py: 0.5, px: 1, border: '1px solid #e2e8f0', borderRadius: 1, mb: 0.5 }}>
                            <ListItemText 
                              primary={`${item.name} x ${item.receivedQty}`} 
                              secondary={item.batchNumber ? `Batch: ${item.batchNumber}` : undefined}
                              primaryTypographyProps={{ fontSize: 12, fontWeight: 600 }}
                              secondaryTypographyProps={{ fontSize: 10 }}
                            />
                          </ListItem>
                        ))}
                      </List>

                      <TextField
                        label="Supplier Invoice Number"
                        required
                        error={!grnInvoiceNo}
                        size="small"
                        fullWidth
                        sx={{ mt: 1.5, mb: 1 }}
                        value={grnInvoiceNo}
                        onChange={(e) => setGrnInvoiceNo(e.target.value)}
                      />

                      <Button 
                        fullWidth 
                        variant="contained" 
                        color="primary"
                        onClick={submitGRN}
                      >
                        Confirm Receipt (Post GRN)
                      </Button>
                    </Box>
                  )}

                  {!grnScannedItem && grnScannedItems.length === 0 && (
                    <Box sx={{ border: '1px dashed #cbd5e1', py: 4, borderRadius: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary">
                        Scan item barcodes (e.g. <code>ITM-001</code>) to add arrivals.
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: ASN SCAN WORKFLOW                            */}
          {/* ==================================================== */}
          {screen === 'asn' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              {!asnSelected ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5, fontSize: 12 }}>Select ASN to Receive:</Typography>
                  {asns.length === 0 ? (
                    <Alert severity="info" sx={{ py: 0, fontSize: 10 }}>No pending ASNs scheduled.</Alert>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {asns.map(asn => (
                        <ListItem key={asn.ASNId} disablePadding sx={{ mb: 1 }}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => selectASN(asn)}
                            sx={{ justifyContent: 'space-between', textTransform: 'none', py: 1, color: 'text.primary', borderColor: '#cbd5e1' }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={700} sx={{ fontSize: 11 }}>{asn.ASNNumber}</Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{asn.SupplierName}</Typography>
                              <Typography variant="caption" display="block" sx={{ fontSize: 8, mt: 0.5 }}>
                                Arrival: {new Date(asn.ExpectedArrivalDate).toLocaleDateString()}
                              </Typography>
                            </Box>
                            <Chip label="Receive" size="small" color="primary" sx={{ fontSize: 9, height: 18 }} />
                          </Button>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                  <Box sx={{ p: 1, bgcolor: '#e6fffa', borderRadius: 1.5, border: '1px solid #b2f5ea' }}>
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: 9 }}>Active ASN Details</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ fontSize: 11 }}>{asnSelected.ASNNumber} ({asnSelected.SupplierName})</Typography>
                  </Box>

                  {/* Manual / Camera Trigger buttons */}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                      label="Scan Item Barcode"
                      size="small"
                      fullWidth
                      placeholder="e.g. ITM-001"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => { if(e.key === 'Enter') { handleASNScan(barcodeInput); setBarcodeInput(''); } }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={() => startCameraScan('item', handleASNScan)}>
                              <Camera size={14} />
                            </IconButton>
                          </InputAdornment>
                        )
                      }}
                    />
                  </Box>

                  {asnScannedItem && (
                    <Card variant="outlined" sx={{ p: 1, bgcolor: '#f0fdf4', borderColor: '#bbf7d0', boxShadow: 'none' }}>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: 11 }}>{asnScannedItem.Name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>Code: {asnScannedItem.Code} | UOM: {asnScannedItem.UOM}</Typography>
                      
                      {(() => {
                        const line = asnLines.find(l => l.ItemId === asnScannedItem.ItemId);
                        const alreadyScanned = asnScannedItems
                          .filter(i => i.itemId === asnScannedItem.ItemId)
                          .reduce((sum, current) => sum + current.receivedQty, 0);

                        return line ? (
                          <Box sx={{ mt: 0.5, p: 0.5, bgcolor: '#eff6ff', borderRadius: 1, border: '1px solid #bfdbfe' }}>
                            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: 8.5 }}>
                              Expected: <strong>{line.ExpectedQty}</strong> | Recvd: <strong>{line.ReceivedQty}</strong> | Scanned: <strong>{alreadyScanned}</strong>
                            </Typography>
                          </Box>
                        ) : null;
                      })()}

                      <Grid container spacing={1} sx={{ mt: 1 }}>
                        <Grid item xs={asnScannedItem.TrackBatch || asnScannedItem.TrackSerial ? 4 : 12}>
                          <TextField
                            label="Qty"
                            type="number"
                            size="small"
                            fullWidth
                            value={asnQty}
                            onChange={(e) => setAsnQty(Number(e.target.value || '1'))}
                          />
                        </Grid>
                        {asnScannedItem.TrackBatch === 1 && (
                          <>
                            <Grid item xs={4}>
                              <TextField
                                label="Batch"
                                size="small"
                                fullWidth
                                value={asnBatchNo}
                                onChange={(e) => setAsnBatchNo(e.target.value)}
                              />
                            </Grid>
                            <Grid item xs={4}>
                              <TextField
                                label="Expiry"
                                type="date"
                                size="small"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={asnExpiry}
                                onChange={(e) => setAsnExpiry(e.target.value)}
                              />
                            </Grid>
                          </>
                        )}
                        {asnScannedItem.TrackSerial === 1 && (
                          <Grid item xs={8}>
                            <TextField
                                label="Serial"
                                size="small"
                                fullWidth
                                placeholder="Scan serial barcode"
                                value={asnSerial}
                                onChange={(e) => setAsnSerial(e.target.value)}
                              />
                          </Grid>
                        )}
                      </Grid>

                      <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                        <Button size="small" variant="outlined" color="error" fullWidth onClick={() => setAsnScannedItem(null)} sx={{ fontSize: 10, py: 0.25 }}>Cancel</Button>
                        <Button size="small" variant="contained" color="success" fullWidth onClick={addASNScannedItem} sx={{ fontSize: 10, py: 0.25 }}>Add</Button>
                      </Box>
                    </Card>
                  )}

                  {asnScannedItems.length > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.5, display: 'block', fontSize: 10 }}>Scanned Arrivals ({asnScannedItems.length})</Typography>
                      <List sx={{ p: 0, maxHeight: 110, overflowY: 'auto' }}>
                        {asnScannedItems.map((item, idx) => (
                          <ListItem key={idx} secondaryAction={
                            <IconButton edge="end" size="small" color="error" onClick={() => setAsnScannedItems(prev => prev.filter((_, i) => i !== idx))}>
                              <Trash2 size={12} />
                            </IconButton>
                          } sx={{ py: 0.25, px: 0.5, border: '1px solid #e2e8f0', borderRadius: 1, mb: 0.5 }}>
                            <ListItemText 
                              primary={`${item.name} x ${item.receivedQty}`} 
                              secondary={
                                <>
                                  {item.batchNumber && <span style={{ marginRight: '6px' }}>B: {item.batchNumber}</span>}
                                  {item.serialNumber && <span>S: {item.serialNumber}</span>}
                                </>
                              }
                              primaryTypographyProps={{ fontSize: 10, fontWeight: 600 }}
                              secondaryTypographyProps={{ fontSize: 8 }}
                            />
                          </ListItem>
                        ))}
                      </List>

                      <TextField
                        label="Transporter LR/Inv"
                        size="small"
                        fullWidth
                        placeholder="Invoice / LR Ref Number"
                        sx={{ mt: 1, mb: 1 }}
                        value={asnInvoiceNo}
                        onChange={(e) => setAsnInvoiceNo(e.target.value)}
                      />

                      <Button 
                        fullWidth 
                        variant="contained" 
                        color="success"
                        onClick={submitASNReceipt}
                        sx={{ py: 0.75, fontSize: 11, bgcolor: '#0d9488', '&:hover': { bgcolor: '#0f766e' } }}
                      >
                        Confirm Receipt (Post GRN)
                      </Button>
                    </Box>
                  )}

                  {!asnScannedItem && asnScannedItems.length === 0 && (
                    <Box sx={{ border: '1px dashed #cbd5e1', py: 4, borderRadius: 2, textAlign: 'center' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9.5 }}>
                        Scan item barcodes (e.g. <code>ITM-001</code>) to add arrivals.
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: PUTAWAY SUGGEST WORKFLOW                     */}
          {/* ==================================================== */}
          {screen === 'putaway' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 1.5 }}>
              {!putawayLine ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Pending Putaways Queue:</Typography>
                  {pendingPutaways.length === 0 ? (
                    <Alert severity="success" sx={{ py: 0 }}>All received goods are fully slotted!</Alert>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {pendingPutaways.map(p => (
                        <ListItem key={p.GRNDetailId} disablePadding sx={{ mb: 1 }}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => {
                              setPutawayLine(p);
                              setPutawayQty(p.PendingPutawayQty);
                              api.post('/putaway/suggest', { 
                                itemId: p.ItemId, 
                                quantity: p.PendingPutawayQty,
                                warehouseId: user?.warehouseId
                              })
                                .then(res => setPutawaySuggestedBins(res.data || []));
                            }}
                            sx={{ justifyContent: 'space-between', textTransform: 'none', py: 1, color: 'text.primary', borderColor: '#cbd5e1' }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={700}>{p.ItemName} ({p.ItemCode})</Typography>
                              <Typography variant="caption" color="text.secondary">GRN: {p.GRNCode} | Qty: {p.PendingPutawayQty}</Typography>
                            </Box>
                            <Chip label="Slot" size="small" color="secondary" />
                          </Button>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ p: 1, bgcolor: '#faf5ff', borderRadius: 1.5, border: '1px solid #e9d5ff' }}>
                    <Typography variant="caption" color="text.secondary">Pending Item Sloting</Typography>
                    <Typography variant="body2" fontWeight={700}>{putawayLine.ItemName} ({putawayLine.ItemCode})</Typography>
                    <Typography variant="caption">Total Pending Qty: <strong>{putawayLine.PendingPutawayQty}</strong></Typography>
                  </Box>

                  <TextField
                    label="Putaway Quantity"
                    type="number"
                    size="small"
                    value={putawayQty}
                    onChange={(e) => setPutawayQty(Number(e.target.value || '1'))}
                  />

                  {putawaySuggestedBins.length > 0 && (() => {
                    const matchedItem = items.find(itm => itm.ItemId === putawayLine.ItemId);
                    const itemWeight = matchedItem ? (matchedItem.Weight || 2.0) : 2.0;
                    const itemVolume = matchedItem ? (matchedItem.Volume || 1.5) : 1.5;
                    const weightProposed = putawayQty * itemWeight;
                    const volumeProposed = putawayQty * itemVolume;
                    const bin = putawaySuggestedBins[0];
                    const remainingWeight = Math.max(0, bin.AvailableWeight - weightProposed);
                    const remainingVolume = Math.max(0, bin.AvailableVolume - volumeProposed);
                    
                    return (
                      <Box sx={{ p: 1, bgcolor: '#fef3c7', borderRadius: 1.5, border: '1px solid #fde68a' }}>
                        <Typography variant="caption" fontWeight={700} color="orange" display="block">Suggested Bin Location:</Typography>
                        <Typography variant="body2" fontWeight={700}>{bin.Code} ({bin.ShelfName || 'Shelf'})</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Current Available: {bin.AvailableWeight}kg / {bin.AvailableVolume}L
                        </Typography>
                        <Typography variant="caption" fontWeight={700} color="primary" display="block">
                          Projected Remaining: {remainingWeight.toFixed(3)}kg / {remainingVolume.toFixed(3)}L
                        </Typography>
                      </Box>
                    );
                  })()}

                  <TextField
                    label="Scan Target Bin Barcode"
                    size="small"
                    fullWidth
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') { handlePutawayScan(barcodeInput); setBarcodeInput(''); } }}
                    placeholder="Scan destination bin code"
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => startCameraScan('bin', handlePutawayScan)}>
                            <Camera size={16} />
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />

                  {putawayTargetBin && (
                    <Box sx={{ p: 1, bgcolor: '#d1fae5', borderRadius: 1.5, border: '1px solid #a7f3d0' }}>
                      <Typography variant="caption" color="green" fontWeight={700} display="block">Scanned Destination Bin:</Typography>
                      <Typography variant="body2" fontWeight={700}>{putawayTargetBin.Code}</Typography>
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" color="error" fullWidth onClick={() => { setPutawayLine(null); setPutawayTargetBin(null); }}>Cancel</Button>
                    <Button variant="contained" color="success" disabled={!putawayTargetBin} fullWidth onClick={confirmPutaway}>Confirm Putaway</Button>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: PICK LIST WORKFLOW                           */}
          {/* ==================================================== */}
          {screen === 'pick' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 1.5 }}>
              {!selectedPickList ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Select Pick List to execute:</Typography>
                  {pickLists.length === 0 ? (
                    <Alert severity="success" sx={{ py: 0 }}>All Pick Lists are completed!</Alert>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {pickLists.map(p => (
                        <ListItem key={p.PickListId} disablePadding sx={{ mb: 1 }}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => selectPickList(p)}
                            sx={{ justifyContent: 'space-between', textTransform: 'none', py: 1, color: 'text.primary', borderColor: '#cbd5e1' }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={700}>{p.PickCode}</Typography>
                              <Typography variant="caption" color="text.secondary">Order: {p.SOCode} | Assignee: {p.AssigneeName || 'Unassigned'}</Typography>
                            </Box>
                            <Chip label="Pick" size="small" color="warning" />
                          </Button>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ p: 1, bgcolor: '#fff7ed', borderRadius: 1.5, border: '1px solid #ffedd5' }}>
                    <Typography variant="caption" color="text.secondary">Active Pick List</Typography>
                    <Typography variant="body2" fontWeight={700}>{selectedPickList.PickCode} ({selectedPickList.SOCode})</Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.5, display: 'block' }}>Pick Allocations:</Typography>
                    <List sx={{ p: 0, maxHeight: 150, overflowY: 'auto' }}>
                      {pickDetails.map(pd => (
                        <ListItem key={pd.PickDetailId} sx={{ 
                          py: 0.5, px: 1, 
                          border: '1px solid #e2e8f0', 
                          borderRadius: 1.5, mb: 0.5,
                          bgcolor: pd.Status === 'COMPLETED' ? '#f0fdf4' : '#fff'
                        }}>
                          <ListItemText 
                            primary={`${pd.ItemName} (${pd.ItemCode})`} 
                            secondary={`Bin: ${pd.BinCode} ${pd.BatchNumber ? `| Batch: ${pd.BatchNumber}` : ''} | Expected: ${pd.Quantity} | Picked: ${pd.PickedQty}`}
                            primaryTypographyProps={{ fontSize: 11, fontWeight: 700 }}
                            secondaryTypographyProps={{ fontSize: 9 }}
                          />
                          {pd.Status === 'COMPLETED' && <Chip label="Done" size="small" color="success" sx={{ fontSize: 8, height: 16 }} />}
                        </ListItem>
                      ))}
                    </List>
                  </Box>

                  <Divider />

                  <TextField
                    label={!pickScannedBin ? "1. Scan Source Bin Barcode" : "2. Scan Item Barcode"}
                    size="small"
                    fullWidth
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') { handlePickScan(barcodeInput); setBarcodeInput(''); } }}
                    placeholder={!pickScannedBin ? "Scan bin code" : "Scan item barcode"}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => startCameraScan('pick', handlePickScan)}>
                            <Camera size={16} />
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />

                  {pickScannedBin && (
                    <Box sx={{ p: 1, bgcolor: '#eff6ff', borderRadius: 1.5, border: '1px solid #bfdbfe' }}>
                      <Typography variant="caption" color="primary" fontWeight={700}>Scanned Bin Locator:</Typography>
                      <Typography variant="body2" fontWeight={700}>{pickScannedBin.Code}</Typography>
                    </Box>
                  )}

                  {pickScannedItem && (
                    <Box sx={{ p: 1, bgcolor: '#f0fdf4', borderRadius: 1.5, border: '1px solid #bbf7d0' }}>
                      <Typography variant="caption" color="green" fontWeight={700}>Scanned Item Verified:</Typography>
                      <Typography variant="body2" fontWeight={700}>{pickScannedItem.Name}</Typography>

                      {pickDetails.filter(d => d.BinId === pickScannedBin.BinId && d.ItemId === pickScannedItem.ItemId && d.Status === 'PENDING').length > 1 && (
                        <FormControl fullWidth size="small" sx={{ mt: 1.5, bgcolor: '#fff' }}>
                          <InputLabel>Select Batch to Pick</InputLabel>
                          <Select
                            value={pickMatchedDetail ? pickMatchedDetail.PickDetailId : ''}
                            label="Select Batch to Pick"
                            onChange={(e) => {
                              const line = pickDetails.find(d => d.PickDetailId === e.target.value);
                              setPickMatchedDetail(line);
                              setPickQty(line.Quantity - line.PickedQty);
                            }}
                          >
                            {pickDetails.filter(d => d.BinId === pickScannedBin.BinId && d.ItemId === pickScannedItem.ItemId && d.Status === 'PENDING').map(d => (
                              <MenuItem key={d.PickDetailId} value={d.PickDetailId}>
                                Batch: {d.BatchNumber || 'Standard'} (Pending: {d.Quantity - d.PickedQty})
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}

                      <TextField
                        label="Pick Quantity"
                        type="number"
                        size="small"
                        sx={{ mt: 1.5, bgcolor: '#fff' }}
                        value={pickQty}
                        onChange={(e) => setPickQty(Number(e.target.value || '1'))}
                      />
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" color="error" fullWidth onClick={() => { setSelectedPickList(null); setPickScannedBin(null); setPickScannedItem(null); }}>Back</Button>
                    <Button variant="contained" color="success" disabled={!pickScannedItem} fullWidth onClick={confirmPicking}>Confirm Pick</Button>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: BIN-TO-BIN STOCK TRANSFER                    */}
          {/* ==================================================== */}
          {screen === 'transfer' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>Bin-to-Bin Stock Transfer</Typography>

              <TextField
                label={
                  !transferSourceBin ? "1. Scan Source Bin Barcode" :
                  !transferItem ? "2. Scan Item Barcode" :
                  "3. Scan Destination Bin Barcode"
                }
                size="small"
                fullWidth
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => { if(e.key === 'Enter') { handleTransferScan(barcodeInput); setBarcodeInput(''); } }}
                placeholder="Scan locator code"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => startCameraScan('transfer', handleTransferScan)}>
                        <Camera size={16} />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />

              {transferSourceBin && (
                <Box sx={{ p: 1, bgcolor: '#eff6ff', borderRadius: 1.5, border: '1px solid #bfdbfe' }}>
                  <Typography variant="caption" color="primary" fontWeight={700}>From Bin Location:</Typography>
                  <Typography variant="body2" fontWeight={700}>{transferSourceBin.Code}</Typography>
                </Box>
              )}

               {transferItem && (
                <Box sx={{ p: 1, bgcolor: '#faf5ff', borderRadius: 1.5, border: '1px solid #e9d5ff' }}>
                  <Typography variant="caption" color="purple" fontWeight={700}>Item to Transfer:</Typography>
                  <Typography variant="body2" fontWeight={700}>{transferItem.ItemName}</Typography>

                  {transferSourceStock.filter(i => i.ItemId === transferItem.ItemId).length > 1 && (
                    <FormControl fullWidth size="small" sx={{ mt: 1.5, bgcolor: '#fff' }}>
                      <InputLabel>Select Batch to Transfer</InputLabel>
                      <Select
                        value={transferItem.InventoryId}
                        label="Select Batch to Transfer"
                        onChange={(e) => {
                          const stockRow = transferSourceStock.find(i => i.InventoryId === e.target.value);
                          setTransferItem(stockRow);
                          setTransferQty(stockRow.AvailableQty);
                        }}
                      >
                        {transferSourceStock.filter(i => i.ItemId === transferItem.ItemId).map(i => (
                          <MenuItem key={i.InventoryId} value={i.InventoryId}>
                            Batch: {i.BatchNumber || 'Standard'} (Available: {i.AvailableQty})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}

                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>Available Stock: <strong>{transferItem.AvailableQty} UOM</strong></Typography>
                  <TextField
                    label="Transfer Quantity"
                    type="number"
                    size="small"
                    sx={{ mt: 1.5, bgcolor: '#fff' }}
                    value={transferQty}
                    onChange={(e) => setTransferQty(Number(e.target.value || '1'))}
                  />
                </Box>
              )}

              {transferDestBin && (
                <Box sx={{ p: 1, bgcolor: '#d1fae5', borderRadius: 1.5, border: '1px solid #a7f3d0' }}>
                  <Typography variant="caption" color="green" fontWeight={700}>To Destination Bin Location:</Typography>
                  <Typography variant="body2" fontWeight={700}>{transferDestBin.Code}</Typography>
                </Box>
              )}

              <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
                <Button variant="outlined" color="error" fullWidth onClick={() => { resetWorkflow(); }}>Reset</Button>
                <Button variant="contained" color="primary" disabled={!transferDestBin} fullWidth onClick={confirmTransfer}>Execute Transfer</Button>
              </Box>
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: CYCLE COUNT WORKFLOW                         */}
          {/* ==================================================== */}
          {screen === 'count' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 1.5 }}>
              {!selectedCC ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Select Cycle Count audit run:</Typography>
                  {cycleCounts.length === 0 ? (
                    <Alert severity="success" sx={{ py: 0 }}>No cycle count tasks active.</Alert>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {cycleCounts.map(cc => (
                        <ListItem key={cc.CycleCountId} disablePadding sx={{ mb: 1 }}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => selectCC(cc)}
                            sx={{ justifyContent: 'space-between', textTransform: 'none', py: 1, color: 'text.primary', borderColor: '#cbd5e1' }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={700}>{cc.CountCode}</Typography>
                              <Typography variant="caption" color="text.secondary">Warehouse: {cc.WarehouseName} | Type: {cc.CountType}</Typography>
                            </Box>
                            <Chip label="Audit" size="small" color="primary" />
                          </Button>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ p: 1, bgcolor: '#f1f5f9', borderRadius: 1.5, border: '1px solid #cbd5e1' }}>
                    <Typography variant="caption" color="text.secondary">Active Cycle Count Audit</Typography>
                    <Typography variant="body2" fontWeight={700}>{selectedCC.CountCode}</Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, mb: 0.5, display: 'block' }}>Expected Audits:</Typography>
                    <List sx={{ p: 0, maxHeight: 150, overflowY: 'auto' }}>
                      {ccDetails.map(ccd => (
                        <ListItem key={ccd.CountDetailId} sx={{ 
                          py: 0.5, px: 1, 
                          border: '1px solid #e2e8f0', 
                          borderRadius: 1.5, mb: 0.5,
                          bgcolor: ccd.Status === 'COMPLETED' ? '#f0fdf4' : '#fff'
                        }}>
                          <ListItemText 
                            primary={`${ccd.ItemName} (${ccd.ItemCode})`} 
                            secondary={`Bin: ${ccd.BinCode} ${ccd.BatchNumber ? `| Batch: ${ccd.BatchNumber}` : ''} | Counted: ${ccd.CountedQty ?? 'PENDING'}`}
                            primaryTypographyProps={{ fontSize: 11, fontWeight: 700 }}
                            secondaryTypographyProps={{ fontSize: 9 }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>

                  <Divider />

                  <TextField
                    label={!ccScannedBin ? "1. Scan Bin Location" : "2. Scan Item Barcode"}
                    size="small"
                    fullWidth
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') { handleCycleCountScan(barcodeInput); setBarcodeInput(''); } }}
                    placeholder={!ccScannedBin ? "Scan bin code" : "Scan item barcode"}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => startCameraScan('count', handleCycleCountScan)}>
                            <Camera size={16} />
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />

                  {ccScannedBin && (
                    <Box sx={{ p: 1, bgcolor: '#eff6ff', borderRadius: 1.5, border: '1px solid #bfdbfe' }}>
                      <Typography variant="caption" color="primary" fontWeight={700}>Bin verified:</Typography>
                      <Typography variant="body2" fontWeight={700}>{ccScannedBin.Code}</Typography>
                    </Box>
                  )}

                  {ccScannedItem && (
                    <Box sx={{ p: 1, bgcolor: '#f0fdf4', borderRadius: 1.5, border: '1px solid #bbf7d0' }}>
                      <Typography variant="caption" color="green" fontWeight={700}>Item verified:</Typography>
                      <Typography variant="body2" fontWeight={700}>{ccScannedItem.Name}</Typography>

                      {ccDetails.filter(d => d.BinId === ccScannedBin.BinId && d.ItemId === ccScannedItem.ItemId && d.Status === 'PENDING').length > 1 && (
                        <FormControl fullWidth size="small" sx={{ mt: 1.5, bgcolor: '#fff' }}>
                          <InputLabel>Select Batch to Count</InputLabel>
                          <Select
                            value={ccMatchedDetail ? ccMatchedDetail.CountDetailId : ''}
                            label="Select Batch to Count"
                            onChange={(e) => {
                              const line = ccDetails.find(d => d.CountDetailId === e.target.value);
                              setCcMatchedDetail(line);
                            }}
                          >
                            {ccDetails.filter(d => d.BinId === ccScannedBin.BinId && d.ItemId === ccScannedItem.ItemId && d.Status === 'PENDING').map(d => (
                              <MenuItem key={d.CountDetailId} value={d.CountDetailId}>
                                Batch: {d.BatchNumber || 'Standard'} (System Qty: {d.SystemQty})
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}

                      <TextField
                        label="Physical Count Qty"
                        type="number"
                        size="small"
                        sx={{ mt: 1.5, bgcolor: '#fff' }}
                        value={ccQty}
                        onChange={(e) => setCcQty(Number(e.target.value || '0'))}
                      />
                    </Box>
                  )}

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" color="error" fullWidth onClick={() => { setSelectedCC(null); setCcScannedBin(null); setCcScannedItem(null); }}>Back</Button>
                    <Button variant="contained" color="success" disabled={!ccScannedItem} fullWidth onClick={confirmCCLine}>Record Count</Button>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: PACK WORKFLOW                                */}
          {/* ==================================================== */}
          {screen === 'pack' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 1.5 }}>
              {!packPickList ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Select Pick List to Pack:</Typography>
                  <TextField
                    label="Scan Pick List Barcode"
                    size="small"
                    fullWidth
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') { handlePackScan(barcodeInput); setBarcodeInput(''); } }}
                    placeholder="e.g. PICK-123456"
                    sx={{ mb: 2 }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => startCameraScan('pack', handlePackScan)}>
                            <Camera size={16} />
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                  {pickLists.filter(p => p.Status === 'COMPLETED').length === 0 ? (
                    <Alert severity="info" sx={{ py: 0 }}>No Pick Lists ready for packing.</Alert>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {pickLists.filter(p => p.Status === 'COMPLETED').map(p => (
                        <ListItem key={p.PickListId} disablePadding sx={{ mb: 1 }}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => selectPackList(p)}
                            sx={{ justifyContent: 'space-between', textTransform: 'none', py: 1, color: 'text.primary', borderColor: '#cbd5e1' }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={700}>{p.PickCode}</Typography>
                              <Typography variant="caption" color="text.secondary">Order: {p.SOCode}</Typography>
                            </Box>
                            <Chip label="Pack" size="small" color="primary" />
                          </Button>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ p: 1, bgcolor: '#fdf4ff', borderRadius: 1.5, border: '1px solid #fbcfe8' }}>
                    <Typography variant="caption" color="text.secondary">Active Packing List</Typography>
                    <Typography variant="body2" fontWeight={700}>{packPickList.PickCode} ({packPickList.SOCode})</Typography>
                  </Box>

                  <TextField
                    label="Carton No"
                    size="small"
                    fullWidth
                    value={cartonNo}
                    onChange={(e) => setCartonNo(e.target.value)}
                  />
                  
                  <TextField
                    label="Pallet No (Optional)"
                    size="small"
                    fullWidth
                    value={packPalletNo}
                    onChange={(e) => setPackPalletNo(e.target.value)}
                  />

                  <Grid container spacing={1}>
                    <Grid item xs={6}>
                      <TextField
                        label="Gross Wt (kg)"
                        type="number"
                        size="small"
                        fullWidth
                        value={grossWeight}
                        onChange={(e) => setGrossWeight(e.target.value)}
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField
                        label="Item Count"
                        type="number"
                        size="small"
                        fullWidth
                        value={packItemCount}
                        onChange={(e) => setPackItemCount(Number(e.target.value || '0'))}
                      />
                    </Grid>
                  </Grid>
                  
                  <TextField
                    label="Packing Notes"
                    size="small"
                    fullWidth
                    multiline
                    rows={2}
                    value={packNotes}
                    onChange={(e) => setPackNotes(e.target.value)}
                  />

                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" color="error" fullWidth onClick={() => setPackPickList(null)}>Back</Button>
                    <Button variant="contained" color="success" fullWidth onClick={submitPack}>Complete Pack</Button>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: DISPATCH WORKFLOW                            */}
          {/* ==================================================== */}
          {screen === 'dispatch' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 1.5 }}>
              {!dispatchSelectedSO ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Select Packed Order to Dispatch:</Typography>
                  <TextField
                    label="Scan Sales Order Barcode"
                    size="small"
                    fullWidth
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') { handleDispatchScan(barcodeInput); setBarcodeInput(''); } }}
                    placeholder="e.g. SO-12345"
                    sx={{ mb: 2 }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => startCameraScan('dispatch', handleDispatchScan)}>
                            <Camera size={16} />
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                  {sos.filter(s => s.Status === 'PACKED').length === 0 ? (
                    <Alert severity="info" sx={{ py: 0 }}>No Packed Sales Orders waiting for dispatch.</Alert>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {sos.filter(s => s.Status === 'PACKED').map(s => (
                        <ListItem key={s.SOId} disablePadding sx={{ mb: 1 }}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => selectDispatchSO(s)}
                            sx={{ justifyContent: 'space-between', textTransform: 'none', py: 1, color: 'text.primary', borderColor: '#cbd5e1' }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={700}>{s.SOCode}</Typography>
                              <Typography variant="caption" color="text.secondary">Customer: {s.CustomerName}</Typography>
                            </Box>
                            <Chip label="Dispatch" size="small" color="primary" />
                          </Button>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ p: 1, bgcolor: '#f0fdf4', borderRadius: 1.5, border: '1px solid #bbf7d0' }}>
                    <Typography variant="caption" color="text.secondary">Dispatching Order</Typography>
                    <Typography variant="body2" fontWeight={700}>{dispatchSelectedSO.SOCode} ({dispatchSelectedSO.CustomerName})</Typography>
                  </Box>

                  <TextField
                    label="Delivery Challan No *"
                    size="small"
                    fullWidth
                    required
                    value={dispatchChallanNo}
                    onChange={(e) => setDispatchChallanNo(e.target.value)}
                  />
                  
                  <TextField
                    label="Vehicle No"
                    size="small"
                    fullWidth
                    value={dispatchVehicleNo}
                    onChange={(e) => setDispatchVehicleNo(e.target.value)}
                  />

                  <TextField
                    label="Transporter Name"
                    size="small"
                    fullWidth
                    value={dispatchTransporter}
                    onChange={(e) => setDispatchTransporter(e.target.value)}
                  />

                  <TextField
                    label="LR Number / Tracking No"
                    size="small"
                    fullWidth
                    value={dispatchLrNumber}
                    onChange={(e) => setDispatchLrNumber(e.target.value)}
                  />

                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" color="error" fullWidth onClick={() => setDispatchSelectedSO(null)}>Back</Button>
                    <Button variant="contained" color="success" fullWidth onClick={submitDispatch}>Confirm Dispatch</Button>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: QC INSPECTION WORKFLOW                       */}
          {/* ==================================================== */}
          {screen === 'qc' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', gap: 1.5 }}>
              {!selectedQCGRN ? (
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>Select Received GRN for QC Check:</Typography>
                  {qcGRNs.length === 0 ? (
                    <Alert severity="success" sx={{ py: 0 }}>All received GRNs are inspected!</Alert>
                  ) : (
                    <List sx={{ p: 0 }}>
                      {qcGRNs.map(g => (
                        <ListItem key={g.GRNId} disablePadding sx={{ mb: 1 }}>
                          <Button 
                            fullWidth 
                            variant="outlined" 
                            onClick={() => selectQCGRN(g)}
                            sx={{ justifyContent: 'space-between', textTransform: 'none', py: 1, color: 'text.primary', borderColor: '#cbd5e1' }}
                          >
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="body2" fontWeight={700}>{g.GRNCode}</Typography>
                              <Typography variant="caption" color="text.secondary">PO Reference: {g.POCode || 'N/A'}</Typography>
                            </Box>
                            <Chip label="Inspect" size="small" color="success" />
                          </Button>
                        </ListItem>
                      ))}
                    </List>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ p: 1, bgcolor: '#f0fdf4', borderRadius: 1.5, border: '1px solid #bbf7d0' }}>
                    <Typography variant="caption" color="text.secondary">Inspecting GRN</Typography>
                    <Typography variant="body2" fontWeight={700}>{selectedQCGRN.GRNCode}</Typography>
                  </Box>

                  <Typography variant="caption" sx={{ fontWeight: 700 }}>Inspect Items:</Typography>
                  <List sx={{ p: 0, maxHeight: 220, overflowY: 'auto' }}>
                    {qcDetails.map(item => {
                      const totalQty = item.ReceivedQty || 0;
                      const accVal = qcAcceptedQtys[item.ItemId] ?? totalQty;
                      const rejVal = qcRejectedQtys[item.ItemId] ?? 0;
                      const reason = qcReasons[item.ItemId] ?? '';

                      return (
                        <ListItem key={item.ItemId} sx={{ 
                          py: 1, px: 1, 
                          border: '1px solid #e2e8f0', 
                          borderRadius: 1.5, mb: 1,
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          bgcolor: rejVal > 0 ? '#fff1f2' : '#fff'
                        }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2" fontWeight={700}>{item.ItemName} ({item.ItemCode})</Typography>
                            <Typography variant="caption" color="text.secondary">Received: {totalQty} {item.UOM}</Typography>
                          </Box>

                          <Grid container spacing={1} alignItems="center">
                            <Grid item xs={6}>
                              <TextField
                                label="Pass Qty"
                                type="number"
                                size="small"
                                inputProps={{ min: 0, max: totalQty }}
                                value={accVal}
                                onChange={(e) => {
                                  const val = Math.min(Math.max(0, Number(e.target.value || '0')), totalQty);
                                  setQcAcceptedQtys(prev => ({ ...prev, [item.ItemId]: val }));
                                  setQcRejectedQtys(prev => ({ ...prev, [item.ItemId]: totalQty - val }));
                                }}
                              />
                            </Grid>
                            <Grid item xs={6}>
                              <TextField
                                label="Fail Qty"
                                type="number"
                                size="small"
                                inputProps={{ min: 0, max: totalQty }}
                                value={rejVal}
                                onChange={(e) => {
                                  const val = Math.min(Math.max(0, Number(e.target.value || '0')), totalQty);
                                  setQcRejectedQtys(prev => ({ ...prev, [item.ItemId]: val }));
                                  setQcAcceptedQtys(prev => ({ ...prev, [item.ItemId]: totalQty - val }));
                                }}
                              />
                            </Grid>
                          </Grid>

                          {rejVal > 0 && (
                            <FormControl fullWidth size="small" sx={{ mt: 1 }}>
                              <InputLabel>Rejection Reason</InputLabel>
                              <Select
                                value={reason}
                                label="Rejection Reason"
                                onChange={(e) => setQcReasons(prev => ({ ...prev, [item.ItemId]: e.target.value }))}
                              >
                                <MenuItem value="Damaged Stock">Damaged Stock</MenuItem>
                                <MenuItem value="Expired Product">Expired Product</MenuItem>
                                <MenuItem value="Incorrect Specification">Incorrect Specification</MenuItem>
                                <MenuItem value="Quality Defect">Quality Defect</MenuItem>
                              </Select>
                            </FormControl>
                          )}
                        </ListItem>
                      );
                    })}
                  </List>

                  <TextField
                    label="Inspection Remarks"
                    size="small"
                    fullWidth
                    value={qcRemarks}
                    onChange={(e) => setQcRemarks(e.target.value)}
                    placeholder="Enter any inspection notes..."
                  />

                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button variant="outlined" color="error" fullWidth onClick={() => { setSelectedQCGRN(null); setQcDetails([]); }}>Back</Button>
                    <Button variant="contained" color="success" fullWidth onClick={submitQC}>Submit QC Result</Button>
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* SCREEN: BARCODE LIST / CHEAT SHEET                   */}
          {/* ==================================================== */}
          {screen === 'print' && (
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>WMS Barcode cheat sheet</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                Use this list to copy-paste mock barcodes into manual fields, or scan them using your laptop/mobile camera!
              </Typography>

              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>Bins Barcodes:</Typography>
              <List sx={{ p: 0, mb: 2 }}>
                {bins.slice(0, 4).map(b => (
                  <ListItem key={b.BinId} sx={{ p: 0.5, border: '1px solid #cbd5e1', borderRadius: 1, mb: 0.5, bgcolor: '#fff' }}>
                    <ListItemText primary={b.Code} secondary={b.Barcode} primaryTypographyProps={{ fontSize: 11, fontWeight: 700 }} secondaryTypographyProps={{ fontSize: 9 }} />
                    <IconButton size="small" onClick={() => { navigator.clipboard.writeText(b.Barcode); showFeedback('success', `Copied Bin Barcode: ${b.Barcode}`); }}>
                      <Copy size={12} />
                    </IconButton>
                  </ListItem>
                ))}
              </List>

              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>Items Barcodes:</Typography>
              <List sx={{ p: 0 }}>
                {items.map(i => (
                  <ListItem key={i.ItemId} sx={{ p: 0.5, border: '1px solid #cbd5e1', borderRadius: 1, mb: 0.5, bgcolor: '#fff' }}>
                    <ListItemText primary={i.Name} secondary={`${i.Code} | Barcode: ${i.Barcode}`} primaryTypographyProps={{ fontSize: 11, fontWeight: 700 }} secondaryTypographyProps={{ fontSize: 9 }} />
                    <IconButton size="small" onClick={() => { navigator.clipboard.writeText(i.Barcode); showFeedback('success', `Copied Item Barcode: ${i.Barcode}`); }}>
                      <Copy size={12} />
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            </Box>
          )}

          {/* Reusable Camera Viewport overlay portal */}
          {activeCameraScan && (
            <Box sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: '#000',
              color: '#fff',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              p: 2
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={800}>Scanning Environment Camera...</Typography>
                <Button variant="contained" size="small" color="error" onClick={stopCameraScan}>Cancel</Button>
              </Box>
              <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                <div id="camera-reader" style={{ width: '100%', height: '100%', minHeight: 300 }} />
              </Box>
              {scanCameraError && (
                <Box sx={{ p: 1.5, bgcolor: '#991b1b', borderRadius: 2, mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ShieldAlert size={16} />
                  <Typography variant="caption" fontWeight={600}>{scanCameraError}</Typography>
                </Box>
              )}
            </Box>
          )}

        </Box>
      </Card>
    </Box>
  );
}
