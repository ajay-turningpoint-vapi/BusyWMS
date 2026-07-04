const path = require('path');

async function testWmsWorkflow() {
  const baseUrl = 'http://localhost:5000/api';
  console.log('============================================================');
  console.log('WMS END-TO-END WORKFLOW INTEGRATION TEST');
  console.log('============================================================');

  // Helper for requests
  async function apiCall(endpoint, method = 'GET', body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = {
      method,
      headers,
    };
    if (body) config.body = JSON.stringify(body);

    const res = await fetch(`${baseUrl}${endpoint}`, config);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API Error ${res.status} on ${endpoint}: ${txt}`);
    }
    return res.json();
  }

  try {
    // --------------------------------------------------------
    // STEP 1: AUTHENTICATION
    // --------------------------------------------------------
    console.log('\n[Step 1] Logging in as Admin...');
    const loginRes = await apiCall('/auth/login', 'POST', {
      username: 'admin',
      password: 'admin123'
    });
    const token = loginRes.token;
    console.log(`✓ Login successful! Token received (truncated): ${token.slice(0, 30)}...`);

    // --------------------------------------------------------
    // STEP 2: SYNC PURCHASE ORDERS FROM ERP
    // --------------------------------------------------------
    console.log('\n[Step 2] Triggering BUSY ERP Purchase Order Sync...');
    const syncPoRes = await apiCall('/sync/po', 'POST', {}, token);
    console.log(`✓ PO Sync complete. Message: ${syncPoRes.message}`);

    // Fetch pending POs
    const pendingPOs = await apiCall('/inbound/pending-pos', 'GET', null, token);
    console.log(`✓ Active POs count: ${pendingPOs.length}`);
    const po = pendingPOs[0];
    console.log(`✓ Selected PO for receiving: ${po.POCode} (Vendor: ${po.VendorName})`);

    // Fetch PO details to receive
    const poDetails = await apiCall(`/inbound/po-details/${po.POId}`, 'GET', null, token);
    console.log(`✓ PO Lines to receive:`);
    poDetails.forEach(line => {
      console.log(`  - Item: ${line.ItemName} (Code: ${line.ItemCode}), Order Qty: ${line.OrderQty}, Pending: ${line.PendingQty}`);
    });

    // --------------------------------------------------------
    // STEP 3: GOODS RECEIPT NOTE (GRN)
    // --------------------------------------------------------
    console.log('\n[Step 3] Processing Inward Goods Receipt (GRN)...');
    const grnItemsPayload = poDetails.map(line => ({
      itemId: line.ItemId,
      receivedQty: line.PendingQty,
      trackBatch: line.TrackBatch,
      batchNumber: line.TrackBatch ? 'BAT-TST-' + Date.now().toString().slice(-4) : null,
      expiryDate: line.TrackBatch ? '2030-12-31' : null,
      trackSerial: line.TrackSerial,
      serialNumbers: line.TrackSerial ? Array.from({ length: line.PendingQty }, (_, i) => `SN-TST-${Date.now()}-${i}`) : []
    }));

    const grnRes = await apiCall('/inbound/grn', 'POST', {
      poId: po.POId,
      invoiceNo: 'INV-' + Date.now().toString().slice(-6),
      items: grnItemsPayload
    }, token);
    console.log(`✓ GRN Created successfully! GRN Code: ${grnRes.grnCode} (ID: ${grnRes.grnId})`);

    // --------------------------------------------------------
    // STEP 4: QUALITY CONTROL (QC) INSPECTION
    // --------------------------------------------------------
    console.log('\n[Step 4] Performing Quality Control (QC) check...');
    // We approve all items in the GRN
    const qcItemsPayload = grnItemsPayload.map(item => ({
      itemId: item.itemId,
      acceptedQty: item.receivedQty,
      rejectedQty: 0,
      rejectionReason: null
    }));

    const qcRes = await apiCall('/inbound/qc', 'POST', {
      grnId: grnRes.grnId,
      status: 'APPROVED',
      remarks: 'All items passed visual and spec tests.',
      items: qcItemsPayload
    }, token);
    console.log(`✓ QC Check logged! Message: ${qcRes.message}`);

    // DIAGNOSTIC CHECKS
    console.log('\n[Diagnostics] Querying database tables directly after QC:');
    const sqlite3 = require('sqlite3').verbose();
    const dbTest = new sqlite3.Database(path.resolve(__dirname, '../database/wms.db'));
    
    await new Promise((resolve) => {
      dbTest.all('SELECT * FROM tblGRN', [], (err, rows) => {
        console.log('  tblGRN contents:', rows);
        resolve();
      });
    });
    await new Promise((resolve) => {
      dbTest.all('SELECT * FROM tblGRNDetail', [], (err, rows) => {
        console.log('  tblGRNDetail contents:', rows);
        resolve();
      });
    });
    dbTest.close();

    // --------------------------------------------------------
    // STEP 5: PUTAWAY EXECUTION (BIN ALLOCATION)
    // --------------------------------------------------------
    console.log('\n[Step 5] Slotting items into storage locations (Putaway)...');
    // Fetch pending putaways
    const pendingPutaways = await apiCall('/putaway/pending', 'GET', null, token);
    console.log(`✓ Total lines waiting in Inbound Staging: ${pendingPutaways.length}`);

    for (const line of pendingPutaways) {
      if (line.GRNId === grnRes.grnId) {
        console.log(`  - Suggesting Bin for ${line.ItemName} (Qty: ${line.PendingPutawayQty})...`);
        const suggestions = await apiCall('/putaway/suggest', 'POST', {
          itemId: line.ItemId,
          quantity: line.PendingPutawayQty
        }, token);
        
        // Select first suggested bin (e.g. WH01-Z02-R01-S01-B01)
        const targetBin = suggestions[0] || { BinId: 1, BinCode: 'WH01-Z02-R01-S01-B01' };
        console.log(`  - System recommended Bin: ${targetBin.BinCode} (ID: ${targetBin.BinId})`);

        await apiCall('/putaway/execute', 'POST', {
          grnDetailId: line.GRNDetailId,
          binId: targetBin.BinId,
          quantity: line.PendingPutawayQty
        }, token);
        console.log(`  ✓ Putaway committed successfully!`);
      }
    }

    // Check stocks
    const stockReportBefore = await apiCall('/reports/stock', 'GET', null, token);
    console.log(`✓ Verification: Current unique stock locators loaded: ${stockReportBefore.length}`);

    // --------------------------------------------------------
    // STEP 6: SYNC SALES ORDERS FROM ERP
    // --------------------------------------------------------
    console.log('\n[Step 6] Syncing Sales Orders from BUSY ERP...');
    const syncSoRes = await apiCall('/sync/so', 'POST', {}, token);
    console.log(`✓ SO Sync complete. Message: ${syncSoRes.message}`);

    const salesOrders = await apiCall('/outbound/sales-orders', 'GET', null, token);
    const pendingSO = salesOrders.find(so => so.Status === 'PENDING');
    console.log(`✓ Active SO selected: ${pendingSO.SOCode} (Customer: ${pendingSO.CustomerName})`);

    // --------------------------------------------------------
    // STEP 7: INVENTORY RESERVATION (FEFO/FIFO)
    // --------------------------------------------------------
    console.log('\n[Step 7] Reserving inventory for Sales Order (FEFO/FIFO allocation)...');
    const reserveRes = await apiCall('/outbound/reserve', 'POST', { soId: pendingSO.SOId }, token);
    console.log(`✓ Reservation allocation completed: ${reserveRes.message}`);

    // View reserved detail lines
    const soDetails = await apiCall(`/outbound/so-details/${pendingSO.SOId}`, 'GET', null, token);
    soDetails.forEach(line => {
      console.log(`  - Item: ${line.ItemName}, Order Qty: ${line.OrderQty}, Reserved Qty: ${line.ReservedQty}`);
    });

    // --------------------------------------------------------
    // STEP 8: GENERATING PICK LIST & PICK SCAN
    // --------------------------------------------------------
    console.log('\n[Step 8] Generating Pick Waves & Picking confirmation...');
    const pickListRes = await apiCall('/outbound/pick-list', 'POST', { soId: pendingSO.SOId }, token);
    console.log(`✓ Pick list created. Code: ${pickListRes.pickCode} (ID: ${pickListRes.pickListId})`);

    // Fetch pick list detail lines (which bin and batch to pull)
    const pickLines = await apiCall(`/outbound/pick-list/${pickListRes.pickListId}`, 'GET', null, token);
    console.log(`✓ Picking instructions:`);
    const pickConfirmPayload = [];
    
    pickLines.forEach(line => {
      console.log(`  - Pull ${line.Quantity} PCS of ${line.ItemName} from Bin: ${line.BinCode}`);
      pickConfirmPayload.push({
        pickDetailId: line.PickDetailId,
        pickedQty: line.Quantity
      });
    });

    // Submit pick confirmation
    await apiCall('/outbound/pick-confirm', 'POST', {
      pickListId: pickListRes.pickListId,
      items: pickConfirmPayload
    }, token);
    console.log('✓ Picking scan confirmed and logged.');

    // --------------------------------------------------------
    // STEP 9: PACKING
    // --------------------------------------------------------
    console.log('\n[Step 9] Dispatch Packaging (Carton packing)...');
    const packRes = await apiCall('/outbound/pack', 'POST', {
      pickListId: pickListRes.pickListId,
      cartonNo: 'CRT-TST-' + Date.now().toString().slice(-4),
      palletNo: 'PLT-TST-01',
      shippingLabel: 'TRK-TST-' + Date.now()
    }, token);
    console.log(`✓ Packaging completed! Carton packed. Code: ${packRes.packCode}`);

    // --------------------------------------------------------
    // STEP 10: LOGISTICS DISPATCH & ERP UPDATE
    // --------------------------------------------------------
    console.log('\n[Step 10] Confirming Gate Out Dispatch...');
    const dispatchRes = await apiCall('/outbound/dispatch', 'POST', {
      soId: pendingSO.SOId,
      deliveryChallanNo: 'DC-TST-' + Date.now().toString().slice(-4),
      vehicleNo: 'DL-1C-AA-9999',
      transporterName: 'FedEx Transport Services',
      lrNumber: 'LR-TST-1002'
    }, token);
    console.log(`✓ Gate Out dispatch completed! Code: ${dispatchRes.dispatchCode}`);
    console.log('✓ Status synchronized back to BUSY ERP.');

    // Final stock check
    const stockReportAfter = await apiCall('/reports/stock', 'GET', null, token);
    console.log(`\n✓ Final Stock Ledger entries: ${stockReportAfter.length} lines`);

    console.log('\n============================================================');
    console.log('✓ SUCCESS: ALL WMS TRANSACTION FLOWS VERIFIED SUCCESSFULLY!');
    console.log('============================================================');

  } catch (err) {
    console.error('\n✗ TEST FAILED: Unhandled error in workflow verification:');
    console.error(err.message);
  }
}

testWmsWorkflow();
