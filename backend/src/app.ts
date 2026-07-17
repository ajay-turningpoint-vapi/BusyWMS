import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import cookieParser from 'cookie-parser';
import db from './config/db';
import mssqlDb from './config/mssql';

// Controllers
import { AuthController } from './interfaces/controllers/AuthController';
import { MasterController } from './interfaces/controllers/MasterController';
import { SyncController } from './interfaces/controllers/SyncController';
import { GrnController } from './interfaces/controllers/GrnController';
import { PutawayController } from './interfaces/controllers/PutawayController';
import { InventoryController } from './interfaces/controllers/InventoryController';
import { OutboundController } from './interfaces/controllers/OutboundController';
import { ReportController } from './interfaces/controllers/ReportController';
import { SettingController } from './interfaces/controllers/SettingController';
import { CycleCountController } from './interfaces/controllers/CycleCountController';
import { DamageController } from './interfaces/controllers/DamageController';
import { BarcodeController } from './interfaces/controllers/BarcodeController';
import { BarcodeTemplateController } from './interfaces/controllers/BarcodeTemplateController';
import { NotificationController } from './interfaces/controllers/NotificationController';
import { ASNController } from './interfaces/controllers/ASNController';
import { ReturnsController } from './interfaces/controllers/ReturnsController';
import { syncScheduler } from './services/SyncScheduler';
import { swaggerDocument } from './swagger';

