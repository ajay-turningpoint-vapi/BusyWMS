import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Box, Typography, Button, Card, Tabs, Tab, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, TextField, 
  Select, MenuItem, FormControl, InputLabel, CircularProgress, 
  Alert, Grid, InputAdornment, Chip, Dialog, DialogTitle, 
  DialogContent, DialogActions, FormControlLabel, Checkbox, 
  Paper, IconButton, Tooltip, Slider, Autocomplete
} from '@mui/material';
import { FileDown, Search, Filter, RefreshCw, Calendar, Printer, History, Eye, Sliders, Settings } from 'lucide-react';
import api from '../../services/api';
import TransactionLink from '../../components/TransactionLink';
import Barcode from '../../components/Barcode';
import BarcodePrintDialog from '../../components/BarcodePrintDialog';
import TablePaginationBar, { usePagination } from '../../components/TablePaginationBar';
import { useAuthStore } from '../../store/authStore';

// Compact Code128 B pattern representation (width of alternate bars & spaces)
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "311123", "311321", "321122", "321221", "312212", // 20-29
  "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", // 30-39
  "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", // 40-49
  "313121", "211331", "231131", "213113", "213311", "213131", "311132", "311312", "112214", "112412", // 50-59
  "142212", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "242111", // 60-69
  "212114", "212411", "251111", "211142", "211412", "221113", "221311", "221113", "234111", "111242", // 70-79
  "111421", "121142", "121421", "141122", "141221", "112213", "121113", "121311", "302011", "301120", // 80-89
  "301210", "312010", "311200", "321100", "312200", "322100", "212021", "212120", "212210", "211022", // 90-99
  "220012", "200212", "200221", // 100-102
  "211412", "211214", "211232", "2331112" // 103 (Start A), 104 (Start B), 105 (Start C), 106 (Stop)
];

// SVG formatting function for labels
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

