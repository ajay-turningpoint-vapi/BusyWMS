import React, { useEffect, useState, useMemo } from 'react';
import { 
  Box, Typography, Tabs, Tab, Button, Card, Table, TableBody, 
  TableCell, TableContainer, TableHead, TableRow, Dialog, 
  DialogTitle, DialogContent, DialogActions, TextField, 
  FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel,
  CircularProgress, Alert, InputAdornment
} from '@mui/material';
import { Plus, Search, MapPin, Layers, Inbox, ShieldCheck, User, Printer, FileDown } from 'lucide-react';
import api from '../services/api';
import BarcodePrintDialog from '../components/BarcodePrintDialog';
import { useAuthStore } from '../store/authStore';
import SearchBar from '../components/SearchBar';
import TablePaginationBar, { usePagination } from '../components/TablePaginationBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { exportToCSV } from '../utils/exportCSV';
import { useToast } from '../contexts/ToastContext';

export default function Masters() {
  const [tabValue, setTabValue] = useState(0);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [openModal, setOpenModal] = useState(false);
  const [modalType, setModalType] = useState<'warehouse' | 'zone' | 'aisle' | 'rack' | 'shelf' | 'bin' | 'item' | 'user'>('warehouse');
  const [formData, setFormData] = useState<any>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [editRecordId, setEditRecordId] = useState<number | string | null>(null);
  
  // Barcode Dialog States
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [barcodeItem, setBarcodeItem] = useState<any>(null);
  const [isBinPrint, setIsBinPrint] = useState(false);
  const toast = useToast();

  // Search & Pagination State
  const pagination = usePagination(25);

  // Confirm delete dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number | string; type: typeof modalType } | null>(null);

  // Helpers for lookups
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [aisles, setAisles] = useState<any[]>([]);
  const [racks, setRacks] = useState<any[]>([]);
  const [shelves, setShelves] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);

  // Permissions check
  const { user } = useAuthStore();
  const canUpdate = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Masters' && p.CanUpdate === 1);
  const canDelete = user?.role === 'Admin' || user?.permissions?.some(p => p.ResourceName === 'Masters' && p.CanDelete === 1);

  const fetchTab = (index: number) => {
    setLoading(true);
    let endpoint = '/masters/warehouses';
    if (index === 1) endpoint = '/masters/zones';
    if (index === 2) endpoint = '/masters/racks';
    if (index === 3) endpoint = '/masters/shelves';
    if (index === 4) endpoint = '/masters/bins';
    if (index === 5) endpoint = '/masters/items?inBinsOnly=true';
    if (index === 6) endpoint = '/masters/users';
    if (index === 7) endpoint = '/masters/aisles';

    api.get(endpoint)
      .then((res) => {
        setData(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTab(tabValue);
    pagination.resetPage();
  }, [tabValue]);

  // Load lookups when opening dialogs
  const loadLookups = async () => {
    try {
      const whRes = await api.get('/masters/warehouses');
      setWarehouses(whRes.data);
      const znRes = await api.get('/masters/zones');
      setZones(znRes.data);
      const alRes = await api.get('/masters/aisles');
      setAisles(alRes.data);
      const rkRes = await api.get('/masters/racks');
      setRacks(rkRes.data);
      const shRes = await api.get('/masters/shelves');
      setShelves(shRes.data);
      const rlRes = await api.get('/masters/roles');
      setRoles(rlRes.data);
    } catch (err) {
      console.error('Failed to load lookups', err);
    }
  };

  const mapRowToForm = (row: any, type: typeof modalType) => {
    if (type === 'warehouse') {
      return {
        code: row.Code || '',
        name: row.Name || '',
        address: row.Address || '',
        isActive: row.IsActive === 1 || row.IsActive === true
      };
    }
    if (type === 'zone') {
      return {
        warehouseId: row.WarehouseId || '',
        code: row.Code || '',
        name: row.Name || '',
        isActive: row.IsActive === 1 || row.IsActive === true
      };
    }
    if (type === 'aisle') {
      return {
        zoneId: row.ZoneId || '',
        code: row.Code || '',
        name: row.Name || '',
        isActive: row.IsActive === 1 || row.IsActive === true
      };
    }
    if (type === 'rack') {
      return {
        zoneId: row.ZoneId || '',
        aisleId: row.AisleId || '',
        code: row.Code || '',
        name: row.Name || '',
        isActive: row.IsActive === 1 || row.IsActive === true
      };
    }
    if (type === 'shelf') {
      return {
        rackId: row.RackId || '',
        code: row.Code || '',
        name: row.Name || '',
        isActive: row.IsActive === 1 || row.IsActive === true
      };
    }
    if (type === 'bin') {
      return {
        shelfId: row.ShelfId || '',
        code: row.Code || '',
        barcode: row.Barcode || '',
        capacityWeight: row.CapacityWeight || 1000,
        capacityVolume: row.CapacityVolume || 500,
        isActive: row.IsActive === 1 || row.IsActive === true
      };
    }
    if (type === 'item') {
      return {
        code: row.Code || '',
        name: row.Name || '',
        description: row.Description || '',
        category: row.Category || '',
        brand: row.Brand || '',
        uom: row.UOM || '',
        barcode: row.Barcode || '',
        trackBatch: row.TrackBatch === 1 || row.TrackBatch === true,
        trackSerial: row.TrackSerial === 1 || row.TrackSerial === true,
        minStock: row.MinStock || 0,
        maxStock: row.MaxStock || 999999,
        unitCost: row.UnitCost || 0.0,
        sellingPrice: row.SellingPrice || 0.0,
        weight: row.Weight || 0.0,
        volume: row.Volume || 0.0,
        isActive: row.IsActive === 1 || row.IsActive === true
      };
    }
    if (type === 'user') {
      return {
        username: row.Username || '',
        fullName: row.FullName || '',
        email: row.Email || '',
        roleName: row.RoleName || '',
        warehouseId: row.WarehouseId || '',
        isActive: row.IsActive === 1 || row.IsActive === true,
        password: ''
      };
    }
    return {};
  };

  const handleOpenModal = () => {
    loadLookups();
    setFormData({});
    setIsEditMode(false);
    setEditRecordId(null);
    if (tabValue === 0) setModalType('warehouse');
    if (tabValue === 1) setModalType('zone');
    if (tabValue === 2) setModalType('rack');
    if (tabValue === 3) setModalType('shelf');
    if (tabValue === 4) setModalType('bin');
    if (tabValue === 5) setModalType('item');
    if (tabValue === 6) setModalType('user');
    if (tabValue === 7) setModalType('aisle');
    setOpenModal(true);
  };

  const handleEditClick = (row: any, type: typeof modalType) => {
    loadLookups();
    setModalType(type);
    setIsEditMode(true);
    const id = 
      type === 'warehouse' ? row.WarehouseId :
      type === 'zone' ? row.ZoneId :
      type === 'aisle' ? row.AisleId :
      type === 'rack' ? row.RackId :
      type === 'shelf' ? row.ShelfId :
      type === 'bin' ? row.BinId :
      type === 'item' ? row.ItemId :
      row.UserId;
    setEditRecordId(id);
    setFormData(mapRowToForm(row, type));
    setOpenModal(true);
  };

  const handleDeleteClick = (id: number, type: typeof modalType) => {
    setDeleteTarget({ id, type });
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setConfirmOpen(false);
    const { id, type } = deleteTarget;
    let endpoint = `/masters/warehouses/${id}`;
    if (type === 'zone') endpoint = `/masters/zones/${id}`;
    if (type === 'aisle') endpoint = `/masters/aisles/${id}`;
    if (type === 'rack') endpoint = `/masters/racks/${id}`;
    if (type === 'shelf') endpoint = `/masters/shelves/${id}`;
    if (type === 'bin') endpoint = `/masters/bins/${id}`;
    if (type === 'item') endpoint = `/masters/items/${id}`;
    if (type === 'user') endpoint = `/masters/users/${id}`;

    try {
      await api.delete(endpoint);
      toast.showSuccess(`${type} deleted successfully.`);
      fetchTab(tabValue);
    } catch (err: any) {
      toast.showError(err.response?.data?.message || `Failed to delete ${type}`);
    }
    setDeleteTarget(null);
  };

  const handleCloseModal = () => setOpenModal(false);

  const handlePrintBarcodeClick = (item: any) => {
    setBarcodeItem(item);
    setIsBinPrint(false);
    setBarcodeDialogOpen(true);
  };

  const handlePrintBinBarcodeClick = (bin: any) => {
    setBarcodeItem({
      Code: bin.Barcode,
      Name: bin.Code
    });
    setIsBinPrint(true);
    setBarcodeDialogOpen(true);
  };

  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name as string]: value }));
  };

  const handleSwitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: checked }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let endpoint = '/masters/warehouses';
    if (modalType === 'zone') endpoint = '/masters/zones';
    if (modalType === 'aisle') endpoint = '/masters/aisles';
    if (modalType === 'rack') endpoint = '/masters/racks';
    if (modalType === 'shelf') endpoint = '/masters/shelves';
    if (modalType === 'bin') endpoint = '/masters/bins';
    if (modalType === 'item') endpoint = '/masters/items';
    if (modalType === 'user') endpoint = isEditMode ? `/masters/users/${editRecordId}` : '/auth/register';

    if (isEditMode && modalType !== 'user') {
      endpoint = `${endpoint}/${editRecordId}`;
    }

    try {
      if (isEditMode) {
        await api.put(endpoint, formData);
      } else {
        if (modalType === 'user') {
          // user registration needs standard payload mapping
          await api.post(endpoint, {
            username: formData.username,
            email: formData.email,
            password: formData.password || 'operator123',
            roleName: formData.roleName,
            fullName: formData.fullName,
            warehouseId: formData.warehouseId
          });
        } else {
          await api.post(endpoint, formData);
        }
      }
      handleCloseModal();
      toast.showSuccess('Record saved successfully.');
      fetchTab(tabValue);
    } catch (err: any) {
      toast.showError(err.response?.data?.message || 'Failed to save master item');
    }
  };

  const filteredData = useMemo(() => {
    return data.filter((row: any) => {
      const query = searchQuery.toLowerCase();
      return (
        (row.Code && row.Code.toLowerCase().includes(query)) ||
        (row.Name && row.Name.toLowerCase().includes(query)) ||
        (row.Barcode && row.Barcode.toLowerCase().includes(query)) ||
        (row.Username && row.Username.toLowerCase().includes(query)) ||
        (row.FullName && row.FullName.toLowerCase().includes(query))
      );
    });
  }, [data, searchQuery]);

  const paginatedData = pagination.paginate(filteredData);

  const handleExportCSV = () => {
    let headers: { key: string; header: string }[] = [];
    if (tabValue === 0) {
      headers = [{ key: 'WarehouseId', header: 'Warehouse ID' }, { key: 'Code', header: 'Code' }, { key: 'Name', header: 'Name' }, { key: 'Address', header: 'Address' }];
    } else if (tabValue === 1) {
      headers = [{ key: 'ZoneId', header: 'Zone ID' }, { key: 'WarehouseName', header: 'Warehouse' }, { key: 'Code', header: 'Code' }, { key: 'Name', header: 'Name' }];
    } else if (tabValue === 2) {
      headers = [{ key: 'RackId', header: 'Rack ID' }, { key: 'WarehouseName', header: 'Warehouse' }, { key: 'Code', header: 'Code' }, { key: 'Name', header: 'Name' }];
    } else if (tabValue === 3) {
      headers = [{ key: 'ShelfId', header: 'Shelf ID' }, { key: 'Code', header: 'Code' }, { key: 'Name', header: 'Name' }];
    } else if (tabValue === 4) {
      headers = [{ key: 'BinId', header: 'Bin ID' }, { key: 'Code', header: 'Code' }, { key: 'Barcode', header: 'Barcode' }, { key: 'CapacityWeight', header: 'Capacity Weight' }, { key: 'CapacityVolume', header: 'Capacity Volume' }];
    } else if (tabValue === 5) {
      headers = [{ key: 'ItemId', header: 'Item ID' }, { key: 'Code', header: 'Code' }, { key: 'Name', header: 'Name' }, { key: 'Category', header: 'Category' }, { key: 'UOM', header: 'UOM' }];
    } else if (tabValue === 6) {
      headers = [{ key: 'UserId', header: 'User ID' }, { key: 'Username', header: 'Username' }, { key: 'FullName', header: 'Full Name' }, { key: 'Email', header: 'Email' }, { key: 'RoleName', header: 'Role' }];
    } else if (tabValue === 7) {
      headers = [{ key: 'AisleId', header: 'Aisle ID' }, { key: 'WarehouseName', header: 'Warehouse' }, { key: 'Code', header: 'Code' }, { key: 'Name', header: 'Name' }];
    }
    exportToCSV(filteredData, headers, `WMS_Master_Tab_${tabValue}`);
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>Masters Management</Typography>
          <Typography variant="body2" color="text.secondary">Manage warehouse locations, zones, racks, shelves, physical bins, items, and users.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button variant="outlined" startIcon={<FileDown size={16} />} onClick={handleExportCSV} sx={{ fontWeight: 600 }}>
            Export CSV
          </Button>
          <Button 
            variant="contained" 
            startIcon={<Plus size={16} />} 
            onClick={handleOpenModal}
            sx={{ fontWeight: 600 }}
          >
            Add Master Record
          </Button>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs 
        value={tabValue} 
        onChange={(e, val) => setTabValue(val)} 
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab icon={<MapPin size={16} />} iconPosition="start" label="Warehouses" />
        <Tab icon={<Layers size={16} />} iconPosition="start" label="Zones" />
        <Tab icon={<Layers size={16} />} iconPosition="start" label="Racks" />
        <Tab icon={<Layers size={16} />} iconPosition="start" label="Shelves" />
        <Tab icon={<Inbox size={16} />} iconPosition="start" label="Bins" />
        <Tab icon={<Layers size={16} />} iconPosition="start" label="Items Catalogue" />
        <Tab icon={<User size={16} />} iconPosition="start" label="Users & RBAC" />
        <Tab icon={<Layers size={16} />} iconPosition="start" label="Aisles" />
      </Tabs>

      {/* Search Filter */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, alignItems: 'center' }}>
        <SearchBar value={searchQuery} onChange={(v) => { setSearchQuery(v); pagination.resetPage(); }} placeholder="Search masters..." />
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          {filteredData.length} of {data.length} records
        </Typography>
      </Box>

      {/* Data Table */}
      <Card>
        <TableContainer sx={{ maxHeight: 500 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
          ) : (
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {tabValue === 0 && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>Warehouse ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Address</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    </>
                  )}
                  {tabValue === 1 && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>Zone ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Warehouse</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Zone Code</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Zone Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    </>
                  )}
                  {tabValue === 2 && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>Rack ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Warehouse / Zone</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Rack Code</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Rack Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    </>
                  )}
                  {tabValue === 3 && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>Shelf ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Zone / Rack</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Shelf Code</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Shelf Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    </>
                  )}
                  {tabValue === 4 && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>Bin ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Bin Code (Locator)</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Barcode</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Capacity (Wt/Vol)</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Occupied (Wt/Vol)</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    </>
                  )}
                  {tabValue === 5 && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>Item ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Code</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Category/Brand</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Barcode</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>UOM</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Weight / Vol</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Tracking</TableCell>
                    </>
                  )}
                  {tabValue === 6 && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>User ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Username</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Full Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Assigned Role</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    </>
                  )}
                  {tabValue === 7 && (
                    <>
                      <TableCell sx={{ fontWeight: 600 }}>Aisle ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Warehouse / Zone</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Aisle Code</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Aisle Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    </>
                  )}
                  <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedData.map((row: any, idx: number) => (
                  <TableRow key={idx} hover>
                    {tabValue === 0 && (
                      <>
                        <TableCell>{row.WarehouseId}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Code}</TableCell>
                        <TableCell>{row.Name}</TableCell>
                        <TableCell>{row.Address}</TableCell>
                        <TableCell>{row.IsActive ? <Typography color="success.main" variant="caption" sx={{ fontWeight: 700 }}>Active</Typography> : 'Inactive'}</TableCell>
                      </>
                    )}
                    {tabValue === 1 && (
                      <>
                        <TableCell>{row.ZoneId}</TableCell>
                        <TableCell>{row.WarehouseName}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Code}</TableCell>
                        <TableCell>{row.Name}</TableCell>
                        <TableCell>{row.IsActive ? <Typography color="success.main" variant="caption" sx={{ fontWeight: 700 }}>Active</Typography> : 'Inactive'}</TableCell>
                      </>
                    )}
                    {tabValue === 2 && (
                      <>
                        <TableCell>{row.RackId}</TableCell>
                        <TableCell>{row.WarehouseName} / {row.ZoneName}{row.AisleCode ? ` / Aisle ${row.AisleCode}` : ''}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Code}</TableCell>
                        <TableCell>{row.Name}</TableCell>
                        <TableCell>{row.IsActive ? <Typography color="success.main" variant="caption" sx={{ fontWeight: 700 }}>Active</Typography> : 'Inactive'}</TableCell>
                      </>
                    )}
                    {tabValue === 3 && (
                      <>
                        <TableCell>{row.ShelfId}</TableCell>
                        <TableCell>{row.ZoneCode} / {row.RackName || `Rack ID: ${row.RackId}`}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Code}</TableCell>
                        <TableCell>{row.Name}</TableCell>
                        <TableCell>{row.IsActive ? <Typography color="success.main" variant="caption" sx={{ fontWeight: 700 }}>Active</Typography> : 'Inactive'}</TableCell>
                      </>
                    )}
                    {tabValue === 4 && (
                      <>
                        <TableCell>{row.BinId}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Code}</TableCell>
                        <TableCell><code>{row.Barcode}</code></TableCell>
                        <TableCell>{row.CapacityWeight}kg / {row.CapacityVolume}L</TableCell>
                        <TableCell>{row.OccupiedWeight}kg / {row.OccupiedVolume}L</TableCell>
                        <TableCell>{row.IsActive ? <Typography color="success.main" variant="caption" sx={{ fontWeight: 700 }}>Active</Typography> : 'Inactive'}</TableCell>
                      </>
                    )}
                    {tabValue === 5 && (
                      <>
                        <TableCell>{row.ItemId}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Code}</TableCell>
                        <TableCell>{row.Name}</TableCell>
                        <TableCell>{row.Category} / {row.Brand}</TableCell>
                        <TableCell><code>{row.Barcode || 'N/A'}</code></TableCell>
                        <TableCell>{row.UOM}</TableCell>
                        <TableCell>{row.Weight || 0}kg / {row.Volume || 0}L</TableCell>
                        <TableCell>
                          {row.TrackBatch ? 'Batch ' : ''}
                          {row.TrackSerial ? 'Serial' : ''}
                          {!row.TrackBatch && !row.TrackSerial ? 'Standard' : ''}
                        </TableCell>
                      </>
                    )}
                    {tabValue === 6 && (
                      <>
                        <TableCell>{row.UserId}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Username}</TableCell>
                        <TableCell>{row.FullName}</TableCell>
                        <TableCell>{row.Email}</TableCell>
                        <TableCell><Typography variant="caption" sx={{ fontWeight: 700, bgcolor: 'secondary.light', px: 1, py: 0.5, borderRadius: 1 }}>{row.RoleName}</Typography></TableCell>
                        <TableCell>{row.IsActive ? <Typography color="success.main" variant="caption" sx={{ fontWeight: 700 }}>Active</Typography> : 'Inactive'}</TableCell>
                      </>
                    )}
                    {tabValue === 7 && (
                      <>
                        <TableCell>{row.AisleId}</TableCell>
                        <TableCell>{row.WarehouseName} / {row.ZoneName}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{row.Code}</TableCell>
                        <TableCell>{row.Name}</TableCell>
                        <TableCell>{row.IsActive ? <Typography color="success.main" variant="caption" sx={{ fontWeight: 700 }}>Active</Typography> : 'Inactive'}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {tabValue === 4 && (
                          <Button 
                            size="small" 
                            variant="outlined" 
                            startIcon={<Printer size={14} />}
                            onClick={() => handlePrintBinBarcodeClick(row)}
                          >
                            Print
                          </Button>
                        )}
                        {tabValue === 5 && (
                          <Button 
                            size="small" 
                            variant="outlined" 
                            startIcon={<Printer size={14} />}
                            onClick={() => handlePrintBarcodeClick(row)}
                          >
                            Print
                          </Button>
                        )}
                        {canUpdate && (
                          <Button 
                            size="small" 
                            variant="outlined" 
                            onClick={() => handleEditClick(row, 
                              tabValue === 0 ? 'warehouse' :
                              tabValue === 1 ? 'zone' :
                              tabValue === 2 ? 'rack' :
                              tabValue === 3 ? 'shelf' :
                              tabValue === 4 ? 'bin' :
                              tabValue === 5 ? 'item' : 
                              tabValue === 6 ? 'user' : 'aisle'
                            )}
                          >
                            Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button 
                            size="small" 
                            variant="outlined" 
                            color="error" 
                            onClick={() => handleDeleteClick(
                              tabValue === 0 ? row.WarehouseId :
                              tabValue === 1 ? row.ZoneId :
                              tabValue === 2 ? row.RackId :
                              tabValue === 3 ? row.ShelfId :
                              tabValue === 4 ? row.BinId :
                              tabValue === 5 ? row.ItemId :
                              tabValue === 6 ? row.UserId : row.AisleId,
                              tabValue === 0 ? 'warehouse' :
                              tabValue === 1 ? 'zone' :
                              tabValue === 2 ? 'rack' :
                              tabValue === 3 ? 'shelf' :
                              tabValue === 4 ? 'bin' :
                              tabValue === 5 ? 'item' :
                              tabValue === 6 ? 'user' : 'aisle'
                            )}
                          >
                            Delete
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredData.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                      No records match your filters/search.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
        <TablePaginationBar
          count={filteredData.length}
          page={pagination.page}
          rowsPerPage={pagination.rowsPerPage}
          onPageChange={pagination.setPage}
          onRowsPerPageChange={pagination.setRowsPerPage}
        />
      </Card>

      {/* Creation Modal */}
      <Dialog open={openModal} onClose={handleCloseModal} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>
          {isEditMode ? 'Modify' : 'Add New'} WMS {modalType}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          {modalType === 'warehouse' && (
            <>
              <TextField label="Warehouse Code" name="code" value={formData.code || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Warehouse Name" name="name" value={formData.name || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Address" name="address" value={formData.address || ''} fullWidth multiline rows={2} size="small" onChange={handleInputChange} />
            </>
          )}

          {modalType === 'zone' && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel>Warehouse</InputLabel>
                <Select name="warehouseId" value={formData.warehouseId || ''} required label="Warehouse" onChange={handleInputChange}>
                  {warehouses.map(wh => <MenuItem key={wh.WarehouseId} value={wh.WarehouseId}>{wh.Name}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Zone Code" name="code" value={formData.code || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Zone Name" name="name" value={formData.name || ''} required fullWidth size="small" onChange={handleInputChange} />
            </>
          )}

          {modalType === 'rack' && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel>Zone</InputLabel>
                <Select name="zoneId" value={formData.zoneId || ''} required label="Zone" onChange={handleInputChange}>
                  {zones.map(z => <MenuItem key={z.ZoneId} value={z.ZoneId}>{z.Name} ({z.WarehouseCode})</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Aisle (Optional)</InputLabel>
                <Select name="aisleId" value={formData.aisleId || ''} label="Aisle (Optional)" onChange={handleInputChange}>
                  <MenuItem value=""><em>None</em></MenuItem>
                  {aisles.filter(a => Number(a.ZoneId) === Number(formData.zoneId)).map(a => (
                    <MenuItem key={a.AisleId} value={a.AisleId}>{a.Name} ({a.Code})</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField label="Rack Code" name="code" value={formData.code || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Rack Name" name="name" value={formData.name || ''} required fullWidth size="small" onChange={handleInputChange} />
            </>
          )}

          {modalType === 'aisle' && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel>Zone</InputLabel>
                <Select name="zoneId" value={formData.zoneId || ''} required label="Zone" onChange={handleInputChange}>
                  {zones.map(z => <MenuItem key={z.ZoneId} value={z.ZoneId}>{z.Name} ({z.WarehouseCode})</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Aisle Code" name="code" value={formData.code || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Aisle Name" name="name" value={formData.name || ''} required fullWidth size="small" onChange={handleInputChange} />
            </>
          )}

          {modalType === 'shelf' && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel>Rack</InputLabel>
                <Select name="rackId" value={formData.rackId || ''} required label="Rack" onChange={handleInputChange}>
                  {racks.map(r => <MenuItem key={r.RackId} value={r.RackId}>{r.Name} ({r.Code})</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Shelf Code" name="code" value={formData.code || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Shelf Name" name="name" value={formData.name || ''} required fullWidth size="small" onChange={handleInputChange} />
            </>
          )}

          {modalType === 'bin' && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel>Shelf</InputLabel>
                <Select name="shelfId" value={formData.shelfId || ''} required label="Shelf" onChange={handleInputChange}>
                  {shelves.map(sh => <MenuItem key={sh.ShelfId} value={sh.ShelfId}>{sh.Code} (Rack {sh.RackCode || `ID: ${sh.RackId}`})</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Bin Locator Code (e.g. WH01-Z02-R01-S01-B05)" name="code" value={formData.code || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Barcode" name="barcode" value={formData.barcode || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Capacity Weight (kg)" name="capacityWeight" type="number" value={formData.capacityWeight || 1000} fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Capacity Volume (L)" name="capacityVolume" type="number" value={formData.capacityVolume || 500} fullWidth size="small" onChange={handleInputChange} />
            </>
          )}

          {modalType === 'item' && (
            <>
              <TextField label="Item Code" name="code" value={formData.code || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Item Name" name="name" value={formData.name || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Category" name="category" value={formData.category || ''} fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Brand" name="brand" value={formData.brand || ''} fullWidth size="small" onChange={handleInputChange} />
              <TextField label="UOM" name="uom" value={formData.uom || ''} required placeholder="e.g. PCS, BOX" fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Barcode" name="barcode" value={formData.barcode || ''} fullWidth size="small" onChange={handleInputChange} />
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Unit Weight (kg)" name="weight" type="number" inputProps={{ step: "0.01" }} value={formData.weight !== undefined ? formData.weight : 0} fullWidth size="small" onChange={handleInputChange} />
                <TextField label="Unit Volume (L)" name="volume" type="number" inputProps={{ step: "0.01" }} value={formData.volume !== undefined ? formData.volume : 0} fullWidth size="small" onChange={handleInputChange} />
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Min Stock" name="minStock" type="number" value={formData.minStock || 0} fullWidth size="small" onChange={handleInputChange} />
                <TextField label="Max Stock" name="maxStock" type="number" value={formData.maxStock || 999999} fullWidth size="small" onChange={handleInputChange} />
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Unit Cost" name="unitCost" type="number" value={formData.unitCost || 0} fullWidth size="small" onChange={handleInputChange} />
                <TextField label="Selling Price" name="sellingPrice" type="number" value={formData.sellingPrice || 0} fullWidth size="small" onChange={handleInputChange} />
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <FormControlLabel control={<Switch name="trackBatch" checked={!!formData.trackBatch} onChange={handleSwitchChange} />} label="Track Batch" />
                <FormControlLabel control={<Switch name="trackSerial" checked={!!formData.trackSerial} onChange={handleSwitchChange} />} label="Track Serial No" />
              </Box>
            </>
          )}

          {modalType === 'user' && (
            <>
              <TextField label="Username" name="username" value={formData.username || ''} required fullWidth size="small" onChange={handleInputChange} disabled={isEditMode} />
              <TextField label="Full Name" name="fullName" value={formData.fullName || ''} required fullWidth size="small" onChange={handleInputChange} />
              <TextField label="Email Address" name="email" value={formData.email || ''} type="email" required fullWidth size="small" onChange={handleInputChange} />
              <TextField label={isEditMode ? "Password (Leave blank to keep current)" : "Password"} name="password" value={formData.password || ''} type="password" required={!isEditMode} fullWidth size="small" onChange={handleInputChange} />
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select name="roleName" value={formData.roleName || ''} required label="Role" onChange={handleInputChange}>
                  {roles.map(r => <MenuItem key={r.RoleId} value={r.RoleName}>{r.RoleName}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Default Warehouse</InputLabel>
                <Select name="warehouseId" value={formData.warehouseId || ''} label="Default Warehouse" onChange={handleInputChange}>
                  {warehouses.map(wh => <MenuItem key={wh.WarehouseId} value={wh.WarehouseId}>{wh.Name}</MenuItem>)}
                </Select>
              </FormControl>
            </>
          )}

          {isEditMode && (
            <FormControlLabel
              control={<Switch name="isActive" checked={formData.isActive !== false} onChange={handleSwitchChange} />}
              label="Is Active Status"
            />
          )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModal}>Cancel</Button>
          <Button variant="contained" onClick={handleFormSubmit}>Save Record</Button>
        </DialogActions>
      </Dialog>

      {/* Barcode Print Dialog */}
      {barcodeItem && (
        <BarcodePrintDialog
          open={barcodeDialogOpen}
          onClose={() => setBarcodeDialogOpen(false)}
          itemCode={barcodeItem.Code}
          itemName={barcodeItem.Name}
          batchNumber={undefined}
          defaultQty={1}
          isBin={isBinPrint}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${deleteTarget?.type}`}
        message={`Are you sure you want to delete this ${deleteTarget?.type}? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
      />
    </Box>
  );
}
