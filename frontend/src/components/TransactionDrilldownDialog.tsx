import React, { useEffect, useState } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, Button, 
  Typography, Box, CircularProgress, Alert, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Divider, 
  Grid, TextField, Chip, Link, IconButton
} from '@mui/material';
import { Printer, Edit, Check, X, Trash2 } from 'lucide-react';
import { useTransactionModalStore } from '../store/transactionModalStore';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';
import ConfirmDialog from './ConfirmDialog';

export default function TransactionDrilldownDialog() {
  const { isOpen, type, id, mode, closeTransaction, openTransaction } = useTransactionModalStore();
  const { user } = useAuthStore();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || !id || !type) return;
    
    setLoading(true);
    setError('');
    setData(null);
    setEditFields({});

    const fetchData = async () => {
      try {
        const res = await api.get(`/transactions/${type}/${encodeURIComponent(String(id))}`);
        const { header, items } = res.data;
        
        if (type === 'PO') {
          setData({
            code: header.POCode,
            vendor: header.VendorName,
            vendorCode: header.VendorCode,
            date: header.OrderDate,
            status: header.Status,
            items: items.map((item: any) => ({
              code: item.ItemCode,
              name: item.ItemName,
              qty: item.OrderQty,
              received: item.ReceivedQty,
              pending: item.PendingQty !== undefined && item.PendingQty !== null ? Number(item.PendingQty) : (item.OrderQty - item.ReceivedQty),
              uom: item.UOM || 'PCS'
            }))
          });
        }
        else if (type === 'SO') {
          setData({
            code: header.SOCode,
            customer: header.CustomerName,
            customerCode: header.CustomerCode,
            date: header.OrderDate,
            status: header.Status,
            items: items.map((item: any) => ({
              code: item.ItemCode,
              name: item.ItemName,
              qty: item.OrderQty,
              reserved: item.ReservedQty,
              picked: item.PickedQty,
              shipped: item.ShippedQty,
              uom: item.UOM || 'PCS'
            }))
          });
        }
        else if (type === 'GRN') {
          setData({
            code: header.GRNCode,
            poCode: header.POCode || 'N/A',
            date: header.ReceivedDate,
            invoiceNo: header.InvoiceNo,
            operator: header.OperatorName,
            status: header.Status,
            items: items.map((item: any) => ({
              code: item.ItemCode,
              name: item.ItemName,
              qty: item.ReceivedQty,
              batch: item.BatchNumber || 'N/A',
              uom: item.UOM || 'PCS'
            }))
          });
          setEditFields({ invoiceNo: header.InvoiceNo || '' });
        }
        else if (type === 'QC') {
          setData({
            code: header.GRNCode || `QC-${header.QCId}`,
            date: header.CheckedDate,
            status: header.Status,
            inspector: header.InspectorName,
            remarks: header.Remarks,
            items: items.map((item: any) => ({
              code: item.ItemCode,
              name: item.ItemName,
              qty: item.ReceivedQty,
              accepted: item.AcceptedQty,
              rejected: item.RejectedQty,
              batch: item.BatchNumber || 'N/A',
              reason: item.RejectionReason || 'N/A',
              uom: item.UOM || 'PCS'
            }))
          });
        }
        else if (type === 'Putaway') {
          setData({
            code: header.code,
            date: header.date,
            status: header.status,
            operator: header.operator,
            items: items.map((item: any) => ({
              code: item.code,
              name: item.name,
              qty: item.qty,
              bin: item.bin,
              batch: item.batch || 'N/A',
              uom: 'PCS'
            }))
          });
        }
        else if (type === 'Transfer') {
          setData({
            code: header.TransferCode,
            date: header.TransferDate,
            operator: header.OperatorName,
            items: items.map((item: any) => ({
              code: item.code,
              name: item.name,
              qty: item.qty,
              fromBin: item.fromBin,
              toBin: item.toBin,
              uom: 'PCS'
            }))
          });
        }
        else if (type === 'Reservation') {
          setData({
            code: header.code,
            date: header.date,
            status: header.status,
            items: items.map((item: any) => ({
              code: item.code,
              name: item.name,
              qty: item.qty,
              bin: item.bin,
              batch: item.batch || 'N/A',
              uom: 'PCS'
            }))
          });
        }
        else if (type === 'Pick') {
          setData({
            code: header.PickCode,
            soCode: header.SOCode,
            operator: header.CreatorName,
            assignee: header.AssigneeName || 'Unassigned',
            date: header.CreatedAt,
            status: header.Status,
            items: items.map((item: any) => ({
              code: item.ItemCode,
              name: item.ItemName,
              bin: item.BinCode,
              qty: item.Quantity,
              picked: item.PickedQty,
              batch: item.BatchNumber || 'N/A',
              uom: item.UOM || 'PCS'
            }))
          });
          setEditFields({ assignee: header.AssigneeName || '' });
        }
        else if (type === 'Pack') {
          setData({
            code: header.code,
            pickCode: header.pickCode,
            soCode: header.soCode,
            date: header.date,
            status: header.status,
            operator: header.operator,
            cartonNo: header.cartonNo,
            palletNo: header.palletNo,
            shippingLabel: header.shippingLabel,
            items: items.map((item: any) => ({
              code: item.code,
              name: item.name,
              qty: item.qty,
              picked: item.picked,
              batch: item.batch || 'N/A',
              uom: 'PCS'
            }))
          });
          setEditFields({ cartonNo: header.cartonNo || '', palletNo: header.palletNo || '', shippingLabel: header.shippingLabel || '' });
        }
        else if (type === 'Dispatch') {
          setData({
            code: header.DispatchCode,
            soCode: header.SOCode,
            date: header.DispatchDate,
            status: header.Status,
            operator: header.OperatorName,
            deliveryChallan: header.DeliveryChallanNo,
            vehicleNo: header.VehicleNo,
            transporter: header.TransporterName,
            lrNumber: header.LRNumber,
            items: items.map((item: any) => ({
              code: item.ItemCode,
              name: item.ItemName,
              qty: item.OrderQty,
              uom: item.UOM || 'PCS'
            }))
          });
          setEditFields({ vehicleNo: header.VehicleNo || '', transporter: header.TransporterName || '', lrNumber: header.LRNumber || '' });
        }
        else if (type === 'SalesReturn' || type === 'PurchaseReturn') {
          setData({
            code: header.code,
            date: header.date,
            status: header.status || 'RECEIVED',
            referenceCode: header.referenceCode || 'N/A',
            items: items.map((item: any) => ({
              code: item.code,
              name: item.name,
              qty: item.qty,
              reason: item.reason || 'N/A',
              batch: item.batch || 'N/A',
              uom: 'PCS'
            }))
          });
        }
        else if (type === 'ASN') {
          setData({
            code: header.ASNNumber,
            supplier: header.SupplierName,
            poCode: header.POCode || 'Direct Inward',
            date: header.ExpectedArrivalDate,
            shipmentDate: header.ShipmentDate,
            transporter: header.Transporter || 'N/A',
            vehicleNo: header.VehicleNumber || 'N/A',
            trackingNo: header.TrackingNumber || 'N/A',
            warehouse: header.WarehouseName,
            status: header.Status,
            remarks: header.Remarks || 'No remarks',
            items: items.map((item: any) => ({
              code: item.ItemCode,
              name: item.ItemName,
              qty: item.ExpectedQty,
              received: item.ReceivedQty,
              pending: item.ExpectedQty - item.ReceivedQty,
              uom: item.UOM || 'PCS'
            }))
          });
          setEditFields({
            transporter: header.Transporter || '',
            vehicleNo: header.VehicleNumber || '',
            trackingNo: header.TrackingNumber || ''
          });
        }
        else if (type === 'Adjustment') {
          setData({
            code: header.code,
            date: header.date,
            status: header.status,
            operator: header.operator,
            items: items.map((item: any) => ({
              code: item.code,
              name: item.name,
              qty: item.qty,
              oldValues: item.oldValues,
              newValues: item.newValues,
              uom: 'PCS'
            }))
          });
        }
        else {
          setData({
            code: `TRX-${id}`,
            date: new Date().toISOString(),
            status: 'COMPLETED',
            items: []
          });
        }
        setLoading(false);
      } catch (err: any) {
        setError('Failed to fetch transaction details: ' + (err.response?.data?.message || err.message));
        setLoading(false);
      }
    };

    fetchData();
  }, [isOpen, id, type]);

  const getResourceName = (txType: string): string => {
    if (['PO', 'GRN', 'QC', 'Putaway'].includes(txType)) return 'Inbound';
    if (['SO', 'Pick', 'Pack', 'Dispatch'].includes(txType)) return 'Outbound';
    if (['Transfer', 'Adjustment'].includes(txType)) return 'Inventory';
    return 'Inbound';
  };

  const hasPermission = (action: 'read' | 'create' | 'update' | 'delete'): boolean => {
    if (!user) return false;
    if (user.role === 'Admin') return true;
    if (!user.permissions) {
      if (action === 'delete') return false;
      return user.role === 'Warehouse Manager' || user.role === 'Supervisor';
    }
    const resource = getResourceName(type || '');
    const perm = user.permissions.find((p: any) => p.ResourceName === resource);
    if (!perm) return false;
    if (action === 'read') return perm.CanRead === 1;
    if (action === 'create') return perm.CanCreate === 1;
    if (action === 'update') return perm.CanUpdate === 1;
    if (action === 'delete') return perm.CanDelete === 1;
    return false;
  };

  const handleEditToggle = () => {
    if (!hasPermission('update')) {
      alert('Access denied: You do not have permission to modify this voucher.');
      return;
    }
    openTransaction(type!, id!, 'edit');
  };

  const handleDeleteClick = () => {
    if (!type || !id) return;
    
    if (!hasPermission('delete')) {
      alert('Access denied: You do not have permission to delete this voucher.');
      return;
    }

    setConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    setConfirmDeleteOpen(false);
    if (!type || !id) return;

    setSaving(true);
    try {
      await api.delete(`/transactions/${type}/${encodeURIComponent(String(id))}`);
      alert('Voucher deleted successfully.');
      closeTransaction();
      window.location.reload();
    } catch (err: any) {
      alert('Failed to delete voucher: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (type === 'GRN') {
        await api.put(`/transactions/${type}/${encodeURIComponent(String(id))}`, { invoiceNo: editFields.invoiceNo });
        setData((prev: any) => ({ ...prev, invoiceNo: editFields.invoiceNo }));
      }
      else if (type === 'Pick') {
        await api.put(`/transactions/${type}/${encodeURIComponent(String(id))}`, { assignee: editFields.assignee });
        setData((prev: any) => ({ ...prev, assignee: editFields.assignee }));
      }
      else if (type === 'Pack') {
        await api.put(`/transactions/${type}/${encodeURIComponent(String(id))}`, { cartonNo: editFields.cartonNo, palletNo: editFields.palletNo, shippingLabel: editFields.shippingLabel });
        setData((prev: any) => ({ ...prev, cartonNo: editFields.cartonNo, palletNo: editFields.palletNo, shippingLabel: editFields.shippingLabel }));
      }
      else if (type === 'Dispatch') {
        await api.put(`/transactions/${type}/${encodeURIComponent(String(id))}`, { vehicleNo: editFields.vehicleNo, transporter: editFields.transporter, lrNumber: editFields.lrNumber });
        setData((prev: any) => ({ ...prev, vehicleNo: editFields.vehicleNo, transporter: editFields.transporter, lrNumber: editFields.lrNumber }));
      }
      else if (type === 'ASN') {
        await api.put(`/transactions/${type}/${encodeURIComponent(String(id))}`, { transporter: editFields.transporter, vehicleNo: editFields.vehicleNo, trackingNo: editFields.trackingNo });
        setData((prev: any) => ({ ...prev, transporter: editFields.transporter, vehicleNo: editFields.vehicleNo, trackingNo: editFields.trackingNo }));
      }
      setSaving(false);
      openTransaction(type!, id!, 'view');
    } catch (err: any) {
      alert('Failed to save modifications: ' + (err.response?.data?.message || err.message));
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onClose={closeTransaction} fullWidth maxWidth="md">
      <DialogTitle sx={{ 
        bgcolor: 'primary.main', 
        color: '#fff', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        py: 1.5,
        px: 3
      }}>
        <Typography variant="h3" sx={{ color: '#fff', fontWeight: 700 }}>
          {type === 'PO' && 'Purchase Order Sync Voucher'}
          {type === 'SO' && 'Sales Order Sync Voucher'}
          {type === 'GRN' && 'Goods Receipt Note (GRN)'}
          {type === 'QC' && 'Quality Check (QC) inspection'}
          {type === 'Putaway' && 'Putaway Slotting Record'}
          {type === 'Transfer' && 'Internal Stock Transfer Voucher'}
          {type === 'Reservation' && 'Inventory FEFO Allocation Reservation'}
          {type === 'Pick' && 'Picking Wave Dispatch Slip'}
          {type === 'Pack' && 'Carton Packing Confirmation'}
          {type === 'Dispatch' && 'Delivery Challan & Dispatch Voucher'}
          {type === 'SalesReturn' && 'Sales Return Voucher'}
          {type === 'PurchaseReturn' && 'Purchase Return Voucher'}
          {type === 'Adjustment' && 'Inventory Stock Adjustment Voucher'}
          {type === 'ASN' && 'Advanced Shipment Notice (ASN)'}
          {!['PO', 'SO', 'GRN', 'QC', 'Putaway', 'Transfer', 'Reservation', 'Pick', 'Pack', 'Dispatch', 'SalesReturn', 'PurchaseReturn', 'Adjustment', 'ASN'].includes(type || '') && 'Transaction Details'}
        </Typography>
        <IconButton onClick={closeTransaction} size="small" sx={{ color: '#fff' }}>
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3, mt: 1 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}><CircularProgress /></Box>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : data ? (
          <Box>
            {/* Voucher Metadata Header */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary" display="block">DOCUMENT REF NUMBER</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>{data.code}</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary" display="block">DATE / TIME</Typography>
                <Typography variant="body1">{data.date ? new Date(data.date).toLocaleString() : 'N/A'}</Typography>
              </Grid>
              {data.status && (
                <Grid item xs={12} sm={4}>
                  <Typography variant="caption" color="text.secondary" display="block">WORKFLOW STATUS</Typography>
                  <Chip label={data.status} color="primary" size="small" sx={{ fontWeight: 600, mt: 0.5 }} />
                </Grid>
              )}

              <Grid item xs={12}><Divider /></Grid>

              {type === 'PO' && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" display="block">SUPPLIER / VENDOR</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.vendor} ({data.vendorCode})</Typography>
                </Grid>
              )}
              {type === 'SO' && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" display="block">DELIVERY CUSTOMER</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.customer} ({data.customerCode})</Typography>
                </Grid>
              )}
              {type === 'GRN' && (
                <>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" color="text.secondary" display="block">PURCHASE ORDER REF</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.poCode}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" color="text.secondary" display="block">INVOICE REF</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.invoiceNo || ''}
                        onChange={(e) => setEditFields({ invoiceNo: e.target.value })}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.invoiceNo || 'N/A'}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" color="text.secondary" display="block">RECEIVED BY</Typography>
                    <Typography variant="body2">{data.operator}</Typography>
                  </Grid>
                </>
              )}
              {type === 'QC' && (
                <>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">INSPECTOR NAME</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.inspector || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">INSPECTION REMARKS</Typography>
                    <Typography variant="body2">{data.remarks || 'No remarks recorded.'}</Typography>
                  </Grid>
                </>
              )}
              {type === 'Putaway' && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" display="block">SLOTTING OPERATOR</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.operator || 'N/A'}</Typography>
                </Grid>
              )}
              {type === 'Transfer' && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" display="block">TRANSFERRED BY</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.operator || 'N/A'}</Typography>
                </Grid>
              )}
              {type === 'Pick' && (
                <>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" color="text.secondary" display="block">SALES ORDER REF</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.soCode}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Typography variant="caption" color="text.secondary" display="block">OPERATOR ASSIGNEE</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.assignee || ''}
                        onChange={(e) => setEditFields({ assignee: e.target.value })}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.assignee || 'Unassigned'}</Typography>
                    )}
                  </Grid>
                </>
              )}
              {type === 'Pack' && (
                <>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">SALES ORDER REF</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.soCode || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">CARTON NUMBER</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.cartonNo || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, cartonNo: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.cartonNo || 'N/A'}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">PALLET NUMBER</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.palletNo || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, palletNo: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.palletNo || 'N/A'}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">SHIPPING LABEL</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.shippingLabel || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, shippingLabel: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.shippingLabel || 'N/A'}</Typography>
                    )}
                  </Grid>
                </>
              )}
              {type === 'Dispatch' && (
                <>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">SALES ORDER REF</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.soCode || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">VEHICLE NUMBER</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.vehicleNo || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, vehicleNo: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.vehicleNo || 'N/A'}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">TRANSPORTER NAME</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.transporter || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, transporter: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.transporter || 'N/A'}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">LR REF NUMBER</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.lrNumber || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, lrNumber: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.lrNumber || 'N/A'}</Typography>
                    )}
                  </Grid>
                </>
              )}
              {(type === 'SalesReturn' || type === 'PurchaseReturn') && (
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary" display="block">REFERENCE ORDER REF</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.referenceCode || 'N/A'}</Typography>
                </Grid>
              )}
              {type === 'ASN' && (
                <>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">SUPPLIER</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.supplier}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">PURCHASE ORDER</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{data.poCode}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">EXPECTED ARRIVAL</Typography>
                    <Typography variant="body2">
                      {new Date(data.date).toLocaleString([], {
                        year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">TRANSPORTER</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.transporter || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, transporter: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2">{data.transporter || 'N/A'}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">VEHICLE NUMBER</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.vehicleNo || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, vehicleNo: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2">{data.vehicleNo || 'N/A'}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={3}>
                    <Typography variant="caption" color="text.secondary" display="block">TRACKING NUMBER</Typography>
                    {mode === 'edit' ? (
                      <TextField 
                        size="small" 
                        fullWidth 
                        value={editFields.trackingNo || ''}
                        onChange={(e) => setEditFields(prev => ({ ...prev, trackingNo: e.target.value }))}
                        sx={{ mt: 0.5 }}
                      />
                    ) : (
                      <Typography variant="body2">{data.trackingNo || 'N/A'}</Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="caption" color="text.secondary" display="block">REMARKS</Typography>
                    <Typography variant="body2">{data.remarks || '-'}</Typography>
                  </Grid>
                </>
              )}
            </Grid>

            {/* Document Lines Table */}
            <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 700 }}>Line Items</Typography>
            <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Table size="small">
                <TableHead sx={{ bgcolor: 'secondary.light' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                    {['Pick', 'Putaway', 'Reservation'].includes(type || '') && <TableCell sx={{ fontWeight: 600 }}>Bin Location</TableCell>}
                    {type === 'Transfer' && (
                      <>
                        <TableCell sx={{ fontWeight: 600 }}>From Bin</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>To Bin</TableCell>
                      </>
                    )}
                    <TableCell sx={{ fontWeight: 600 }}>{type === 'ASN' ? 'Expected Qty' : 'Quantity'}</TableCell>
                    {type === 'PO' && data?.status === 'PARTIAL' && <TableCell sx={{ fontWeight: 600, color: 'warning.main' }}>Pending</TableCell>}
                    {type === 'PO' && <TableCell sx={{ fontWeight: 600 }}>Received</TableCell>}
                    {type === 'ASN' && (
                       <>
                         <TableCell sx={{ fontWeight: 600 }}>Received Qty</TableCell>
                         <TableCell sx={{ fontWeight: 600 }}>Pending Qty</TableCell>
                       </>
                     )}
                    {type === 'SO' && (
                      <>
                        <TableCell sx={{ fontWeight: 600 }}>Reserved</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Shipped</TableCell>
                      </>
                    )}
                    {type === 'QC' && (
                      <>
                        <TableCell sx={{ fontWeight: 600 }}>Accepted</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Rejected</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Rejection Reason</TableCell>
                      </>
                    )}
                    {type === 'Adjustment' && (
                      <>
                        <TableCell sx={{ fontWeight: 600 }}>Old State Values</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>New State Values</TableCell>
                      </>
                    )}
                    {['GRN', 'Pick', 'Putaway', 'Reservation', 'Pack', 'QC', 'SalesReturn', 'PurchaseReturn'].includes(type || '') && <TableCell sx={{ fontWeight: 600 }}>Batch</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.items.map((line: any, idx: number) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontWeight: 600 }}>{line.name} ({line.code})</TableCell>
                      {['Pick', 'Putaway', 'Reservation'].includes(type || '') && <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}><code>{line.bin}</code></TableCell>}
                      {type === 'Transfer' && (
                        <>
                          <TableCell sx={{ fontWeight: 700 }}><code>{line.fromBin}</code></TableCell>
                          <TableCell sx={{ fontWeight: 700, color: 'success.main' }}><code>{line.toBin}</code></TableCell>
                        </>
                      )}
                      <TableCell>{line.qty} {line.uom || 'PCS'}</TableCell>
                      {type === 'PO' && data?.status === 'PARTIAL' && <TableCell sx={{ color: 'warning.main', fontWeight: 600 }}>{line.pending} {line.uom}</TableCell>}
                      {type === 'PO' && <TableCell>{line.received} {line.uom}</TableCell>}
                      {type === 'ASN' && (
                         <>
                           <TableCell sx={{ color: 'success.main', fontWeight: 600 }}>{line.received} {line.uom}</TableCell>
                           <TableCell sx={{ color: line.pending > 0 ? 'warning.main' : 'text.primary' }}>{line.pending} {line.uom}</TableCell>
                         </>
                       )}
                      {type === 'SO' && (
                        <>
                          <TableCell color="success.main" sx={{ color: 'success.main', fontWeight: 600 }}>{line.reserved} {line.uom}</TableCell>
                          <TableCell>{line.shipped} {line.uom}</TableCell>
                        </>
                      )}
                      {type === 'QC' && (
                        <>
                          <TableCell color="success.main" sx={{ color: 'success.main', fontWeight: 600 }}>{line.accepted} {line.uom}</TableCell>
                          <TableCell color="error.main" sx={{ color: 'error.main', fontWeight: 600 }}>{line.rejected} {line.uom}</TableCell>
                          <TableCell>{line.reason || 'N/A'}</TableCell>
                        </>
                      )}
                      {type === 'Adjustment' && (
                        <>
                          <TableCell sx={{ fontSize: 11 }}><code>{line.oldValues || 'N/A'}</code></TableCell>
                          <TableCell sx={{ fontSize: 11, color: 'primary.main' }}><code>{line.newValues || 'N/A'}</code></TableCell>
                        </>
                      )}
                      {['GRN', 'Pick', 'Putaway', 'Reservation', 'Pack', 'QC', 'SalesReturn', 'PurchaseReturn'].includes(type || '') && <TableCell><Chip label={line.batch} size="small" variant="outlined" /></TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">Voucher not found.</Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button variant="outlined" startIcon={<Printer size={16} />} onClick={() => alert('Voucher queued for printing.')}>
          Print Voucher
        </Button>
        {mode === 'view' ? (
          <>
            {hasPermission('update') && (
              <Button variant="contained" color="secondary" startIcon={<Edit size={16} />} onClick={handleEditToggle}>
                Edit Fields
              </Button>
            )}
            {hasPermission('delete') && (
              <Button variant="contained" color="error" startIcon={<Trash2 size={16} />} onClick={handleDeleteClick} disabled={saving}>
                Delete Voucher
              </Button>
            )}
          </>
        ) : (
          <Button variant="contained" color="success" startIcon={<Check size={16} />} disabled={saving} onClick={handleSave}>
            Save Changes
          </Button>
        )}
        <Button variant="outlined" onClick={closeTransaction}>Close</Button>
      </DialogActions>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete ${type} Voucher`}
        message={`Are you sure you want to delete this ${type} voucher? This action will permanently remove the transaction record and cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </Dialog>
  );
}