// Middlewares
import { authenticateJWT, requireRoles, requireFeature, requirePermission } from './interfaces/middlewares/auth';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*', // Set CORS_ORIGIN env var in production to whitelist specific frontend URLs
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json({ limit: '2mb' })); // Security: body size limit prevents payload bombs
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// Socket.io connection logging
io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);
  
  socket.on('join_warehouse', (warehouseId) => {
    socket.join(`warehouse_${warehouseId}`);
    console.log(`Socket ${socket.id} joined warehouse_${warehouseId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Broadcast helper middleware to expose Socket.IO in routes
app.use((req: any, res, next) => {
  req.io = io;
  next();
});

// ==========================================
// API ROUTES
// ==========================================

// Auth Routes
app.post('/api/auth/login', AuthController.login);
app.post('/api/auth/refresh', AuthController.refresh);
app.post('/api/auth/logout', AuthController.logout);
// BUG-013 FIX: Register is now protected — only Admins can create new users
app.post('/api/auth/register', authenticateJWT, requireRoles(['Admin']), AuthController.register);
app.get('/api/auth/profile', authenticateJWT, AuthController.getProfile);

// Masters (RBAC Enforced)
app.get('/api/masters/warehouses', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getWarehouses);
app.post('/api/masters/warehouses', authenticateJWT, requirePermission('Masters', 'create'), MasterController.createWarehouse);
app.put('/api/masters/warehouses/:id', authenticateJWT, requirePermission('Masters', 'update'), MasterController.updateWarehouse);
app.delete('/api/masters/warehouses/:id', authenticateJWT, requirePermission('Masters', 'delete'), MasterController.deleteWarehouse);

app.get('/api/masters/zones', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getZones);
app.post('/api/masters/zones', authenticateJWT, requirePermission('Masters', 'create'), MasterController.createZone);
app.put('/api/masters/zones/:id', authenticateJWT, requirePermission('Masters', 'update'), MasterController.updateZone);
app.delete('/api/masters/zones/:id', authenticateJWT, requirePermission('Masters', 'delete'), MasterController.deleteZone);

app.get('/api/masters/racks', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getRacks);
app.post('/api/masters/racks', authenticateJWT, requirePermission('Masters', 'create'), MasterController.createRack);
app.put('/api/masters/racks/:id', authenticateJWT, requirePermission('Masters', 'update'), MasterController.updateRack);
app.delete('/api/masters/racks/:id', authenticateJWT, requirePermission('Masters', 'delete'), MasterController.deleteRack);

app.get('/api/masters/shelves', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getShelves);
app.post('/api/masters/shelves', authenticateJWT, requirePermission('Masters', 'create'), MasterController.createShelf);
app.put('/api/masters/shelves/:id', authenticateJWT, requirePermission('Masters', 'update'), MasterController.updateShelf);
app.delete('/api/masters/shelves/:id', authenticateJWT, requirePermission('Masters', 'delete'), MasterController.deleteShelf);

app.get('/api/masters/bins', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getBins);
app.get('/api/masters/bins/:id/details', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getBinDetails);
app.post('/api/masters/bins', authenticateJWT, requirePermission('Masters', 'create'), MasterController.createBin);
app.put('/api/masters/bins/:id', authenticateJWT, requirePermission('Masters', 'update'), MasterController.updateBin);
app.delete('/api/masters/bins/:id', authenticateJWT, requirePermission('Masters', 'delete'), MasterController.deleteBin);

app.get('/api/masters/items', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getItems);
app.post('/api/masters/items', authenticateJWT, requirePermission('Masters', 'create'), MasterController.createItem);
app.put('/api/masters/items/:id', authenticateJWT, requirePermission('Masters', 'update'), MasterController.updateItem);
app.delete('/api/masters/items/:id', authenticateJWT, requirePermission('Masters', 'delete'), MasterController.deleteItem);

app.get('/api/masters/batches', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getBatches);
app.get('/api/masters/serials', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getSerials);
app.get('/api/masters/roles', authenticateJWT, requireRoles(['Admin']), MasterController.getRoles);
app.get('/api/masters/users', authenticateJWT, requireRoles(['Admin', 'Warehouse Manager']), MasterController.getUsers);
app.put('/api/masters/users/:id', authenticateJWT, requireRoles(['Admin', 'Warehouse Manager']), MasterController.updateUser);
app.delete('/api/masters/users/:id', authenticateJWT, requireRoles(['Admin']), MasterController.deleteUser);
app.get('/api/masters/suppliers', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getSuppliers);
app.post('/api/masters/suppliers', authenticateJWT, requirePermission('Masters', 'create'), MasterController.createSupplier);
app.put('/api/masters/suppliers/:id', authenticateJWT, requirePermission('Masters', 'update'), MasterController.updateSupplier);
app.delete('/api/masters/suppliers/:id', authenticateJWT, requirePermission('Masters', 'delete'), MasterController.deleteSupplier);

app.get('/api/masters/customers', authenticateJWT, requirePermission('Masters', 'read'), MasterController.getCustomers);
app.post('/api/masters/customers', authenticateJWT, requirePermission('Masters', 'create'), MasterController.createCustomer);
app.put('/api/masters/customers/:id', authenticateJWT, requirePermission('Masters', 'update'), MasterController.updateCustomer);
app.delete('/api/masters/customers/:id', authenticateJWT, requirePermission('Masters', 'delete'), MasterController.deleteCustomer);

// Inbound Operations
app.get('/api/inbound/pending-pos', authenticateJWT, requirePermission('Inbound', 'read'), GrnController.getPendingPOs);
app.get('/api/inbound/po-details/:poId', authenticateJWT, requirePermission('Inbound', 'read'), GrnController.getPODetails);
app.post('/api/inbound/grn', authenticateJWT, requirePermission('Inbound', 'create'), GrnController.createGRN);
app.post('/api/inbound/grn/sync/:grnId', authenticateJWT, requirePermission('Inbound', 'create'), GrnController.syncGRNToERP);
app.get('/api/inbound/grns', authenticateJWT, requirePermission('Inbound', 'read'), GrnController.getGRNs);
app.get('/api/inbound/grn-details/:grnId', authenticateJWT, requirePermission('Inbound', 'read'), GrnController.getGRNDetails);
app.post('/api/inbound/qc', authenticateJWT, requirePermission('Inbound', 'create'), GrnController.processQC);
app.get('/api/inbound/purchase-orders', authenticateJWT, requirePermission('Inbound', 'read'), GrnController.getPurchaseOrders);
app.get('/api/inbound/purchase-orders/:poId', authenticateJWT, requirePermission('Inbound', 'read'), GrnController.getPODetailLines);
app.post('/api/inbound/purchase-orders', authenticateJWT, requirePermission('Inbound', 'create'), GrnController.createPurchaseOrder);
app.put('/api/inbound/purchase-orders/:poId', authenticateJWT, requirePermission('Inbound', 'update'), GrnController.updatePurchaseOrder);
app.delete('/api/inbound/purchase-orders/:poId', authenticateJWT, requirePermission('Inbound', 'delete'), GrnController.deletePurchaseOrder);

// ASN Operations
app.get('/api/inbound/asn', authenticateJWT, requirePermission('Inbound', 'read'), requireFeature('MODULE_ASN'), ASNController.getASNs);
app.get('/api/inbound/asn/dashboard', authenticateJWT, requirePermission('Inbound', 'read'), requireFeature('MODULE_ASN'), ASNController.getDashboardStats);
app.get('/api/inbound/asn/reports', authenticateJWT, requirePermission('Reports', 'read'), requireFeature('MODULE_ASN'), ASNController.getReportsData);
app.get('/api/inbound/asn/:id', authenticateJWT, requirePermission('Inbound', 'read'), requireFeature('MODULE_ASN'), ASNController.getASNDetails);
app.post('/api/inbound/asn', authenticateJWT, requirePermission('Inbound', 'create'), requireFeature('MODULE_ASN'), ASNController.createASN);
app.put('/api/inbound/asn/:id', authenticateJWT, requirePermission('Inbound', 'update'), requireFeature('MODULE_ASN'), ASNController.updateASN);
app.put('/api/inbound/asn/:id/status', authenticateJWT, requirePermission('Inbound', 'update'), requireFeature('MODULE_ASN'), ASNController.updateStatus);
app.delete('/api/inbound/asn/:id', authenticateJWT, requirePermission('Inbound', 'delete'), requireFeature('MODULE_ASN'), ASNController.deleteASN);
app.post('/api/inbound/asn/:id/receive', authenticateJWT, requirePermission('Inbound', 'update'), requireFeature('MODULE_ASN'), ASNController.receiveASN);


// Putaway Operations
app.get('/api/putaway/pending', authenticateJWT, requirePermission('Inbound', 'read'), PutawayController.getPendingPutaway);
app.post('/api/putaway/suggest', authenticateJWT, requirePermission('Inbound', 'read'), requireFeature('MODULE_PUTAWAY'), PutawayController.suggestBins);
app.post('/api/putaway/execute', authenticateJWT, requirePermission('Inbound', 'update'), requireFeature('MODULE_PUTAWAY'), PutawayController.executePutaway);
app.get('/api/putaway/history', authenticateJWT, requirePermission('Inbound', 'read'), PutawayController.getPutawayHistory);

// Inventory & Stock Transfers
app.get('/api/inventory/stock', authenticateJWT, requirePermission('Inventory', 'read'), InventoryController.getInventory);
app.get('/api/inventory/serials', authenticateJWT, requirePermission('Inventory', 'read'), InventoryController.getSerialStocks);
app.post('/api/inventory/transfer', authenticateJWT, requirePermission('Inventory', 'create'), InventoryController.transferStock);
app.get('/api/inventory/transfers', authenticateJWT, requirePermission('Inventory', 'read'), InventoryController.getTransferHistory);

app.get('/api/inventory/replenishment/suggestions', authenticateJWT, requirePermission('Inventory', 'read'), requireFeature('MODULE_REPLENISHMENT'), InventoryController.getReplenishmentSuggestions);
app.post('/api/inventory/replenishment/execute', authenticateJWT, requirePermission('Inventory', 'update'), requireFeature('MODULE_REPLENISHMENT'), InventoryController.executeReplenishment);

// Cycle Counting & Stock Verification
app.post('/api/inventory/cycle-count', authenticateJWT, requirePermission('Inventory', 'create'), CycleCountController.createCycleCount);
app.get('/api/inventory/cycle-counts', authenticateJWT, requirePermission('Inventory', 'read'), CycleCountController.getCycleCounts);
app.get('/api/inventory/cycle-count/:id', authenticateJWT, requirePermission('Inventory', 'read'), CycleCountController.getCycleCountDetails);
app.post('/api/inventory/cycle-count/record', authenticateJWT, requirePermission('Inventory', 'update'), CycleCountController.recordCountQty);
app.post('/api/inventory/cycle-count/approve', authenticateJWT, requirePermission('Inventory', 'update'), CycleCountController.approveCycleCount);

// Damage Stock Controls
app.post('/api/inventory/damage/report', authenticateJWT, requirePermission('Inventory', 'create'), DamageController.reportDamage);
app.get('/api/inventory/damages', authenticateJWT, requirePermission('Inventory', 'read'), DamageController.getDamages);
app.post('/api/inventory/damage/review', authenticateJWT, requirePermission('Inventory', 'update'), DamageController.reviewDamage);

// Returns & Restocking Operations
app.get('/api/inventory/returns', authenticateJWT, requirePermission('Inbound', 'read'), requireFeature('MODULE_RETURNS'), ReturnsController.getReturns);
app.post('/api/inventory/returns/receive', authenticateJWT, requirePermission('Inbound', 'create'), requireFeature('MODULE_RETURNS'), ReturnsController.receiveReturn);
app.post('/api/inventory/returns/process-qc', authenticateJWT, requirePermission('Inbound', 'update'), requireFeature('MODULE_RETURNS'), ReturnsController.processReturnQC);
app.get('/api/inventory/returns/order-details', authenticateJWT, requirePermission('Inbound', 'read'), requireFeature('MODULE_RETURNS'), ReturnsController.getOrderDetailsByCode);

// Outbound Operations
app.get('/api/outbound/sales-orders', authenticateJWT, requirePermission('Outbound', 'read'), OutboundController.getSalesOrders);
app.get('/api/outbound/so-details/:soId', authenticateJWT, requirePermission('Outbound', 'read'), OutboundController.getSODetails);
app.post('/api/outbound/reserve', authenticateJWT, requirePermission('Outbound', 'update'), OutboundController.reserveSO);
app.post('/api/outbound/release', authenticateJWT, requirePermission('Outbound', 'update'), OutboundController.releaseSO);
app.post('/api/outbound/sales-orders', authenticateJWT, requirePermission('Outbound', 'create'), OutboundController.createSalesOrder);
app.put('/api/outbound/sales-orders/:soId', authenticateJWT, requirePermission('Outbound', 'update'), OutboundController.updateSalesOrder);
app.delete('/api/outbound/sales-orders/:soId', authenticateJWT, requirePermission('Outbound', 'delete'), OutboundController.deleteSalesOrder);

// Picking & Packing
app.post('/api/outbound/pick-list', authenticateJWT, requirePermission('Outbound', 'create'), requireFeature('MODULE_PICKUP'), OutboundController.createPickList);
app.get('/api/outbound/pick-lists', authenticateJWT, requirePermission('Outbound', 'read'), requireFeature('MODULE_PICKUP'), OutboundController.getPickLists);
app.get('/api/outbound/pick-list/:pickListId', authenticateJWT, requirePermission('Outbound', 'read'), requireFeature('MODULE_PICKUP'), OutboundController.getPickListDetails);
app.post('/api/outbound/pick-confirm', authenticateJWT, requirePermission('Outbound', 'update'), requireFeature('MODULE_PICKUP'), OutboundController.confirmPick);
app.post('/api/outbound/pack', authenticateJWT, requirePermission('Outbound', 'update'), requireFeature('MODULE_DISPATCH'), OutboundController.executePacking);

// Dispatch
app.post('/api/outbound/dispatch', authenticateJWT, requirePermission('Outbound', 'update'), requireFeature('MODULE_DISPATCH'), OutboundController.confirmDispatch);

// Wave & Batch Picking
app.get('/api/outbound/waves', authenticateJWT, requirePermission('Outbound', 'read'), requireFeature('MODULE_PICKUP'), OutboundController.getWaves);
app.post('/api/outbound/wave', authenticateJWT, requirePermission('Outbound', 'create'), requireFeature('MODULE_PICKUP'), OutboundController.createWave);
app.get('/api/outbound/batch-pick-summary', authenticateJWT, requirePermission('Outbound', 'read'), requireFeature('MODULE_PICKUP'), OutboundController.getBatchPickSummary);

// System Settings, Features & Permissions (Protected by Settings resource or Roles)
app.get('/api/settings/features', authenticateJWT, SettingController.getFeatures);
app.put('/api/settings/features', authenticateJWT, requirePermission('Settings', 'update'), SettingController.updateFeatures);
app.get('/api/settings/configs', authenticateJWT, requirePermission('Settings', 'read'), SettingController.getSettings);
app.put('/api/settings/configs', authenticateJWT, requirePermission('Settings', 'update'), SettingController.updateSettings);
app.get('/api/settings/permissions', authenticateJWT, requirePermission('Settings', 'read'), SettingController.getPermissions);
app.put('/api/settings/permissions', authenticateJWT, requirePermission('Settings', 'update'), SettingController.updatePermissions);
app.get('/api/settings/login-history', authenticateJWT, requirePermission('Settings', 'read'), SettingController.getLoginHistory);

// Barcode Generation & Scanning Validations
app.get('/api/barcode/generate', BarcodeController.generateBarcode);
app.post('/api/barcode/validate', authenticateJWT, requireFeature('MODULE_BARCODE'), BarcodeController.validateBarcode);
app.get('/api/barcode/print-details', authenticateJWT, BarcodeController.getPrintDetails);


// Barcode Templates Configuration CRUD
app.get('/api/barcode/templates', authenticateJWT, requirePermission('Settings', 'read'), BarcodeTemplateController.getTemplates);
app.get('/api/barcode/templates/:id', authenticateJWT, requirePermission('Settings', 'read'), BarcodeTemplateController.getTemplateById);
app.post('/api/barcode/templates', authenticateJWT, requirePermission('Settings', 'update'), BarcodeTemplateController.createTemplate);
app.put('/api/barcode/templates/:id', authenticateJWT, requirePermission('Settings', 'update'), BarcodeTemplateController.updateTemplate);
app.delete('/api/barcode/templates/:id', authenticateJWT, requirePermission('Settings', 'update'), BarcodeTemplateController.deleteTemplate);
app.post('/api/barcode/templates/:id/default', authenticateJWT, requirePermission('Settings', 'update'), BarcodeTemplateController.setDefaultTemplate);

// System & User Notifications
app.get('/api/notifications', authenticateJWT, requireFeature('MODULE_NOTIFICATIONS'), NotificationController.getNotifications);
app.put('/api/notifications/:id/read', authenticateJWT, requireFeature('MODULE_NOTIFICATIONS'), NotificationController.markAsRead);
app.post('/api/notifications/mark-all-read', authenticateJWT, requireFeature('MODULE_NOTIFICATIONS'), NotificationController.markAllRead);

// ERP Sync Logs & Retry
app.get('/api/sync/logs', authenticateJWT, requirePermission('Settings', 'read'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.getLogs);
app.post('/api/sync/po', authenticateJWT, requirePermission('Inbound', 'create'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.syncPurchaseOrders);
app.post('/api/sync/so', authenticateJWT, requirePermission('Outbound', 'create'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.syncSalesOrders);
app.post('/api/sync/suppliers', authenticateJWT, requirePermission('Masters', 'create'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.syncSuppliers);
app.post('/api/sync/customers', authenticateJWT, requirePermission('Masters', 'create'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.syncCustomers);
app.post('/api/sync/items', authenticateJWT, requirePermission('Masters', 'create'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.syncItems);
app.get('/api/sync/erp-items', authenticateJWT, requirePermission('Masters', 'read'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.getErpItems);
app.get('/api/sync/erp-po', authenticateJWT, requirePermission('Inbound', 'read'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.getErpPurchaseOrders);
app.get('/api/sync/erp-so', authenticateJWT, requirePermission('Outbound', 'read'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.getErpSalesOrders);
app.post('/api/sync/purchase-invoices', authenticateJWT, requirePermission('Inbound', 'create'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.syncPurchaseInvoices);
app.post('/api/sync/sales-invoices', authenticateJWT, requirePermission('Outbound', 'create'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.syncSalesInvoices);
app.post('/api/sync/retry/:logId', authenticateJWT, requirePermission('Settings', 'update'), requireFeature('MODULE_BUSY_INTEGRATION'), SyncController.retryLog);

// Reports & Dashboard
app.get('/api/reports/dashboard', authenticateJWT, ReportController.getDashboardStats);
app.get('/api/reports/stock', authenticateJWT, ReportController.getStockReport);
app.get('/api/reports/audit-logs', authenticateJWT, ReportController.getAuditLogs);
app.get('/api/reports/pending-so', authenticateJWT, ReportController.getPendingSOReport);
app.get('/api/reports/pending-po', authenticateJWT, ReportController.getPendingPOReport);
app.get('/api/reports/created-grns', authenticateJWT, ReportController.getCreatedGRNsReport);
app.get('/api/reports/po-grn-history/:poId', authenticateJWT, ReportController.getPOGrnHistory);
app.get('/api/reports/so-dispatch-history/:soId', authenticateJWT, ReportController.getSODispatchHistory);
app.get('/api/reports/bin-capacity', authenticateJWT, ReportController.getBinCapacities);
app.get('/api/reports/replenishment', authenticateJWT, ReportController.getReplenishmentReport);
app.get('/api/reports/replenishment/logs', authenticateJWT, ReportController.getReplenishmentLogs);
app.get('/api/transactions/search', authenticateJWT, ReportController.searchTransactions);
app.get('/api/transactions/:type/:id', authenticateJWT, ReportController.getTransactionDetails);
app.put('/api/transactions/:type/:id', authenticateJWT, ReportController.updateTransaction);
app.delete('/api/transactions/:type/:id', authenticateJWT, ReportController.deleteTransaction);


// ==========================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/api-docs-json', (req, res) => {
  res.json(swaggerDocument);
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

function checkErpConnection() {
  const host = process.env.BUSY_ERP_HOST || '192.168.1.11';
  const port = parseInt(process.env.BUSY_ERP_PORT || '999', 10);
  
  const options = {
    hostname: host,
    port: port,
    path: '/',
    method: 'GET',
    timeout: 5000
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log('Connected to ERP successfully.');
    });
  });

  req.on('timeout', () => {
    req.destroy();
    console.log('Warning: Cannot connect to ERP system (Timeout).');
  });

  req.on('error', (err: any) => {
    console.log('Warning: Cannot connect to ERP system.');
  });

  req.end();
}

// Database and Server Startup
db.connect().then(async () => {
  // Initialize MSSQL connection and log result
  try {
    await mssqlDb.connect();
  } catch (err: any) {
    console.error('Warning: MSSQL Database connection could not be established on startup.');
  }

  // Start Background Sync Scheduler
  syncScheduler.start();

  // Check ERP connection
  checkErpConnection();

  server.listen(PORT, () => {
    console.log(`BusyWMS API running on port ${PORT}`);
    console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
  });
}).catch(err => {
  console.error('Failed to initialize database connection:', err);
});