export default function Reports() {
  const { user } = useAuthStore();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const tabParam = queryParams.get('tab');

  const [tabValue, setTabValue] = useState(tabParam ? parseInt(tabParam, 10) : 0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  
  // Filtering States (Applied)
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [excludeCompleted, setExcludeCompleted] = useState(true);
  const [syncingGrnIds, setSyncingGrnIds] = useState<Record<number, boolean>>({});
  
  // Bin capacity filters (Applied)
  const [zoneFilter, setZoneFilter] = useState('');
  const [binFilter, setBinFilter] = useState('');
  const [itemGroupFilter, setItemGroupFilter] = useState('');
  const [availableCapacityMin, setAvailableCapacityMin] = useState('');
  const [emptyBinsOnly, setEmptyBinsOnly] = useState(false);

  // Input States (Typing/Selecting)
  const [searchInput, setSearchInput] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [warehouseInput, setWarehouseInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [excludeCompletedInput, setExcludeCompletedInput] = useState(true);

  // Bin capacity input states
  const [zoneInput, setZoneInput] = useState('');
  const [binInput, setBinInput] = useState('');
  const [itemGroupInput, setItemGroupInput] = useState('');
  const [availableCapacityMinInput, setAvailableCapacityMinInput] = useState('');
  const [emptyBinsOnlyInput, setEmptyBinsOnlyInput] = useState(false);

  const [error, setError] = useState('');
  const pagination = usePagination(25);

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setStartDate(startDateInput);
    setEndDate(endDateInput);
    setWarehouseFilter(warehouseInput);
    setStatusFilter(statusInput);
    setExcludeCompleted(excludeCompletedInput);

    setZoneFilter(zoneInput);
    setBinFilter(binInput);
    setItemGroupFilter(itemGroupInput);
    setAvailableCapacityMin(availableCapacityMinInput);
    setEmptyBinsOnly(emptyBinsOnlyInput);

    pagination.resetPage();
  };

  const handleClear = () => {
    setSearchInput('');
    setStartDateInput('');
    setEndDateInput('');
    setWarehouseInput('');
    setStatusInput('');
    setExcludeCompletedInput(true);

    setZoneInput('');
    setBinInput('');
    setItemGroupInput('');
    setAvailableCapacityMinInput('');
    setEmptyBinsOnlyInput(false);

    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setWarehouseFilter('');
    setStatusFilter('');
    setExcludeCompleted(true);

    setZoneFilter('');
    setBinFilter('');
    setItemGroupFilter('');
    setAvailableCapacityMin('');
    setEmptyBinsOnly(false);

    pagination.resetPage();
  };

  // History Dialog States (Drill-down for Pending Quantity)
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyType, setHistoryType] = useState<'SO' | 'PO'>('SO');
  const [selectedOrderCode, setSelectedOrderCode] = useState('');

  // Barcode Printing popup states (For Stock status ledger)
  const [barcodePrintOpen, setBarcodePrintOpen] = useState(false);
  const [selectedLedgerRow, setSelectedLedgerRow] = useState<any>(null);

  // Barcode Management Tab States
  const [itemsSearchQuery, setItemsSearchQuery] = useState('');
  const [itemsList, setItemsList] = useState<any[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selectedItemObject, setSelectedItemObject] = useState<any | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [customText, setCustomText] = useState<string>('');
  const [customDesc, setCustomDesc] = useState<string>('');
  const [customBatch, setCustomBatch] = useState<string>('');
  const [generatorType, setGeneratorType] = useState<'Code128' | 'EAN13' | 'QRCode'>(() => {
    return (localStorage.getItem('wms_default_barcode_type') as any) || 'Code128';
  });
  const [generatorWidth, setGeneratorWidth] = useState<number>(() => {
    const saved = localStorage.getItem('wms_default_barcode_width');
    return saved ? parseInt(saved, 10) : 2;
  });
  const [generatorHeight, setGeneratorHeight] = useState<number>(() => {
    const saved = localStorage.getItem('wms_default_barcode_height');
    return saved ? parseInt(saved, 10) : 60;
  });
  const [generatorLabelSize, setGeneratorLabelSize] = useState<string>(() => {
    return localStorage.getItem('wms_default_label_size') || '3x2';
  });
  const [generatorQty, setGeneratorQty] = useState<number>(1);
  const [includeTextCustom, setIncludeTextCustom] = useState<boolean>(true);

  // ASN Reports States
  const [asnReportView, setAsnReportView] = useState('summary');
  const [replenishmentView, setReplenishmentView] = useState('live');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const loadReport = async (tabIndex: number) => {
    if (tabIndex === 5) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    
    let endpoint = '/reports/stock';
    if (tabIndex === 1) endpoint = '/reports/pending-so';
    else if (tabIndex === 2) endpoint = '/reports/pending-po';
    else if (tabIndex === 3) endpoint = '/reports/created-grns';
    else if (tabIndex === 4) endpoint = '/reports/audit-logs';
    else if (tabIndex === 6) endpoint = '/reports/bin-capacity';
    else if (tabIndex === 7) endpoint = '/inbound/asn/reports';
    else if (tabIndex === 8) {
      endpoint = replenishmentView === 'live' ? '/reports/replenishment' : '/reports/replenishment/logs';
    }

    try {
      const res = await api.get(endpoint, {
        params: {
          page: pagination.page,
          limit: pagination.rowsPerPage,
          search: searchQuery,
          startDate,
          endDate,
          warehouseCode: warehouseFilter,
          status: statusFilter,
          excludeCompleted,
          zone: zoneFilter,
          binCode: binFilter,
          itemGroup: itemGroupFilter,
          minCapacity: availableCapacityMin,
          emptyBinsOnly,
          asnReportView,
          replenishmentView
        }
      });
      
      // The backend returns { items, total }
      setData(res.data.items || []);
      setTotalRows(res.data.total || 0);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch report data.');
      setLoading(false);
    }
  };

  // Declarative unified reactive effect for data fetching
  useEffect(() => {
    if (tabValue === 5) {
      setLoading(false);
      return;
    }
    loadReport(tabValue);
  }, [
    tabValue,
    pagination.page,
    pagination.rowsPerPage,
    searchQuery,
    startDate,
    endDate,
    warehouseFilter,
    statusFilter,
    excludeCompleted,
    zoneFilter,
    binFilter,
    itemGroupFilter,
    availableCapacityMin,
    emptyBinsOnly,
    asnReportView,
    replenishmentView
  ]);

  useEffect(() => {
    if (tabParam !== null) {
      const parsed = parseInt(tabParam, 10);
      if (!isNaN(parsed) && parsed !== tabValue) {
        setTabValue(parsed);
      }
    }
  }, [tabParam]);

  useEffect(() => {
    pagination.resetPage();
    // Reset inputs
    setSearchInput('');
    setStartDateInput('');
    setEndDateInput('');
    setWarehouseInput('');
    setStatusInput('');
    setExcludeCompletedInput(true);
    setZoneInput('');
    setBinInput('');
    setItemGroupInput('');
    setAvailableCapacityMinInput('');
    setEmptyBinsOnlyInput(false);

    // Reset applied filters
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setWarehouseFilter('');
    setStatusFilter('');
    setExcludeCompleted(true);
    setZoneFilter('');
    setBinFilter('');
    setItemGroupFilter('');
    setAvailableCapacityMin('');
    setEmptyBinsOnly(false);
    setReplenishmentView('live');
  }, [tabValue]);

  useEffect(() => {
    pagination.resetPage();
  }, [asnReportView, replenishmentView]);

  // Load warehouses on mount
  useEffect(() => {
    api.get('/masters/warehouses')
      .then(res => setWarehouses(res.data))
      .catch(err => console.error('Failed to load warehouses', err));
  }, []);

  // Async search items catalogue when typing in Barcode Label Generator search input (tab 4)
  useEffect(() => {
    if (tabValue !== 4) return;
    if (!itemsSearchQuery.trim()) {
      setItemsList([]);
      return;
    }
    const delayDebounce = setTimeout(() => {
      setItemsLoading(true);
      api.get('/masters/items', {
        params: {
          search: itemsSearchQuery,
          lightweight: true,
          page: 0,
          limit: 50
        }
      })
        .then(res => {
          const items = res.data.items || res.data || [];
          setItemsList(items);
          setItemsLoading(false);
        })
        .catch(err => {
          console.error(err);
          setItemsLoading(false);
        });
    }, 400); // 400ms debounce
    return () => clearTimeout(delayDebounce);
  }, [itemsSearchQuery, tabValue]);

  // Synchronize warehouse filter with active warehouse from navbar
  useEffect(() => {
    if (user?.warehouseId && warehouses.length > 0) {
      const activeWh = warehouses.find(w => String(w.WarehouseId) === String(user.warehouseId));
      if (activeWh) {
        setWarehouseFilter(activeWh.Code);
      }
    } else if (user?.warehouseId === null || user?.warehouseId === undefined) {
      setWarehouseFilter('');
    }
  }, [user?.warehouseId, warehouses]);



  useEffect(() => {
    if (tabValue === 5) {
      localStorage.setItem('wms_default_barcode_type', generatorType);
      localStorage.setItem('wms_default_barcode_width', generatorWidth.toString());
      localStorage.setItem('wms_default_barcode_height', generatorHeight.toString());
      localStorage.setItem('wms_default_label_size', generatorLabelSize);
    }
  }, [generatorType, generatorWidth, generatorHeight, generatorLabelSize, tabValue]);

  // Extract unique options dynamically from data for filter dropdowns
  const getUniqueOptions = (field: string) => {
    const vals = data.map(row => row[field]).filter(Boolean);
    return Array.from(new Set(vals)).sort() as string[];
  };

  const uniqueCustomers = getUniqueOptions('CustomerName');
  const uniqueVendors = getUniqueOptions('VendorName');
  const uniqueItems = getUniqueOptions('ItemName');
  const uniqueWarehouses = getUniqueOptions('WarehouseCode');

  // Helper for ASN data grouping and formatting
  const getProcessedASNData = () => {
    if (tabValue !== 7) return filteredData;

    if (asnReportView === 'summary' || asnReportView === 'status' || asnReportView === 'date') {
      const groups: Record<string, any> = {};
      filteredData.forEach(row => {
        const key = row.ASNNumber;
        if (!groups[key]) {
          groups[key] = {
            ASNId: row.ASNId,
            ASNNumber: row.ASNNumber,
            SupplierName: row.SupplierName,
            VendorName: row.VendorName,
            POCode: row.POCode,
            POId: row.POId,
            ExpectedArrivalDate: row.ExpectedArrivalDate,
            Transporter: row.Transporter,
            Status: row.ASNStatus,
            ExpectedQty: 0,
            ReceivedQty: 0
          };
        }
        groups[key].ExpectedQty += parseFloat(row.ExpectedQty || 0);
        groups[key].ReceivedQty += parseFloat(row.ReceivedQty || 0);
      });
      return Object.values(groups);
    }
    
    if (asnReportView === 'pending') {
      return filteredData.filter(row => parseFloat(row.ExpectedQty || 0) - parseFloat(row.ReceivedQty || 0) > 0);
    }
    
    if (asnReportView === 'variance') {
      return filteredData;
    }
    
    if (asnReportView === 'supplier') {
      const groups: Record<string, any> = {};
      filteredData.forEach(row => {
        const key = row.SupplierName;
        if (!groups[key]) {
          groups[key] = {
            SupplierName: row.SupplierName,
            VendorName: row.VendorName,
            ASNCountSet: new Set(),
            ExpectedQty: 0,
            ReceivedQty: 0
          };
        }
        groups[key].ASNCountSet.add(row.ASNNumber);
        groups[key].ExpectedQty += parseFloat(row.ExpectedQty || 0);
        groups[key].ReceivedQty += parseFloat(row.ReceivedQty || 0);
      });
      return Object.values(groups).map((g: any) => ({
        SupplierName: g.SupplierName,
        VendorName: g.VendorName,
        ASNCount: g.ASNCountSet.size,
        ExpectedQty: g.ExpectedQty,
        ReceivedQty: g.ReceivedQty
      }));
    }

    return filteredData;
  };

  const getSourceData = () => {
    return tabValue === 7 ? getProcessedASNData() : filteredData;
  };

  // Multi-field Filtering logic (now handled on the server)
  const filteredData = data;

  const finalReportData = getProcessedASNData();

  // Export headers and keys selectors
  const getHeaderList = () => {
    switch (tabValue) {
      case 0:
        return ['Warehouse', 'Bin Location', 'Item Description', 'Item Code', 'Batch Number', 'Total Qty', 'Reserved Qty', 'Available Qty'];
      case 1:
        return ['Sales Order No', 'Sales Order Date', 'Customer Name', 'Item Code', 'Item Name', 'Ordered Qty', 'Dispatched Qty', 'Pending Qty', 'Dispatch Status', 'Warehouse', 'Ageing Days'];
      case 2:
        return ['Purchase Order No', 'Purchase Order Date', 'Vendor Name', 'Item Code', 'Item Name', 'Ordered Qty', 'Received Qty', 'Pending Qty', 'Receipt Status', 'Warehouse', 'Ageing Days'];
      case 3:
        return ['GRN Code', 'GRN Date', 'Invoice No', 'PO Code', 'Received By', 'Status', 'Sync Status'];
      case 4:
        return ['Log ID', 'User', 'Action', 'Table Affected', 'IP Address', 'Date/Time'];
      case 6:
        return ['Bin Code', 'Warehouse', 'Current Items', 'Max Weight', 'Occupied Weight', 'Available Weight', 'Max Volume', 'Occupied Volume', 'Available Volume', 'Status', 'Weight Occupancy %', 'Volume Occupancy %'];
      case 7:
        if (asnReportView === 'summary') return ['ASN Number', 'Supplier', 'PO Ref', 'Expected Arrival', 'Transporter', 'Expected Qty', 'Received Qty', 'Status'];
        if (asnReportView === 'status') return ['ASN Number', 'Supplier', 'PO Ref', 'Expected Arrival', 'Transporter', 'Status'];
        if (asnReportView === 'pending') return ['ASN Number', 'Supplier', 'Expected Arrival', 'Item Code', 'Item Name', 'Expected Qty', 'Received Qty', 'Pending Qty'];
        if (asnReportView === 'variance') return ['ASN Number', 'Supplier', 'Expected Arrival', 'Item Code', 'Item Name', 'Expected Qty', 'Received Qty', 'Variance Qty'];
        if (asnReportView === 'supplier') return ['Supplier Name', 'Total ASNs', 'Total Expected Qty', 'Total Received Qty'];
        if (asnReportView === 'date') return ['Expected Date', 'ASN Number', 'Supplier', 'Expected Qty', 'Status'];
        return [];
      case 8:
        if (replenishmentView === 'logs') {
          return ['Date Created', 'Item Code', 'Item Name', 'Category', 'UOM', 'Alert Type', 'Current Stock', 'Threshold Limit', 'Reference Doc', 'Status', 'Date Resolved'];
        }
        return ['Item Code', 'Item Name', 'Category', 'UOM', 'Current Stock', 'Min Stock', 'Max Stock', 'Available Storage Space', 'Reorder Target Qty', 'Feasible Qty', 'Status'];
      default:
        return [];
    }
  };

  const getKeysList = () => {
    switch (tabValue) {
      case 0:
        return ['WarehouseCode', 'BinCode', 'ItemName', 'ItemCode', 'BatchNumber', 'Quantity', 'ReservedQty', 'AvailableQty'];
      case 1:
        return ['SOCode', 'OrderDate', 'CustomerName', 'ItemCode', 'ItemName', 'OrderQty', 'ShippedQty', 'PendingQty', 'Status', 'WarehouseCode', 'AgeingDays'];
      case 2:
        return ['POCode', 'OrderDate', 'VendorName', 'ItemCode', 'ItemName', 'OrderQty', 'ReceivedQty', 'PendingQty', 'Status', 'WarehouseCode', 'AgeingDays'];
      case 3:
        return ['GRNCode', 'ReceivedDate', 'InvoiceNo', 'POCode', 'OperatorName', 'Status', 'IsSynced'];
      case 4:
        return ['AuditId', 'Username', 'Action', 'TableName', 'IPAddress', 'Timestamp'];
      case 6:
        return ['BinCode', 'WarehouseName', 'CurrentItems', 'CapacityWeight', 'OccupiedWeight', 'AvailableWeight', 'CapacityVolume', 'OccupiedVolume', 'AvailableVolume', 'BinStatus', 'WeightOccupancyPercent', 'VolumeOccupancyPercent'];
      case 7:
        if (asnReportView === 'summary') return ['ASNNumber', 'SupplierName', 'POCode', 'ExpectedArrivalDate', 'Transporter', 'ExpectedQty', 'ReceivedQty', 'Status'];
        if (asnReportView === 'status') return ['ASNNumber', 'SupplierName', 'POCode', 'ExpectedArrivalDate', 'Transporter', 'Status'];
        if (asnReportView === 'pending') return ['ASNNumber', 'SupplierName', 'ExpectedArrivalDate', 'ItemCode', 'ItemName', 'ExpectedQty', 'ReceivedQty', 'PendingQty'];
        if (asnReportView === 'variance') return ['ASNNumber', 'SupplierName', 'ExpectedArrivalDate', 'ItemCode', 'ItemName', 'ExpectedQty', 'ReceivedQty', 'PendingQty'];
        if (asnReportView === 'supplier') return ['SupplierName', 'ASNCount', 'ExpectedQty', 'ReceivedQty'];
        if (asnReportView === 'date') return ['ExpectedArrivalDate', 'ASNNumber', 'SupplierName', 'ExpectedQty', 'Status'];
        return [];
      case 8:
        if (replenishmentView === 'logs') {
          return ['CreatedAt', 'ItemCode', 'ItemName', 'Category', 'UOM', 'AlertType', 'CurrentStock', 'ThresholdValue', 'ReferenceDoc', 'Status', 'ResolvedAt'];
        }
        return ['ItemCode', 'ItemName', 'Category', 'UOM', 'TotalStock', 'MinStock', 'MaxStock', 'AvailableStorageSpace', 'ReorderQty', 'FeasibleQty', 'StockStatus'];
      default:
        return [];
    }
  };

  // CSV Export
  const exportCSV = () => {
    const reportNames = ['Stock_Status_Ledger', 'Pending_Sales_Order_Report', 'Pending_Purchase_Order_Report', 'GRNs_Report', 'System_Security_Audit_Trail', '', 'Bin_Capacity_Report', `ASN_${asnReportView}_Report`, 'Replenishment_And_Reorder_Alerts'];
    const headers = getHeaderList();
    const keys = getKeysList();
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += headers.join(",") + "\r\n";
    
    getSourceData().forEach((row) => {
      const line = keys.map(key => {
        let val = row[key];
        if (tabValue === 3 && key === 'Status' && val === 'PENDING') {
          val = 'GRN_CREATED';
        }
        if (typeof val === 'string') {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val === undefined || val === null ? '' : val;
      });
      csvContent += line.join(",") + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${reportNames[tabValue] || 'Report'}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PDF & Print Report
  const handlePrint = () => {
    const titles = ['Stock Status Ledger', 'Pending Sales Order Report', 'Pending Purchase Order Report', 'GRNs Report', 'System Security Audit Trail', '', 'Bin Capacity Utilization Report', `ASN ${asnReportView.toUpperCase()} Report`, 'Replenishment & Reorder Alerts'];
    const headers = getHeaderList();
    const keys = getKeysList();
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    let html = `
      <html>
        <head>
          <title>BusyWMS - ${titles[tabValue]}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #333; }
            h1 { text-align: left; color: #1e293b; margin-bottom: 5px; font-size: 24px; font-weight: 700; }
            .subtitle { text-align: left; color: #64748b; font-size: 13px; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 11px; }
            th { background-color: #f1f5f9; font-weight: 600; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .footer { margin-top: 30px; text-align: right; font-size: 9px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          </style>
        </head>
        <body>
          <h1>BusyWMS - ${titles[tabValue]}</h1>
          <div class="subtitle">Generated on ${new Date().toLocaleString()} | Filtered Records Count: ${getSourceData().length}</div>
          <table>
            <thead>
              <tr>
                ${headers.map(h => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${getSourceData().map(row => `
                <tr>
                  ${keys.map(key => {
                    let val = row[key];
                    if (key === 'Timestamp' && val) return `<td>${new Date(val).toLocaleString()}</td>`;
                    if ((key === 'OrderDate' || key === 'ExpectedArrivalDate') && val) return `<td>${new Date(val).toLocaleDateString()}</td>`;
                    return `<td>${val !== undefined && val !== null ? val : 'N/A'}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">Confidential | BusyWMS Audit & Analytics Engine</div>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  };

  // Open history log dialog (GRN history for PO, Dispatch history for SO)
  const openHistory = async (row: any, type: 'SO' | 'PO') => {
    setHistoryLoading(true);
    setHistoryType(type);
    setSelectedOrderCode(type === 'SO' ? row.SOCode : row.POCode);
    setHistoryModalOpen(true);
    
    try {
      const id = type === 'SO' ? row.SOId : row.POId;
      const endpoint = type === 'SO' 
        ? `/reports/so-dispatch-history/${id}` 
        : `/reports/po-grn-history/${id}`;
        
      const res = await api.get(endpoint);
      setHistoryData(res.data);
      setHistoryLoading(false);
    } catch (err) {
      console.error(err);
      setHistoryLoading(false);
    }
  };

  const handlePrintBarcodeClick = (row: any) => {
    setSelectedLedgerRow(row);
    setBarcodePrintOpen(true);
  };

  const handleSyncGRN = async (grnId: number) => {
    setSyncingGrnIds(prev => ({ ...prev, [grnId]: true }));
    try {
      await api.post(`/inbound/grn/sync/${grnId}`);
      // Refresh the report data to show the updated status
      loadReport(tabValue);
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || 'Sync failed');
    } finally {
      setSyncingGrnIds(prev => ({ ...prev, [grnId]: false }));
    }
  };

  // Custom code print trigger for Barcode management tab
  const handlePrintGeneratorLabels = () => {
    if (!customText) {
      alert('Please enter a barcode text code to print.');
      return;
    }
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let widthStyle = '3in';
    let heightStyle = '2in';
    if (generatorLabelSize === '2x1') {
      widthStyle = '2in';
      heightStyle = '1in';
    } else if (generatorLabelSize === '4x3') {
      widthStyle = '4in';
      heightStyle = '3in';
    }

    const qrSize = generatorLabelSize === '2x1' ? 70 : 110;
    const isQR = generatorType === 'QRCode';

    let labelHtml = '';
    for (let idx = 0; idx < generatorQty; idx++) {
      labelHtml += `
        <div class="label-sheet">
          <div class="label-content ${isQR ? 'qr-layout' : ''}">
            <div class="label-info">
              <div class="item-name">${customDesc || 'WMS Location Label'}</div>
              <div class="item-code">Code: ${customText}</div>
              ${customBatch ? `<div class="item-batch">Batch: ${customBatch}</div>` : ''}
            </div>
            <div class="barcode-wrapper">
              ${
                isQR 
                ? `<img src="https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(customText)}" />`
                : generatorType === 'EAN13' && customText.replace(/\D/g, '').length === 13
                  ? `<img src="https://bwipjs-api.metafloor.com/?bcid=ean13&text=${customText.replace(/\D/g, '')}&scale=2&height=${generatorHeight}&includetext" />`
                  : `<div class="native-code128">${renderNativeCode128SvgHtml(customText, generatorWidth, generatorHeight, includeTextCustom)}</div>`
              }
            </div>
          </div>
        </div>
      `;
    }

    const html = `
      <html>
        <head>
          <title>Print Custom Labels</title>
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

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Analytics & WMS Reports</Typography>
          <Typography variant="body2" color="text.secondary">
            Query stock status ledger, pending orders, partial dispatch tracking, and generate barcode labels.
          </Typography>
        </Box>
        {tabValue !== 5 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<Printer size={14} />} onClick={handlePrint}>Print / PDF</Button>
            <Button variant="outlined" startIcon={<FileDown size={14} />} onClick={exportCSV}>Export CSV</Button>
            <Button variant="contained" startIcon={<RefreshCw size={14} />} onClick={() => loadReport(tabValue)}>Refresh</Button>
          </Box>
        )}
      </Box>

      {/* Tabs Layout */}
      <Tabs 
        value={tabValue} 
        onChange={(e, val) => setTabValue(val)} 
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab label="Stock Status Ledger" />
        <Tab label="Pending Sales Orders" />
        <Tab label="Pending Purchase Orders" />
        <Tab label="Created GRNs" />
        <Tab label="Security Audit Trail" />
        <Tab label="Barcode Label Generator" />
        <Tab label="Bin Capacity & Suitability" />
        <Tab label="ASN Inbound Notices" />
        <Tab label="Reorder & Stock Alerts" />
      </Tabs>

      {tabValue !== 5 ? (
        <>
          {/* Dynamic Filter Panel */}
          <Card sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <Grid container spacing={2} alignItems="center">
              {/* General Text Search */}
              <Grid item xs={12} sm={3}>
                <TextField
                  placeholder="Search by keywords..."
                  size="small"
                  fullWidth
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search size={16} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>

              {/* Date Range filters */}
              <Grid item xs={12} sm={2.2}>
                <TextField
                  label="Start Date"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: new Date().toISOString().split('T')[0] }}
                  value={startDateInput}
                  onChange={(e) => setStartDateInput(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Calendar size={14} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={2.2}>
                <TextField
                  label="End Date"
                  type="date"
                  size="small"
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: new Date().toISOString().split('T')[0], min: startDateInput }}
                  value={endDateInput}
                  onChange={(e) => setEndDateInput(e.target.value)}
                  disabled={!startDateInput}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Calendar size={14} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>

               {/* Warehouse selection */}
              <Grid item xs={12} sm={2.3}>
                <FormControl fullWidth size="small">
                  <InputLabel id="warehouse-filter-label">Warehouse</InputLabel>
                  <Select
                    labelId="warehouse-filter-label"
                    id="warehouse-filter-select"
                    value={warehouseInput}
                    label="Warehouse"
                    onChange={(e) => setWarehouseInput(e.target.value)}
                  >
                    <MenuItem value="">All Warehouses</MenuItem>
                    {warehouses.map((wh) => (
                      <MenuItem key={wh.Code} value={wh.Code}>
                        {wh.Name} ({wh.Code})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Conditional filters based on Active Tab */}


              {tabValue === 7 && (
                <>
                  <Grid item xs={12} sm={3}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="asn-view-filter-label">ASN Report View</InputLabel>
                      <Select
                        labelId="asn-view-filter-label"
                        id="asn-view-filter-select"
                        value={asnReportView}
                        label="ASN Report View"
                        onChange={(e) => setAsnReportView(e.target.value)}
                      >
                        <MenuItem value="summary">ASN Summary</MenuItem>
                        <MenuItem value="status">ASN Status Report</MenuItem>
                        <MenuItem value="pending">Pending Receipts</MenuItem>
                        <MenuItem value="variance">Received vs Expected Qty</MenuItem>
                        <MenuItem value="supplier">Supplier-wise ASN Report</MenuItem>
                        <MenuItem value="date">Date-wise ASN Report</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  {['summary', 'status', 'date'].includes(asnReportView) && (
                    <Grid item xs={12} sm={3}>
                      <FormControl fullWidth size="small">
                        <InputLabel id="asn-status-filter-label">ASN Status</InputLabel>
                        <Select
                          labelId="asn-status-filter-label"
                          id="asn-status-filter-select"
                          value={statusInput}
                          label="ASN Status"
                          onChange={(e) => setStatusInput(e.target.value)}
                        >
                          <MenuItem value="">All Statuses</MenuItem>
                          <MenuItem value="Draft">Draft</MenuItem>
                          <MenuItem value="Confirmed">Confirmed</MenuItem>
                          <MenuItem value="In Transit">In Transit</MenuItem>
                          <MenuItem value="Partially Received">Partially Received</MenuItem>
                          <MenuItem value="Fully Received">Fully Received</MenuItem>
                          <MenuItem value="Cancelled">Cancelled</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  )}
                </>
              )}

              {tabValue === 8 && (
                <Grid item xs={12} sm={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="replenishment-view-filter-label">Report View</InputLabel>
                    <Select
                      labelId="replenishment-view-filter-label"
                      id="replenishment-view-filter-select"
                      value={replenishmentView}
                      label="Report View"
                      onChange={(e) => setReplenishmentView(e.target.value)}
                    >
                      <MenuItem value="live">Live Alerts</MenuItem>
                      <MenuItem value="logs">Alert Audit Log</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              )}

              {(tabValue === 1 || tabValue === 2 || tabValue === 3 || tabValue === 8) && (
                <Grid item xs={12} sm={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="status-filter-label">Status</InputLabel>
                    <Select
                      labelId="status-filter-label"
                      id="status-filter-select"
                      value={statusInput}
                      label="Status"
                      onChange={(e) => setStatusInput(e.target.value)}
                    >
                      {tabValue === 8 ? (
                        <>
                          <MenuItem value="ALL_ALERTS">All Alerts</MenuItem>
                          <MenuItem value="BELOW_MIN">Below Min Stock</MenuItem>
                          <MenuItem value="ABOVE_MAX">Above Max Stock</MenuItem>
                          <MenuItem value="ALL">All Items</MenuItem>
                        </>
                      ) : (
                        <>
                          <MenuItem value="">All Statuses</MenuItem>
                          {tabValue === 1 ? (
                            <>
                              <MenuItem value="Pending">Pending</MenuItem>
                              <MenuItem value="Partially Dispatched">Partially Dispatched</MenuItem>
                              <MenuItem value="Fully Dispatched">Fully Dispatched</MenuItem>
                            </>
                          ) : tabValue === 2 ? (
                            <>
                              <MenuItem value="Pending">Pending</MenuItem>
                              <MenuItem value="Partially Received">Partially Received</MenuItem>
                              <MenuItem value="Fully Received">Fully Received</MenuItem>
                            </>
                          ) : (
                            <>
                              <MenuItem value="PENDING">GRN_CREATED</MenuItem>
                              <MenuItem value="QC_COMPLETED">QC Completed</MenuItem>
                              <MenuItem value="PUTAWAY_COMPLETED">Putaway Completed</MenuItem>
                            </>
                          )}
                        </>
                      )}
                    </Select>
                  </FormControl>
                </Grid>
              )}



              {(tabValue === 1 || tabValue === 2) && (
                <Grid item xs={12} sm={3}>
                  <FormControlLabel
                    control={
                      <Checkbox 
                        checked={excludeCompletedInput} 
                        onChange={(e) => setExcludeCompletedInput(e.target.checked)} 
                        color="primary"
                      />
                    }
                    label={tabValue === 1 ? "Exclude fully dispatched" : "Exclude fully received"}
                  />
                </Grid>
              )}

              {tabValue === 5 && (
                <>
                  <Grid item xs={12} sm={2.3}>
                    <TextField
                      label="Zone"
                      placeholder="Filter by zone..."
                      size="small"
                      fullWidth
                      value={zoneInput}
                      onChange={(e) => setZoneInput(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={2.3}>
                    <TextField
                      label="Bin Code"
                      placeholder="Filter by bin..."
                      size="small"
                      fullWidth
                      value={binInput}
                      onChange={(e) => setBinInput(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={2.3}>
                    <TextField
                      label="Item Group (Category)"
                      placeholder="Filter by category..."
                      size="small"
                      fullWidth
                      value={itemGroupInput}
                      onChange={(e) => setItemGroupInput(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={2.3}>
                    <TextField
                      label="Min Available Capacity"
                      type="number"
                      placeholder="Min kg/L..."
                      size="small"
                      fullWidth
                      value={availableCapacityMinInput}
                      onChange={(e) => setAvailableCapacityMinInput(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={2.3}>
                    <FormControlLabel
                      control={
                        <Checkbox 
                          checked={emptyBinsOnlyInput} 
                          onChange={(e) => setEmptyBinsOnlyInput(e.target.checked)} 
                        />
                      }
                      label="Empty Bins Only"
                    />
                  </Grid>
                </>
              )}

              {/* Search & Clear Buttons */}
              <Grid item xs={12} sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                <Button variant="contained" onClick={handleSearch} sx={{ fontWeight: 600 }}>
                  Search
                </Button>
                <Button variant="outlined" color="secondary" onClick={handleClear} sx={{ fontWeight: 600 }}>
                  Clear
                </Button>
              </Grid>
            </Grid>
          </Card>

          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          {tabValue === 6 && !loading && (
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={3}>
                <Card sx={{ p: 2, bgcolor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderStyle: 'solid', boxShadow: 'none' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                    Total Bins Checked
                  </Typography>
                  <Typography variant="h4" fontWeight={800} color="primary.main">
                    {totalRows} Bins
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Filtered locator count
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={2.25}>
                <Card sx={{ p: 2, bgcolor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1, borderStyle: 'solid', boxShadow: 'none' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                    Empty Bins (This Page)
                  </Typography>
                  <Typography variant="h4" fontWeight={800} sx={{ color: 'green' }}>
                    {filteredData.filter((b: any) => b.BinStatus === 'Empty').length} Bins
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Ready for fast allocation
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={2.25}>
                <Card sx={{ p: 2, bgcolor: '#fffbeb', borderColor: '#fef08a', borderWidth: 1, borderStyle: 'solid', boxShadow: 'none' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                    Partially Occupied (This Page)
                  </Typography>
                  <Typography variant="h4" fontWeight={800} sx={{ color: '#b45309' }}>
                    {filteredData.filter((b: any) => b.BinStatus === 'Partially Occupied').length} Bins
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Has remaining space
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={2.25}>
                <Card sx={{ p: 2, bgcolor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1, borderStyle: 'solid', boxShadow: 'none' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                    Full Bins (This Page)
                  </Typography>
                  <Typography variant="h4" fontWeight={800} color="error.main">
                    {filteredData.filter((b: any) => b.BinStatus === 'Full').length} Bins
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    No more capacity available
                  </Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={2.25}>
                <Card sx={{ p: 2, bgcolor: '#faf5ff', borderColor: '#e9d5ff', borderWidth: 1, borderStyle: 'solid', boxShadow: 'none' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
                    Avg Weight Utilization (This Page)
                  </Typography>
                  <Typography variant="h4" fontWeight={800} color="secondary.main">
                    {(filteredData.reduce((acc: number, b: any) => acc + Number(b.WeightOccupancyPercent || 0), 0) / (filteredData.length || 1)).toFixed(1)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Overall weight utilization
                  </Typography>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Main Table View */}
          <Card sx={{ border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
            <TableContainer sx={{ maxHeight: 600 }}>
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
              ) : (
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      {tabValue === 0 && (
                        <>
                          <TableCell sx={{ fontWeight: 600 }}>Warehouse</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Bin Location</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Batch Number</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Total Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Reserved</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Available Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                        </>
                      )}
                      {tabValue === 1 && (
                        <>
                          <TableCell sx={{ fontWeight: 600 }}>Sales Order No</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Sales Order Date</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Customer Name</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Ordered Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Dispatched Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Pending Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Dispatch Status</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Warehouse</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Ageing Days</TableCell>
                        </>
                      )}
                      {tabValue === 2 && (
                        <>
                          <TableCell sx={{ fontWeight: 600 }}>Purchase Order No</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Purchase Order Date</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Vendor Name</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Ordered Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Received Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Pending Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Receipt Status</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Warehouse</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Ageing Days</TableCell>
                        </>
                      )}
                      {tabValue === 3 && (
                        <>
                          <TableCell sx={{ fontWeight: 600 }}>GRN Code</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>GRN Date</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Invoice No</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>PO Code</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Received By</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="center">Sync Status</TableCell>
                        </>
                      )}
                      {tabValue === 4 && (
                        <>
                          <TableCell sx={{ fontWeight: 600 }}>Log ID</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Table Affected</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>IP Address</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date/Time</TableCell>
                        </>
                      )}
                      {tabValue === 6 && (
                        <>
                          <TableCell sx={{ fontWeight: 600 }}>Bin Code</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Warehouse</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Current Item(s)</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Weight Capacity</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Volume Capacity</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Occupancy %</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Recommendation</TableCell>
                        </>
                      )}
                      {tabValue === 7 && (
                        <>
                          {asnReportView === 'summary' && (
                            <>
                              <TableCell sx={{ fontWeight: 600 }}>ASN Number</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Supplier</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>PO Ref</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Expected Arrival</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Transporter</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Expected Qty</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Received Qty</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            </>
                          )}
                          {asnReportView === 'status' && (
                            <>
                              <TableCell sx={{ fontWeight: 600 }}>ASN Number</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Supplier</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>PO Ref</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Expected Arrival</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Transporter</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            </>
                          )}
                          {asnReportView === 'pending' && (
                            <>
                              <TableCell sx={{ fontWeight: 600 }}>ASN Number</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Supplier</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Expected Arrival</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Expected Qty</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Received Qty</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Pending Qty</TableCell>
                            </>
                          )}
                          {asnReportView === 'variance' && (
                            <>
                              <TableCell sx={{ fontWeight: 600 }}>ASN Number</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Supplier</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Expected Arrival</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Expected Qty</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Received Qty</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Variance Qty</TableCell>
                            </>
                          )}
                          {asnReportView === 'supplier' && (
                            <>
                              <TableCell sx={{ fontWeight: 600 }}>Supplier Name</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Total ASNs</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Total Expected Qty</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Total Received Qty</TableCell>
                            </>
                          )}
                          {asnReportView === 'date' && (
                            <>
                              <TableCell sx={{ fontWeight: 600 }}>Expected Date</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>ASN Number</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Supplier</TableCell>
                              <TableCell sx={{ fontWeight: 600 }} align="right">Expected Qty</TableCell>
                              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                            </>
                          )}
                        </>
                      )}
                      {tabValue === 8 && replenishmentView === 'live' && (
                        <>
                          <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>UOM</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Current Stock</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Min Stock</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Max Stock</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Available Storage Space</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Reorder Target Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Feasible Qty</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                        </>
                      )}
                      {tabValue === 8 && replenishmentView === 'logs' && (
                        <>
                          <TableCell sx={{ fontWeight: 600 }}>Date Created</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Code</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Item Name</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>UOM</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Alert Type</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Current Stock</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">Threshold Limit</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Reference Doc</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date Resolved</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(() => {
                      const baseData = tabValue === 7 ? finalReportData : filteredData;
                      return baseData;
                    })().map((row: any, idx: number) => (
                      <TableRow key={idx} hover>
                        {/* Tab 0: Stock Ledger */}
                        {tabValue === 0 && (
                          <>
                            <TableCell>{row.WarehouseCode}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}><code>{row.BinCode}</code></TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{row.ItemName}</TableCell>
                            <TableCell>{row.ItemCode}</TableCell>
                            <TableCell>{row.BatchNumber ? <Chip size="small" label={row.BatchNumber} color="primary" variant="outlined" /> : 'N/A'}</TableCell>
                            <TableCell>{row.Quantity} {row.UOM}</TableCell>
                            <TableCell color="error.main">{row.ReservedQty} {row.UOM}</TableCell>
                            <TableCell sx={{ fontWeight: 700, color: 'success.main' }}>{row.AvailableQty} {row.UOM}</TableCell>
                            <TableCell>
                              <Button 
                                size="small" 
                                variant="outlined" 
                                startIcon={<Printer size={12} />}
                                onClick={() => handlePrintBarcodeClick(row)}
                              >
                                Print
                              </Button>
                            </TableCell>
                          </>
                        )}

                        {/* Tab 1: Pending Sales Orders */}
                        {tabValue === 1 && (
                          <>
                            <TableCell><TransactionLink type="SO" id={row.SOCode} /></TableCell>
                            <TableCell>{new Date(row.OrderDate).toLocaleDateString()}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              <TransactionLink type="SO" id={row.SOCode} label={row.CustomerName} />
                            </TableCell>
                            <TableCell><code>{row.ItemCode}</code></TableCell>
                            <TableCell>{row.ItemName}</TableCell>
                            <TableCell align="right">{row.OrderQty} {row.UOM}</TableCell>
                             <TableCell align="right">
                               <Tooltip title="Click to view dispatch history" arrow>
                                 <Typography 
                                   component="span"
                                   onClick={() => openHistory(row, 'SO')}
                                   sx={{
                                     cursor: 'pointer',
                                     color: 'primary.main',
                                     fontWeight: 700,
                                     textDecoration: 'underline',
                                     '&:hover': { color: 'primary.dark' }
                                   }}
                                 >
                                   {row.ShippedQty} {row.UOM}
                                 </Typography>
                               </Tooltip>
                             </TableCell>
                             <TableCell align="right">
                               <Tooltip title="Click to view dispatch history" arrow>
                                 <Typography 
                                   component="span"
                                   onClick={() => openHistory(row, 'SO')}
                                   sx={{
                                     cursor: 'pointer',
                                     color: 'primary.main',
                                     fontWeight: 700,
                                     textDecoration: 'underline',
                                     '&:hover': { color: 'primary.dark' }
                                   }}
                                 >
                                   {row.PendingQty} {row.UOM}
                                 </Typography>
                               </Tooltip>
                             </TableCell>
                             <TableCell>
                               <Tooltip title="Click to view dispatch history" arrow>
                                 <Chip 
                                   size="small" 
                                   label={row.Status} 
                                   onClick={() => openHistory(row, 'SO')}
                                   color={row.Status === 'Fully Dispatched' ? 'success' : row.Status === 'Partially Dispatched' ? 'warning' : 'default'}
                                   sx={{ fontWeight: 600, cursor: 'pointer' }}
                                 />
                               </Tooltip>
                             </TableCell>
                            <TableCell>{row.WarehouseCode}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, color: row.AgeingDays > 5 ? 'error.main' : 'text.primary' }}>
                              {row.AgeingDays} days
                            </TableCell>
                          </>
                        )}

                        {/* Tab 2: Pending Purchase Orders */}
                        {tabValue === 2 && (
                          <>
                            <TableCell><TransactionLink type="PO" id={row.POCode} /></TableCell>
                            <TableCell>{new Date(row.OrderDate).toLocaleDateString()}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>
                              <TransactionLink type="PO" id={row.POCode} label={row.VendorName} />
                            </TableCell>
                            <TableCell><code>{row.ItemCode}</code></TableCell>
                            <TableCell>{row.ItemName}</TableCell>
                            <TableCell align="right">{row.OrderQty} {row.UOM}</TableCell>
                            <TableCell align="right">{row.ReceivedQty} {row.UOM}</TableCell>
                            <TableCell align="right">
                              <Tooltip title="Click to view GRN history" arrow>
                                <Typography 
                                  component="span"
                                  onClick={() => openHistory(row, 'PO')}
                                  sx={{
                                    cursor: 'pointer',
                                    color: 'primary.main',
                                    fontWeight: 700,
                                    textDecoration: 'underline',
                                    '&:hover': { color: 'primary.dark' }
                                  }}
                                >
                                  {row.PendingQty} {row.UOM}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                label={row.Status} 
                                color={row.Status === 'Fully Received' ? 'success' : row.Status === 'Partially Received' ? 'warning' : 'default'}
                                sx={{ fontWeight: 600 }}
                              />
                            </TableCell>
                            <TableCell>{row.WarehouseCode}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, color: row.AgeingDays > 5 ? 'error.main' : 'text.primary' }}>
                              {row.AgeingDays} days
                            </TableCell>
                          </>
                        )}

                        {/* Tab 3: GRNs */}
                        {tabValue === 3 && (
                          <>
                            <TableCell><TransactionLink type="GRN" id={row.GRNCode} /></TableCell>
                            <TableCell>{new Date(row.ReceivedDate).toLocaleDateString()}</TableCell>
                            <TableCell>{row.InvoiceNo || 'N/A'}</TableCell>
                            <TableCell>{row.POCode ? <TransactionLink type="PO" id={row.POCode} /> : 'Direct'}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{row.OperatorName}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                label={row.Status === 'PENDING' ? 'GRN_CREATED' : row.Status} 
                                color={row.Status === 'QC_COMPLETED' || row.Status === 'PUTAWAY_COMPLETED' ? 'success' : 'warning'}
                                sx={{ fontWeight: 600 }}
                              />
                            </TableCell>
                            <TableCell align="center">
                              {row.IsSynced === 1 ? (
                                <Chip 
                                  size="small" 
                                  label="Synced" 
                                  color="success" 
                                  variant="outlined"
                                  sx={{ fontWeight: 600 }}
                                />
                              ) : (
                                <Button
                                  variant="contained"
                                  color="primary"
                                  size="small"
                                  onClick={() => handleSyncGRN(row.GRNId)}
                                  disabled={!!syncingGrnIds[row.GRNId]}
                                  sx={{ textTransform: 'none', fontWeight: 600, minWidth: 80 }}
                                >
                                  {syncingGrnIds[row.GRNId] ? 'Syncing...' : 'Sync'}
                                </Button>
                              )}
                            </TableCell>
                          </>
                        )}

                        {/* Tab 4: Audit Trails */}
                        {tabValue === 4 && (
                          <>
                            <TableCell>
                              {['tblPurchaseOrder', 'tblGRN', 'tblSalesOrder', 'tblPickList', 'tblStockTransfer', 'tblPutaway', 'tblPacking', 'tblDispatch', 'tblQC', 'tblReservation'].includes(row.TableName) ? (
                                <TransactionLink 
                                  type={
                                    row.TableName === 'tblPurchaseOrder' ? 'PO' :
                                    row.TableName === 'tblGRN' ? 'GRN' :
                                    row.TableName === 'tblSalesOrder' ? 'SO' :
                                    row.TableName === 'tblPickList' ? 'Pick' :
                                    row.TableName === 'tblStockTransfer' ? 'Transfer' :
                                    row.TableName === 'tblPutaway' ? 'Putaway' :
                                    row.TableName === 'tblPacking' ? 'Pack' :
                                    row.TableName === 'tblDispatch' ? 'Dispatch' :
                                    row.TableName === 'tblQC' ? 'QC' : 'Reservation'
                                  } 
                                  id={row.RecordId} 
                                  label={`AUD-${row.AuditId}`}
                                />
                              ) : row.AuditId}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{row.Username || 'SYSTEM'}</TableCell>
                            <TableCell>
                              <Typography variant="caption" sx={{ fontWeight: 700, bgcolor: (row.Action || '').includes('DELETE') ? 'error.light' : 'action.hover', p: 0.5, borderRadius: 1 }}>
                                {row.Action || 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell>{row.TableName || 'N/A'}</TableCell>
                            <TableCell><code>{row.IPAddress || 'N/A'}</code></TableCell>
                            <TableCell>{row.Timestamp ? new Date(row.Timestamp).toLocaleString() : 'N/A'}</TableCell>
                          </>
                        )}

                        {/* Tab 6: Bin Capacity & Suitability */}
                        {tabValue === 6 && (
                          <>
                            <TableCell sx={{ fontWeight: 700 }}><code>{row.BinCode}</code></TableCell>
                            <TableCell>{row.WarehouseName} ({row.ZoneName})</TableCell>
                            <TableCell sx={{ fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.CurrentItems ? row.CurrentItems : <Typography variant="caption" color="text.secondary">Empty (None)</Typography>}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {row.OccupiedWeight} / {row.CapacityWeight} kg
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Available: {row.AvailableWeight} kg
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {row.OccupiedVolume} / {row.CapacityVolume} L
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Available: {row.AvailableVolume} L
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                W: {row.WeightOccupancyPercent}%
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                V: {row.VolumeOccupancyPercent}%
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                label={row.BinStatus} 
                                color={row.BinStatus === 'Empty' ? 'success' : row.BinStatus === 'Full' ? 'error' : 'warning'}
                                sx={{ fontWeight: 700, fontSize: 10 }}
                              />
                            </TableCell>
                            <TableCell>
                              {row.BinStatus === 'Full' ? (
                                <Typography variant="caption" color="error.main">No Putaway Recommended</Typography>
                              ) : row.BinStatus === 'Empty' ? (
                                <Typography variant="caption" color="success.main" fontWeight={700}>Excellent (Fast Placement)</Typography>
                              ) : (
                                <Typography variant="caption" color="primary.main" fontWeight={700}>Store {row.CurrentCategories || 'Same Items'}</Typography>
                              )}
                            </TableCell>
                          </>
                        )}

                        {/* Tab 7: ASN Inbound Notices */}
                        {tabValue === 7 && (
                          <>
                            {asnReportView === 'summary' && (
                              <>
                                <TableCell><TransactionLink type="ASN" id={row.ASNId} label={row.ASNNumber} /></TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{row.SupplierName}</TableCell>
                                <TableCell>{row.POCode ? <TransactionLink type="PO" id={row.POId} label={row.POCode} /> : 'Direct'}</TableCell>
                                <TableCell>{new Date(row.ExpectedArrivalDate).toLocaleDateString()}</TableCell>
                                <TableCell>{row.Transporter || 'N/A'}</TableCell>
                                <TableCell align="right">{row.ExpectedQty} PCS</TableCell>
                                <TableCell align="right">{row.ReceivedQty} PCS</TableCell>
                                <TableCell>
                                  <Chip label={row.Status} size="small" variant="outlined" color={row.Status === 'Fully Received' ? 'success' : row.Status === 'Draft' ? 'default' : 'primary'} />
                                </TableCell>
                              </>
                            )}
                            {asnReportView === 'status' && (
                              <>
                                <TableCell><TransactionLink type="ASN" id={row.ASNId} label={row.ASNNumber} /></TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{row.SupplierName}</TableCell>
                                <TableCell>{row.POCode ? <TransactionLink type="PO" id={row.POId} label={row.POCode} /> : 'Direct'}</TableCell>
                                <TableCell>{new Date(row.ExpectedArrivalDate).toLocaleDateString()}</TableCell>
                                <TableCell>{row.Transporter || 'N/A'}</TableCell>
                                <TableCell>
                                  <Chip label={row.Status} size="small" color={row.Status === 'Fully Received' ? 'success' : row.Status === 'Draft' ? 'default' : 'primary'} />
                                </TableCell>
                              </>
                            )}
                            {asnReportView === 'pending' && (
                              <>
                                <TableCell><TransactionLink type="ASN" id={row.ASNId} label={row.ASNNumber} /></TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{row.SupplierName}</TableCell>
                                <TableCell>{new Date(row.ExpectedArrivalDate).toLocaleDateString()}</TableCell>
                                <TableCell><code>{row.ItemCode}</code></TableCell>
                                <TableCell>{row.ItemName}</TableCell>
                                <TableCell align="right">{row.ExpectedQty} {row.UOM}</TableCell>
                                <TableCell align="right">{row.ReceivedQty} {row.UOM}</TableCell>
                                <TableCell align="right" sx={{ color: 'warning.main', fontWeight: 700 }}>{row.PendingQty} {row.UOM}</TableCell>
                              </>
                            )}
                            {asnReportView === 'variance' && (
                              <>
                                <TableCell><TransactionLink type="ASN" id={row.ASNId} label={row.ASNNumber} /></TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{row.SupplierName}</TableCell>
                                <TableCell>{new Date(row.ExpectedArrivalDate).toLocaleDateString()}</TableCell>
                                <TableCell><code>{row.ItemCode}</code></TableCell>
                                <TableCell>{row.ItemName}</TableCell>
                                <TableCell align="right">{row.ExpectedQty} {row.UOM}</TableCell>
                                <TableCell align="right">{row.ReceivedQty} {row.UOM}</TableCell>
                                <TableCell align="right" sx={{ color: row.PendingQty > 0 ? 'warning.main' : 'success.main', fontWeight: 700 }}>
                                  {row.PendingQty} {row.UOM}
                                </TableCell>
                              </>
                            )}
                            {asnReportView === 'supplier' && (
                              <>
                                <TableCell sx={{ fontWeight: 600 }}>{row.SupplierName}</TableCell>
                                <TableCell align="right">{row.ASNCount}</TableCell>
                                <TableCell align="right">{row.ExpectedQty} PCS</TableCell>
                                <TableCell align="right">{row.ReceivedQty} PCS</TableCell>
                              </>
                            )}
                             {asnReportView === 'date' && (
                              <>
                                <TableCell>{new Date(row.ExpectedArrivalDate).toLocaleDateString()}</TableCell>
                                <TableCell><TransactionLink type="ASN" id={row.ASNId} label={row.ASNNumber} /></TableCell>
                                <TableCell sx={{ fontWeight: 600 }}>{row.SupplierName}</TableCell>
                                <TableCell align="right">{row.ExpectedQty} PCS</TableCell>
                                <TableCell>
                                  <Chip label={row.Status} size="small" variant="outlined" />
                                </TableCell>
                              </>
                            )}
                          </>
                        )}

                        {/* Tab 8: Reorder & Stock Alerts */}
                        {tabValue === 8 && replenishmentView === 'live' && (
                          <>
                            <TableCell><code>{row.ItemCode}</code></TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{row.ItemName}</TableCell>
                            <TableCell>{row.Category}</TableCell>
                            <TableCell>{row.UOM}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{row.TotalStock}</TableCell>
                            <TableCell align="right">{row.MinStock}</TableCell>
                            <TableCell align="right">{row.MaxStock}</TableCell>
                            <TableCell align="right" sx={{ color: 'info.main', fontWeight: 600 }}>{row.AvailableStorageSpace}</TableCell>
                            <TableCell align="right" sx={{ color: 'warning.main', fontWeight: 600 }}>{row.ReorderQty || 0}</TableCell>
                            <TableCell align="right" sx={{ color: 'success.main', fontWeight: 700 }}>{row.FeasibleQty || 0}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                label={row.StockStatus === 'BELOW_MIN' ? 'Below Min' : row.StockStatus === 'ABOVE_MAX' ? 'Exceeds Max' : 'Normal'}
                                color={row.StockStatus === 'BELOW_MIN' ? 'error' : row.StockStatus === 'ABOVE_MAX' ? 'warning' : 'success'}
                                sx={{ fontWeight: 700 }}
                              />
                            </TableCell>
                          </>
                        )}
                        {tabValue === 8 && replenishmentView === 'logs' && (
                          <>
                            <TableCell>{new Date(row.CreatedAt).toLocaleString()}</TableCell>
                            <TableCell><code>{row.ItemCode}</code></TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{row.ItemName}</TableCell>
                            <TableCell>{row.Category}</TableCell>
                            <TableCell>{row.UOM}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                label={row.AlertType === 'BELOW_MIN' ? 'Below Min' : 'Exceeds Max'}
                                color={row.AlertType === 'BELOW_MIN' ? 'error' : 'warning'}
                                sx={{ fontWeight: 700 }}
                              />
                            </TableCell>
                            <TableCell align="right">{row.CurrentStock}</TableCell>
                            <TableCell align="right">{row.ThresholdValue}</TableCell>
                            <TableCell>{row.ReferenceDoc || 'N/A'}</TableCell>
                            <TableCell>
                              <Chip 
                                size="small" 
                                label={row.Status}
                                color={row.Status === 'ACTIVE' ? 'error' : 'success'}
                                variant={row.Status === 'ACTIVE' ? 'filled' : 'outlined'}
                                sx={{ fontWeight: 700 }}
                              />
                            </TableCell>
                            <TableCell>{row.ResolvedAt ? new Date(row.ResolvedAt).toLocaleString() : 'N/A'}</TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                    
                    {getSourceData().length === 0 && (
                      <TableRow>
                        <TableCell colSpan={tabValue === 0 ? 9 : (tabValue === 1 || tabValue === 2 ? 11 : (tabValue === 3 ? 7 : (tabValue === 6 ? 8 : (tabValue === 7 ? (asnReportView === 'summary' || asnReportView === 'pending' || asnReportView === 'variance' ? 8 : asnReportView === 'status' ? 6 : asnReportView === 'supplier' ? 4 : 5) : (tabValue === 8 ? 11 : 8)))))} align="center" sx={{ py: 5 }}>
                          <Paper variant="outlined" sx={{ py: 3, px: 2, display: 'inline-block', maxWidth: 400, bgcolor: 'transparent', borderStyle: 'dashed' }}>
                            <Search size={32} style={{ color: '#94a3b8', marginBottom: '8px' }} />
                            <Typography variant="subtitle1" fontWeight={600} color="text.secondary">No matching data found</Typography>
                            <Typography variant="body2" color="text.secondary">Try clearing some filters or searching for keywords.</Typography>
                          </Paper>
                        </TableCell>
                      </TableRow>
                    )}
            </TableBody>
                </Table>
              )}
            </TableContainer>
            {!loading && tabValue !== 5 && (
              <TablePaginationBar
                count={totalRows}
                page={pagination.page}
                rowsPerPage={pagination.rowsPerPage}
                onPageChange={pagination.setPage}
                onRowsPerPageChange={pagination.setRowsPerPage}
              />
            )}
          </Card>
        </>
      ) : (
        /* Tab 4: Barcode Label Management Screen */
        <Grid container spacing={3}>
          {/* Settings / Selection Form */}
          <Grid item xs={12} md={5}>
            <Card sx={{ p: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none' }}>
              <Typography variant="h4" fontWeight={700} sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Settings size={20} color="#1a73e8" /> Barcode Specifications
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Autocomplete
                  size="small"
                  options={itemsList}
                  getOptionLabel={(option) => option ? `${option.Name} (${option.Code})` : ''}
                  value={selectedItemObject}
                  loading={itemsLoading}
                  onInputChange={(event, newInputValue) => {
                    setItemsSearchQuery(newInputValue);
                  }}
                  onChange={(event, newValue) => {
                    setSelectedItemObject(newValue);
                    if (newValue) {
                      setCustomText(newValue.Code);
                      setCustomDesc(newValue.Name);
                      setSelectedItemId(String(newValue.ItemId));
                    } else {
                      setCustomText('');
                      setCustomDesc('');
                      setSelectedItemId('');
                    }
                  }}
                  renderInput={(params) => (
                    <TextField 
                      {...params} 
                      label="Load Master Item Template" 
                      placeholder="Type name or code to search..." 
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {itemsLoading ? <CircularProgress color="inherit" size={20} /> : null}
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                />

                <TextField
                  label="Barcode String / Value"
                  required
                  placeholder="e.g. ITM-001, WH01-Z02-R01-B05"
                  size="small"
                  fullWidth
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                />

                <TextField
                  label="Label Text Description / Title"
                  placeholder="e.g. Logitech Mouse, Delhi Inbound Bin"
                  size="small"
                  fullWidth
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                />

                <TextField
                  label="Batch / Reference Number (Optional)"
                  placeholder="e.g. BAT-SSD-001"
                  size="small"
                  fullWidth
                  value={customBatch}
                  onChange={(e) => setCustomBatch(e.target.value)}
                />

                <FormControl fullWidth size="small">
                  <InputLabel>Symbology Type</InputLabel>
                  <Select
                    value={generatorType}
                    label="Symbology Type"
                    onChange={(e) => setGeneratorType(e.target.value as any)}
                  >
                    <MenuItem value="Code128">Code 128 (General Code)</MenuItem>
                    <MenuItem value="EAN13">EAN 13 (Standard Retail GTIN)</MenuItem>
                    <MenuItem value="QRCode">QR Code (2D Matrix)</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small">
                  <InputLabel>Label Dimensions (Size)</InputLabel>
                  <Select
                    value={generatorLabelSize}
                    label="Label Dimensions (Size)"
                    onChange={(e) => setGeneratorLabelSize(e.target.value)}
                  >
                    <MenuItem value="2x1">2" x 1" (Small Location / Bin Label)</MenuItem>
                    <MenuItem value="3x2">3" x 2" (Standard Carton Label)</MenuItem>
                    <MenuItem value="4x3">4" x 3" (Large Pallet / Box Label)</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Print Labels Quantity"
                  type="number"
                  size="small"
                  fullWidth
                  value={generatorQty}
                  onChange={(e) => setGeneratorQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />

                {generatorType !== 'QRCode' && (
                  <>
                    <Box>
                      <Typography variant="caption" color="text.secondary">Barcode scale width ({generatorWidth}x)</Typography>
                      <Slider
                        value={generatorWidth}
                        min={1}
                        max={4}
                        step={1}
                        marks
                        onChange={(e, val) => setGeneratorWidth(val as number)}
                      />
                    </Box>

                    <Box>
                      <Typography variant="caption" color="text.secondary">Barcode bar height ({generatorHeight}px)</Typography>
                      <Slider
                        value={generatorHeight}
                        min={30}
                        max={120}
                        step={10}
                        onChange={(e, val) => setGeneratorHeight(val as number)}
                      />
                    </Box>
                  </>
                )}

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={includeTextCustom}
                      onChange={(e) => setIncludeTextCustom(e.target.checked)}
                      color="primary"
                    />
                  }
                  label="Include human-readable code text on labels"
                />

                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Printer />}
                  onClick={handlePrintGeneratorLabels}
                  disabled={!customText}
                  sx={{ mt: 2, fontWeight: 700 }}
                >
                  Print {generatorQty} Labels Now
                </Button>
              </Box>
            </Card>
          </Grid>

          {/* Live Label Preview */}
          <Grid item xs={12} md={7}>
            <Card sx={{ p: 3, border: '1px solid', borderColor: 'divider', boxShadow: 'none', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h4" fontWeight={700} sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Eye size={20} color="#10b981" /> Output Preview
              </Typography>
              
              <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'action.hover', p: 4, borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
                {customText ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      width: generatorLabelSize === '2x1' ? 240 : generatorLabelSize === '3x2' ? 300 : 340,
                      height: generatorLabelSize === '2x1' ? 120 : generatorLabelSize === '3x2' ? 200 : 255,
                      p: 2.5,
                      bgcolor: '#fff',
                      boxShadow: 3,
                      display: 'flex',
                      flexDirection: generatorType === 'QRCode' ? 'row' : 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      textAlign: generatorType === 'QRCode' ? 'left' : 'center',
                      transition: 'all 0.2s ease-in-out'
                    }}
                  >
                    <Box sx={{ width: generatorType === 'QRCode' ? '55%' : '100%' }}>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {customDesc || 'WMS Custom Label'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Code: <b>{customText}</b>
                      </Typography>
                      {customBatch && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Batch: <b>{customBatch}</b>
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ mt: generatorType === 'QRCode' ? 0 : 2, display: 'flex', justifyContent: 'center' }}>
                      <Barcode
                        value={customText}
                        type={generatorType}
                        width={generatorWidth}
                        height={generatorHeight}
                      />
                    </Box>
                  </Paper>
                ) : (
                  <Typography variant="body1" color="text.secondary">
                    Configure specifications on the left to see the output preview here.
                  </Typography>
                )}
              </Box>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* History Dialog */}
      <Dialog 
        open={historyModalOpen} 
        onClose={() => setHistoryModalOpen(false)} 
        fullWidth 
        maxWidth="md"
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <History size={20} />
          {historyType === 'SO' ? 'Dispatch History' : 'GRN Received History'} — {selectedOrderCode}
        </DialogTitle>
        <DialogContent dividers>
          {historyLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
          ) : historyData.length === 0 ? (
            <Alert severity="info">No transactions found against this order code.</Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {historyType === 'SO' ? (
                      <>
                        <TableCell sx={{ fontWeight: 600 }}>Challan No</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Dispatch Code</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Transporter</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>LR Number</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell sx={{ fontWeight: 600 }}>GRN Code</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Invoice No</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Received Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Received By</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historyData.map((row: any, i: number) => (
                    <TableRow key={i} hover>
                      {historyType === 'SO' ? (
                        <>
                          <TableCell><code>{row.DeliveryChallanNo}</code></TableCell>
                          <TableCell>
                            <TransactionLink type="Dispatch" id={row.DispatchCode} />
                          </TableCell>
                          <TableCell>{new Date(row.DispatchDate).toLocaleDateString()}</TableCell>
                          <TableCell>{row.TransporterName || 'N/A'}</TableCell>
                          <TableCell>{row.LRNumber || 'N/A'}</TableCell>
                          <TableCell>
                            <Chip size="small" label={row.Status} color="success" sx={{ fontWeight: 600 }} />
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            <TransactionLink type="GRN" id={row.GRNCode} />
                          </TableCell>
                          <TableCell><code>{row.InvoiceNo || 'N/A'}</code></TableCell>
                          <TableCell>{new Date(row.ReceivedDate).toLocaleDateString()}</TableCell>
                          <TableCell>{row.OperatorName || `User ID: ${row.ReceivedBy}`}</TableCell>
                          <TableCell>
                            <Chip 
                              size="small" 
                              label={row.Status} 
                              color={row.Status === 'QC_COMPLETED' ? 'success' : 'warning'} 
                              sx={{ fontWeight: 600 }} 
                            />
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Reusable Barcode Print dialog for Stock status ledger */}
      {selectedLedgerRow && (
        <BarcodePrintDialog
          open={barcodePrintOpen}
          onClose={() => setBarcodePrintOpen(false)}
          itemCode={selectedLedgerRow.ItemCode}
          itemName={selectedLedgerRow.ItemName}
          batchNumber={selectedLedgerRow.BatchNumber}
          defaultQty={1}
        />
      )}
    </Box>
  );
}
