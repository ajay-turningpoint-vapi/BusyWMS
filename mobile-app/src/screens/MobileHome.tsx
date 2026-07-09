import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, View, Text, ScrollView, TouchableOpacity, 
  TextInput, ActivityIndicator, Alert, Modal, FlatList, Platform
} from 'react-native';
import { 
  Smartphone, Scan, ArrowLeft, Clipboard, MapPin, 
  Package, Truck, RefreshCw, Check, Info, Camera, 
  Printer, ArrowLeftRight, Copy, Plus, Trash2, ShieldAlert, LogOut
} from 'lucide-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';

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

export default function MobileHome({ navigation }: any) {
  const [screen, setScreen] = useState<'menu' | 'grn' | 'asn' | 'putaway' | 'pick' | 'pack' | 'dispatch' | 'count' | 'transfer' | 'print'>('menu');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  
  // Data lists fetched from backend
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [bins, setBins] = useState<any[]>([]);
  const [pos, setPOs] = useState<any[]>([]);
  const [pickLists, setPickLists] = useState<any[]>([]);
  const [cycleCounts, setCycleCounts] = useState<any[]>([]);
  const [pendingPutaways, setPendingPutaways] = useState<any[]>([]);
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [asns, setAsns] = useState<any[]>([]);

  // Loading States
  const [loading, setLoading] = useState(false);

  // Camera permissions & Scanner State
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraActive, setCameraActive] = useState(false);
  const [onScanSuccess, setOnScanSuccess] = useState<(code: string) => void>(() => () => {});

  // Flow-specific state
  // GRN
  const [grnSelectedPO, setGrnSelectedPO] = useState<any>(null);
  const [grnPOLines, setGrnPOLines] = useState<any[]>([]);
  const [grnScannedItems, setGrnScannedItems] = useState<any[]>([]);
  const [grnInvoiceNo, setGrnInvoiceNo] = useState('');
  const [grnScannedItem, setGrnScannedItem] = useState<any>(null);
  const [grnQty, setGrnQty] = useState(1);
  const [grnBatchNo, setGrnBatchNo] = useState('');
  const [grnExpiry, setGrnExpiry] = useState('');
  const [grnSerial, setGrnSerial] = useState('');

  // Putaway
  const [putawayLine, setPutawayLine] = useState<any>(null);
  const [putawayQty, setPutawayQty] = useState(0);
  const [putawaySuggestedBins, setPutawaySuggestedBins] = useState<any[]>([]);
  const [putawayTargetBin, setPutawayTargetBin] = useState<any>(null);

  // Picking
  const [selectedPickList, setSelectedPickList] = useState<any>(null);
  const [pickDetails, setPickDetails] = useState<any[]>([]);
  const [pickScannedBin, setPickScannedBin] = useState<any>(null);
  const [pickScannedItem, setPickScannedItem] = useState<any>(null);
  const [pickMatchedDetail, setPickMatchedDetail] = useState<any>(null);
  const [pickQty, setPickQty] = useState(0);

  // Transfer
  const [transferSrcBin, setTransferSrcBin] = useState<any>(null);
  const [transferItem, setTransferItem] = useState<any>(null);
  const [transferDestBin, setTransferDestBin] = useState<any>(null);
  const [transferQty, setTransferQty] = useState(0);

  // Cycle Count
  const [selectedCC, setSelectedCC] = useState<any>(null);
  const [ccDetails, setCCDetails] = useState<any[]>([]);
  const [ccScannedBin, setCCScannedBin] = useState<any>(null);
  const [ccScannedItem, setCCScannedItem] = useState<any>(null);
  const [ccCountedQty, setCCCountedQty] = useState(0);
  const [ccCountsSubmitted, setCCCountsSubmitted] = useState<any[]>([]);

  // Focus lock for hardware scanners
  const textInputRef = useRef<TextInput>(null);

  useEffect(() => {
    loadMasterData();
  }, [screen]);

  // Keep focus on hidden input for hardware scanner guns
  useEffect(() => {
    if (screen !== 'menu' && screen !== 'print' && !cameraActive) {
      const interval = setInterval(() => {
        if (textInputRef.current && !textInputRef.current.isFocused()) {
          textInputRef.current.focus();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [screen, cameraActive]);

  const loadMasterData = async () => {
    try {
      setLoading(true);
      const [itemRes, binRes, poRes, pickRes, ccRes, putRes, invRes, asnRes] = await Promise.all([
        api.get('/masters/items'),
        api.get('/masters/bins'),
        api.get('/inbound/pending-pos'),
        api.get('/outbound/pick-lists'),
        api.get('/inventory/cycle-counts'),
        api.get('/putaway/pending'),
        api.get('/inventory/stock'),
        api.get('/inbound/asn')
      ]);
      setItems(itemRes.data);
      setBins(binRes.data);
      setPOs(poRes.data);
      setAsns((asnRes.data || []).filter((a: any) => ['Confirmed', 'In Transit', 'Partially Received'].includes(a.Status)));
      setPickLists(pickRes.data.filter((p: any) => p.Status === 'PENDING' || p.Status === 'PICKING'));
      setCycleCounts(ccRes.data.filter((c: any) => c.Status === 'PENDING' || c.Status === 'COUNTING'));
      setPendingPutaways(putRes.data);
      setInventoryList(invRes.data);
    } catch (err) {
      console.error(err);
      showFeedback('error', 'Error loading WMS tables.');
    } finally {
      setLoading(false);
    }
  };

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleBarcodeSubmit = () => {
    if (!barcodeInput) return;
    const value = barcodeInput.trim();
    setBarcodeInput('');
    processScannedCode(value);
  };

  const processScannedCode = (value: string) => {
    if (screen === 'grn') {
      handleGRNScan(value);
    } else if (screen === 'putaway') {
      handlePutawayScan(value);
    } else if (screen === 'pick') {
      handlePickScan(value);
    } else if (screen === 'transfer') {
      handleTransferScan(value);
    } else if (screen === 'count') {
      handleCycleCountScan(value);
    }
  };

  // Reusable Camera Scan trigger
  const triggerCameraScan = async (onScan: (code: string) => void) => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Camera Permission Required', 'This feature needs camera access to scan barcodes.');
        return;
      }
    }
    setOnScanSuccess(() => (code: string) => {
      setCameraActive(false);
      onScan(code);
    });
    setCameraActive(true);
  };

  // 1. GRN INBOUND SYNC LOGIC
  const selectPO = async (po: any) => {
    try {
      setLoading(true);
      const res = await api.get(`/inbound/po-details/${po.POId}`);
      setGrnSelectedPO(po);
      setGrnPOLines(res.data);
      setGrnScannedItems([]);
      setGrnInvoiceNo(`INV-M-${Date.now().toString().slice(-4)}`);
      showFeedback('success', `PO ${po.POCode} loaded. Ready to scan.`);
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
    const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
    if (!matchedItem) {
      showFeedback('error', `Barcode '${code}' not found in WMS items.`);
      return;
    }
    const poLine = grnPOLines.find(l => l.ItemId === matchedItem.ItemId);
    if (!poLine) {
      showFeedback('error', `Item '${matchedItem.Name}' is not in PO ${grnSelectedPO.POCode}.`);
      return;
    }

    const alreadyScanned = grnScannedItems.find(i => i.itemId === matchedItem.ItemId);
    const currentlyScannedQty = alreadyScanned ? alreadyScanned.receivedQty : 0;
    const expected = poLine.OrderQty - poLine.ReceivedQty;

    if (currentlyScannedQty >= expected) {
      showFeedback('error', `Item '${matchedItem.Name}' is already fully scanned.`);
      return;
    }

    setGrnScannedItem(matchedItem);
    setGrnQty(expected - currentlyScannedQty);
    if (matchedItem.TrackBatch === 1) {
      setGrnBatchNo(`BAT-${Date.now().toString().slice(-4)}`);
      setGrnExpiry('');
    } else {
      setGrnBatchNo('');
      setGrnExpiry('');
    }
    setGrnSerial('');
    showFeedback('success', `Item identified: ${matchedItem.Name}`);
  };

  const addGrnItem = () => {
    if (!grnScannedItem) return;
    const poLine = grnPOLines.find(l => l.ItemId === grnScannedItem.ItemId);
    const alreadyScanned = grnScannedItems.find(i => i.itemId === grnScannedItem.ItemId);
    const currentlyScannedQty = alreadyScanned ? alreadyScanned.receivedQty : 0;
    const remainingExpected = poLine ? (poLine.OrderQty - poLine.ReceivedQty - currentlyScannedQty) : 0;

    if (grnQty <= 0 || grnQty > remainingExpected) {
      showFeedback('error', `Quantity must be between 1 and ${remainingExpected}`);
      return;
    }
    if (grnScannedItem.TrackBatch === 1 && !grnBatchNo) {
      showFeedback('error', 'Batch Number is required.');
      return;
    }
    if (grnScannedItem.TrackSerial === 1 && !grnSerial) {
      showFeedback('error', 'Serial Number is required.');
      return;
    }

    if (alreadyScanned) {
      alreadyScanned.receivedQty += grnQty;
      setGrnScannedItems([...grnScannedItems]);
    } else {
      setGrnScannedItems([
        ...grnScannedItems,
        {
          itemId: grnScannedItem.ItemId,
          code: grnScannedItem.Code,
          name: grnScannedItem.Name,
          receivedQty: grnQty,
          uom: grnScannedItem.UOM,
          batchNumber: grnBatchNo || null,
          expiryDate: grnExpiry || null,
          serialNumber: grnSerial || null
        }
      ]);
    }

    setGrnScannedItem(null);
    showFeedback('success', 'Item added successfully!');
  };

  const submitGrn = async () => {
    if (!grnSelectedPO || grnScannedItems.length === 0) return;
    try {
      setLoading(true);
      const res = await api.post('/inbound/grn', {
        poId: grnSelectedPO.POId,
        invoiceNo: grnInvoiceNo,
        items: grnScannedItems
      });
      showFeedback('success', `GRN Created: ${res.data.grnCode}`);
      resetGrn();
      setScreen('menu');
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Failed to submit GRN.');
    } finally {
      setLoading(false);
    }
  };

  const resetGrn = () => {
    setGrnSelectedPO(null);
    setGrnPOLines([]);
    setGrnScannedItems([]);
    setGrnInvoiceNo('');
    setGrnScannedItem(null);
  };

  // 2. PUTAWAY LOGIC
  const handlePutawayScan = async (code: string) => {
    if (!putawayLine) {
      // Step 1: Scan Item
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

      try {
        const suggest = await api.post('/putaway/suggest', {
          itemId: matchedPutaway.ItemId,
          quantity: matchedPutaway.PendingPutawayQty
        });
        setPutawaySuggestedBins(suggest.data || []);
      } catch (err) {
        console.error(err);
      }
      showFeedback('success', `Identified ${matchedItem.Name}. Now scan Target Bin.`);
    } else {
      // Step 2: Scan Destination Bin
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Bin location barcode.');
        return;
      }
      setPutawayTargetBin(matchedBin);
      showFeedback('success', `Target Bin verified: ${matchedBin.Code}`);
    }
  };

  const executePutaway = async () => {
    if (!putawayLine || !putawayTargetBin) return;
    try {
      setLoading(true);
      await api.post('/putaway/execute', {
        grnDetailId: putawayLine.GRNDetailId,
        binId: putawayTargetBin.BinId,
        quantity: putawayQty
      });
      showFeedback('success', 'Putaway executed successfully!');
      setPutawayLine(null);
      setPutawayTargetBin(null);
      loadMasterData();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Putaway failed.');
    } finally {
      setLoading(false);
    }
  };

  // 3. PICKING WORKFLOW
  const selectPickList = async (list: any) => {
    try {
      setLoading(true);
      const res = await api.get(`/outbound/pick-lists/${list.PickListId}`);
      setSelectedPickList(list);
      setPickDetails(res.data.items);
      setPickScannedBin(null);
      setPickScannedItem(null);
      showFeedback('success', `Pick List ${list.PickListCode} loaded.`);
    } catch (err) {
      showFeedback('error', 'Failed to retrieve pick list.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickScan = (code: string) => {
    if (!selectedPickList) {
      showFeedback('error', 'Select a Pick List first.');
      return;
    }
    if (!pickScannedBin) {
      // Step 1: Scan Bin Barcode
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Bin locator barcode.');
        return;
      }
      const binInList = pickDetails.some(d => d.BinId === matchedBin.BinId && d.Status === 'PENDING');
      if (!binInList) {
        showFeedback('error', `Bin ${matchedBin.Code} is not in active pick details.`);
        return;
      }
      setPickScannedBin(matchedBin);
      showFeedback('success', `Bin confirmed. Now scan Item barcode.`);
    } else {
      // Step 2: Scan Item Barcode
      const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
      if (!matchedItem) {
        showFeedback('error', 'Item barcode not found.');
        return;
      }
      const matchedLines = pickDetails.filter(
        d => d.BinId === pickScannedBin.BinId && d.ItemId === matchedItem.ItemId && d.Status === 'PENDING'
      );
      if (matchedLines.length === 0) {
        showFeedback('error', `Item is not expected in Bin ${pickScannedBin.Code}.`);
        return;
      }
      const matchedLine = matchedLines[0];
      setPickScannedItem(matchedItem);
      setPickMatchedDetail(matchedLine);
      setPickQty(matchedLine.Quantity - matchedLine.PickedQty);
      showFeedback('success', `Item verified. Confirm Quantity.`);
    }
  };

  const submitPick = async () => {
    if (!pickMatchedDetail || !pickScannedBin) return;
    try {
      setLoading(true);
      await api.post(`/outbound/pick-lists/${selectedPickList.PickListId}/pick`, {
        pickDetailId: pickMatchedDetail.PickDetailId,
        pickedQty: pickQty
      });
      showFeedback('success', 'Pick completed successfully.');
      setPickScannedItem(null);
      setPickScannedBin(null);
      setPickMatchedDetail(null);
      // Reload Details
      selectPickList(selectedPickList);
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Picking submission failed.');
    } finally {
      setLoading(false);
    }
  };

  // 4. CYCLE COUNTING LOGIC
  const selectCC = async (cc: any) => {
    try {
      setLoading(true);
      const res = await api.get(`/inventory/cycle-counts/${cc.CycleCountId}`);
      setSelectedCC(cc);
      setCCDetails(res.data.items || []);
      setCCScannedBin(null);
      setCCScannedItem(null);
      setCCCountsSubmitted([]);
      showFeedback('success', `Cycle count ${cc.CCNumber} loaded.`);
    } catch (err) {
      showFeedback('error', 'Failed to retrieve cycle count details.');
    } finally {
      setLoading(false);
    }
  };

  const handleCycleCountScan = (code: string) => {
    if (!selectedCC) return;
    if (!ccScannedBin) {
      // Step 1: Scan Bin
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Bin location barcode.');
        return;
      }
      setCCScannedBin(matchedBin);
      showFeedback('success', `Bin confirmed. Now scan Item.`);
    } else {
      // Step 2: Scan Item
      const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
      if (!matchedItem) {
        showFeedback('error', 'Item barcode not found.');
        return;
      }
      setCCScannedItem(matchedItem);
      const existingInput = ccDetails.find(d => d.BinId === ccScannedBin.BinId && d.ItemId === matchedItem.ItemId);
      setCCCountedQty(existingInput ? existingInput.CountedQty || 0 : 0);
      showFeedback('success', `Item confirmed. Enter counted qty.`);
    }
  };

  const addCCLine = () => {
    if (!ccScannedBin || !ccScannedItem) return;
    const exists = ccCountsSubmitted.find(c => c.itemId === ccScannedItem.ItemId && c.binId === ccScannedBin.BinId);
    if (exists) {
      exists.countedQty = ccCountedQty;
    } else {
      ccCountsSubmitted.push({
        binId: ccScannedBin.BinId,
        itemId: ccScannedItem.ItemId,
        countedQty: ccCountedQty,
        itemName: ccScannedItem.Name,
        binCode: ccScannedBin.Code
      });
    }
    setCCCountsSubmitted([...ccCountsSubmitted]);
    setCCScannedItem(null);
    setCCScannedBin(null);
    showFeedback('success', 'Count recorded locally.');
  };

  const submitCC = async () => {
    if (!selectedCC || ccCountsSubmitted.length === 0) return;
    try {
      setLoading(true);
      await api.post(`/inventory/cycle-counts/${selectedCC.CycleCountId}/count`, {
        counts: ccCountsSubmitted.map(c => ({
          binId: c.binId,
          itemId: c.itemId,
          countedQty: c.countedQty
        }))
      });
      showFeedback('success', 'Cycle counts recorded successfully!');
      setSelectedCC(null);
      setCCCountsSubmitted([]);
      setScreen('menu');
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Cycle count failed.');
    } finally {
      setLoading(false);
    }
  };

  // 5. INVENTORY TRANSFER LOGIC
  const handleTransferScan = (code: string) => {
    if (!transferSrcBin) {
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Source Bin Barcode.');
        return;
      }
      setTransferSrcBin(matchedBin);
      showFeedback('success', 'Source Bin confirmed. Now scan Item.');
    } else if (!transferItem) {
      const matchedItem = items.find(i => i.Barcode === code || i.Code === code);
      if (!matchedItem) {
        showFeedback('error', 'Invalid Item Barcode.');
        return;
      }
      setTransferItem(matchedItem);
      showFeedback('success', 'Item confirmed. Now scan Destination Bin.');
    } else {
      const matchedBin = bins.find(b => b.Barcode === code || b.Code === code);
      if (!matchedBin) {
        showFeedback('error', 'Invalid Destination Bin Barcode.');
        return;
      }
      setTransferDestBin(matchedBin);
      showFeedback('success', 'Destination Bin confirmed. Confirm Transfer.');
    }
  };

  const executeTransfer = async () => {
    if (!transferSrcBin || !transferItem || !transferDestBin || transferQty <= 0) return;
    try {
      setLoading(true);
      await api.post('/inventory/transfer', {
        sourceBinId: transferSrcBin.BinId,
        itemId: transferItem.ItemId,
        destinationBinId: transferDestBin.BinId,
        quantity: transferQty
      });
      showFeedback('success', 'Stock transfer completed successfully.');
      setTransferSrcBin(null);
      setTransferItem(null);
      setTransferDestBin(null);
      setTransferQty(0);
      loadMasterData();
    } catch (err: any) {
      showFeedback('error', err.response?.data?.message || 'Transfer execution failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('wms_auth_token');
    navigation.replace('Login');
  };

  return (
    <View style={styles.container}>
      {/* Header bar */}
      <View style={styles.header}>
        {screen !== 'menu' ? (
          <TouchableOpacity onPress={() => setScreen('menu')}>
            <ArrowLeft color="#fff" size={24} />
          </TouchableOpacity>
        ) : (
          <Smartphone color="#fff" size={24} />
        )}
        <Text style={styles.headerText}>
          {screen === 'menu' ? 'WMS Mobile' : screen.toUpperCase()}
        </Text>
        <TouchableOpacity onPress={handleLogout}>
          <LogOut color="#fff" size={24} />
        </TouchableOpacity>
      </View>

      {/* Hidden text inputs for hardware scanner guns */}
      {screen !== 'menu' && screen !== 'print' && !cameraActive && (
        <TextInput 
          ref={textInputRef}
          style={styles.hiddenInput}
          value={barcodeInput}
          onChangeText={setBarcodeInput}
          onSubmitEditing={handleBarcodeSubmit}
          autoFocus
          showSoftInputOnFocus={false}
          autoComplete="off"
          autoCorrect={false}
        />
      )}

      {/* Feedback Toast Notification */}
      {feedback && (
        <View style={[styles.feedback, feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess]}>
          <Text style={styles.feedbackText}>{feedback.msg}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {/* ================================================= MENU SCREEN ================================================= */}
        {screen === 'menu' && (
          <View style={styles.menuContainer}>
            <Text style={styles.welcomeText}>Select Warehouse Operation</Text>
            
            <View style={styles.menuGrid}>
              <TouchableOpacity style={styles.menuCard} onPress={() => setScreen('grn')}>
                <Clipboard color="#1a73e8" size={32} />
                <Text style={styles.menuCardText}>GRN Receipt</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuCard} onPress={() => setScreen('putaway')}>
                <MapPin color="#1a73e8" size={32} />
                <Text style={styles.menuCardText}>Putaway</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuCard} onPress={() => setScreen('pick')}>
                <Package color="#1a73e8" size={32} />
                <Text style={styles.menuCardText}>Picking</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuCard} onPress={() => setScreen('transfer')}>
                <ArrowLeftRight color="#1a73e8" size={32} />
                <Text style={styles.menuCardText}>Transfer</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.menuCard} onPress={() => setScreen('count')}>
                <RefreshCw color="#1a73e8" size={32} />
                <Text style={styles.menuCardText}>Cycle Count</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ================================================= GRN INBOUND SCREEN ================================================= */}
        {screen === 'grn' && !grnSelectedPO && (
          <View>
            <Text style={styles.sectionTitle}>Select Purchase Order</Text>
            {pos.map(po => (
              <TouchableOpacity key={po.POId} style={styles.listItem} onPress={() => selectPO(po)}>
                <Text style={styles.listItemTitle}>{po.POCode}</Text>
                <Text style={styles.listItemSub}>Vendor: {po.VendorName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {screen === 'grn' && grnSelectedPO && (
          <View>
            <Text style={styles.sectionTitle}>PO: {grnSelectedPO.POCode}</Text>
            <Text style={styles.helpText}>Invoice No:</Text>
            <TextInput style={styles.textInput} value={grnInvoiceNo} onChangeText={setGrnInvoiceNo} />

            <TouchableOpacity style={styles.scanButton} onPress={() => triggerCameraScan(handleGRNScan)}>
              <Camera color="#fff" size={20} />
              <Text style={styles.scanButtonText}>Scan Item Barcode</Text>
            </TouchableOpacity>

            {grnScannedItem && (
              <View style={styles.editCard}>
                <Text style={styles.editTitle}>{grnScannedItem.Name}</Text>
                <Text style={styles.helpText}>Quantity:</Text>
                <TextInput 
                  style={styles.textInput} 
                  keyboardType="numeric" 
                  value={grnQty.toString()} 
                  onChangeText={val => setGrnQty(parseInt(val, 10) || 0)} 
                />

                {grnScannedItem.TrackBatch === 1 && (
                  <>
                    <Text style={styles.helpText}>Batch Number:</Text>
                    <TextInput style={styles.textInput} value={grnBatchNo} onChangeText={setGrnBatchNo} />
                  </>
                )}
                {grnScannedItem.TrackSerial === 1 && (
                  <>
                    <Text style={styles.helpText}>Serial Number:</Text>
                    <TextInput style={styles.textInput} value={grnSerial} onChangeText={setGrnSerial} />
                  </>
                )}

                <TouchableOpacity style={styles.actionButton} onPress={addGrnItem}>
                  <Text style={styles.actionButtonText}>Add to GRN List</Text>
                </TouchableOpacity>
              </View>
            )}

            {grnScannedItems.length > 0 && (
              <View style={styles.scannedBox}>
                <Text style={styles.subtitle}>Scanned Items ({grnScannedItems.length})</Text>
                {grnScannedItems.map((item, idx) => (
                  <View key={idx} style={styles.scannedRow}>
                    <Text>{item.name} (x{item.receivedQty})</Text>
                    <TouchableOpacity onPress={() => setGrnScannedItems(grnScannedItems.filter((_, i) => i !== idx))}>
                      <Trash2 color="#dc2626" size={18} />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={[styles.actionButton, { marginTop: 16 }]} onPress={submitGrn}>
                  <Text style={styles.actionButtonText}>Submit GRN</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ================================================= PUTAWAY SCREEN ================================================= */}
        {screen === 'putaway' && (
          <View>
            <Text style={styles.sectionTitle}>Putaway Operations</Text>
            
            <TouchableOpacity style={styles.scanButton} onPress={() => triggerCameraScan(handlePutawayScan)}>
              <Camera color="#fff" size={20} />
              <Text style={styles.scanButtonText}>
                {!putawayLine ? 'Scan Product Barcode' : 'Scan Destination Bin Barcode'}
              </Text>
            </TouchableOpacity>

            {putawayLine && (
              <View style={styles.editCard}>
                <Text style={styles.editTitle}>{putawayLine.ItemName}</Text>
                <Text>Pending Putaway: {putawayLine.PendingPutawayQty} {putawayLine.UOM}</Text>
                
                <Text style={styles.helpText}>Qty to Move:</Text>
                <TextInput 
                  style={styles.textInput} 
                  keyboardType="numeric" 
                  value={putawayQty.toString()} 
                  onChangeText={val => setPutawayQty(parseInt(val, 10) || 0)} 
                />

                <Text style={styles.subtitle}>Suggested Bins:</Text>
                {putawaySuggestedBins.map((bin, idx) => (
                  <Text key={idx}>• Bin {bin.Code} ({bin.WarehouseName})</Text>
                ))}

                {putawayTargetBin && (
                  <View style={styles.confirmedBox}>
                    <Text style={{fontWeight: 'bold', color: '#16a34a'}}>Verified Bin: {putawayTargetBin.Code}</Text>
                    <TouchableOpacity style={[styles.actionButton, {marginTop: 12}]} onPress={executePutaway}>
                      <Text style={styles.actionButtonText}>Confirm Placement</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ================================================= PICKING SCREEN ================================================= */}
        {screen === 'pick' && !selectedPickList && (
          <View>
            <Text style={styles.sectionTitle}>Select Pick List</Text>
            {pickLists.map(list => (
              <TouchableOpacity key={list.PickListId} style={styles.listItem} onPress={() => selectPickList(list)}>
                <Text style={styles.listItemTitle}>{list.PickListCode}</Text>
                <Text style={styles.listItemSub}>Zone: {list.ZoneName || 'General'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {screen === 'pick' && selectedPickList && (
          <View>
            <Text style={styles.sectionTitle}>Picking: {selectedPickList.PickListCode}</Text>

            <TouchableOpacity style={styles.scanButton} onPress={() => triggerCameraScan(handlePickScan)}>
              <Camera color="#fff" size={20} />
              <Text style={styles.scanButtonText}>
                {!pickScannedBin ? 'Scan Location Bin Barcode' : 'Scan Product Barcode'}
              </Text>
            </TouchableOpacity>

            {pickScannedBin && (
              <Text style={styles.subtitle}>Current Location: {pickScannedBin.Code}</Text>
            )}

            {pickScannedItem && pickMatchedDetail && (
              <View style={styles.editCard}>
                <Text style={styles.editTitle}>{pickScannedItem.Name}</Text>
                <Text>Target Pick Qty: {pickMatchedDetail.Quantity - pickMatchedDetail.PickedQty}</Text>
                <TextInput 
                  style={styles.textInput} 
                  keyboardType="numeric" 
                  value={pickQty.toString()} 
                  onChangeText={val => setPickQty(parseInt(val, 10) || 0)} 
                />
                <TouchableOpacity style={styles.actionButton} onPress={submitPick}>
                  <Text style={styles.actionButtonText}>Confirm Pick</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.subtitle}>Items Remaining ({pickDetails.filter(d => d.Status === 'PENDING').length})</Text>
            {pickDetails.map((detail, idx) => (
              <View key={idx} style={[styles.listItem, detail.Status === 'PICKED' && {backgroundColor: '#f0fdf4'}]}>
                <Text style={{fontWeight: 'bold'}}>{detail.ItemName} ({detail.ItemCode})</Text>
                <Text>Bin: {detail.BinCode} | Qty: {detail.PickedQty}/{detail.Quantity}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ================================================= TRANSFER SCREEN ================================================= */}
        {screen === 'transfer' && (
          <View>
            <Text style={styles.sectionTitle}>Stock Transfer</Text>
            
            <TouchableOpacity style={styles.scanButton} onPress={() => triggerCameraScan(handleTransferScan)}>
              <Camera color="#fff" size={20} />
              <Text style={styles.scanButtonText}>
                {!transferSrcBin ? 'Scan Source Bin Barcode' : 
                 !transferItem ? 'Scan Product Barcode' : 'Scan Destination Bin Barcode'}
              </Text>
            </TouchableOpacity>

            <View style={styles.editCard}>
              <Text>Source: {transferSrcBin ? transferSrcBin.Code : 'Not scanned'}</Text>
              <Text>Item: {transferItem ? transferItem.Name : 'Not scanned'}</Text>
              <Text>Destination: {transferDestBin ? transferDestBin.Code : 'Not scanned'}</Text>

              {transferSrcBin && transferItem && transferDestBin && (
                <>
                  <Text style={styles.helpText}>Transfer Quantity:</Text>
                  <TextInput 
                    style={styles.textInput} 
                    keyboardType="numeric" 
                    value={transferQty.toString()} 
                    onChangeText={val => setTransferQty(parseInt(val, 10) || 0)} 
                  />
                  <TouchableOpacity style={styles.actionButton} onPress={executeTransfer}>
                    <Text style={styles.actionButtonText}>Execute Transfer</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        {/* ================================================= CYCLE COUNT SCREEN ================================================= */}
        {screen === 'count' && !selectedCC && (
          <View>
            <Text style={styles.sectionTitle}>Select Inventory Audit List</Text>
            {cycleCounts.map(cc => (
              <TouchableOpacity key={cc.CycleCountId} style={styles.listItem} onPress={() => selectCC(cc)}>
                <Text style={styles.listItemTitle}>Audit #{cc.CCNumber}</Text>
                <Text style={styles.listItemSub}>Status: {cc.Status}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {screen === 'count' && selectedCC && (
          <View>
            <Text style={styles.sectionTitle}>Audit List: #{selectedCC.CCNumber}</Text>

            <TouchableOpacity style={styles.scanButton} onPress={() => triggerCameraScan(handleCycleCountScan)}>
              <Camera color="#fff" size={20} />
              <Text style={styles.scanButtonText}>
                {!ccScannedBin ? 'Scan Bin Locator Barcode' : 'Scan Item Barcode'}
              </Text>
            </TouchableOpacity>

            {ccScannedBin && <Text style={styles.subtitle}>Current Bin: {ccScannedBin.Code}</Text>}

            {ccScannedItem && (
              <View style={styles.editCard}>
                <Text style={styles.editTitle}>{ccScannedItem.Name}</Text>
                <Text style={styles.helpText}>Counted Quantity:</Text>
                <TextInput 
                  style={styles.textInput} 
                  keyboardType="numeric" 
                  value={ccCountedQty.toString()} 
                  onChangeText={val => setCCCountedQty(parseInt(val, 10) || 0)} 
                />
                <TouchableOpacity style={styles.actionButton} onPress={addCCLine}>
                  <Text style={styles.actionButtonText}>Save Count</Text>
                </TouchableOpacity>
              </View>
            )}

            {ccCountsSubmitted.length > 0 && (
              <View style={styles.scannedBox}>
                <Text style={styles.subtitle}>Recorded Counts ({ccCountsSubmitted.length})</Text>
                {ccCountsSubmitted.map((c, idx) => (
                  <Text key={idx}>{c.itemName} in {c.binCode} = {c.countedQty}</Text>
                ))}
                <TouchableOpacity style={[styles.actionButton, {marginTop: 16}]} onPress={submitCC}>
                  <Text style={styles.actionButtonText}>Submit Counts</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal for Camera Barcode Scanner View */}
      <Modal visible={cameraActive} animationType="slide">
        <View style={{flex: 1, backgroundColor: '#000'}}>
          <CameraView 
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={(e) => {
              if (e.data) onScanSuccess(e.data);
            }}
          />
          <View style={styles.cameraOverlay}>
            <Text style={styles.cameraOverlayText}>Center barcode inside camera frame</Text>
            <TouchableOpacity style={styles.cameraClose} onPress={() => setCameraActive(false)}>
              <Text style={styles.cameraCloseText}>Cancel Scan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    height: 64,
    backgroundColor: '#1a73e8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 0,
  },
  headerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  hiddenInput: {
    position: 'absolute',
    left: -9999,
    width: 1,
    height: 1,
  },
  feedback: {
    padding: 12,
    alignItems: 'center',
  },
  feedbackSuccess: {
    backgroundColor: '#d1fae5',
  },
  feedbackError: {
    backgroundColor: '#fee2e2',
  },
  feedbackText: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#111827',
  },
  content: {
    padding: 16,
    flexGrow: 1,
  },
  menuContainer: {
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#374151',
    marginVertical: 16,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  menuCard: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  menuCardText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a73e8',
    marginBottom: 16,
  },
  listItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  listItemSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  scanButton: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  editCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  editTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  helpText: {
    fontSize: 12,
    color: '#4b5563',
    marginBottom: 4,
    fontWeight: '600',
  },
  textInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 15,
    marginBottom: 16,
    color: '#111827',
  },
  actionButton: {
    height: 40,
    backgroundColor: '#16a34a',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  scannedBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 16,
    marginTop: 16,
  },
  scannedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  confirmedBox: {
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginTop: 16,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  cameraOverlayText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 20,
    textAlign: 'center',
  },
  cameraClose: {
    height: 48,
    width: '100%',
    backgroundColor: '#dc2626',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
