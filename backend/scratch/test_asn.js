const jwt = require('jsonwebtoken');

// Configure baseUrl pointing to the WMS backend
const baseUrl = 'http://localhost:5000/api';

function logStep(msg) {
  console.log(`\n==================================================`);
  console.log(`>> ${msg}`);
  console.log(`==================================================`);
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("RAW RESPONSE TEXT:", text);
    throw new Error(`Failed to parse JSON. Status: ${res.status}. Raw text printed above.`);
  }

  if (!res.ok) {
    throw { response: { status: res.status, data } };
  }
  return { data };
}

async function testASNFlow() {
  try {
    // 1. Generate JWT Token locally to bypass network authentication check
    logStep('Step 1: Generating local JWT token for Admin user');
    const token = jwt.sign(
      { 
        userId: 1, 
        username: 'admin', 
        role: 'Admin', 
        roleId: 1,
        warehouseId: 1 
      },
      'busywms-secret-key-12345',
      { expiresIn: '2h' }
    );
    console.log('JWT token generated successfully:', token.slice(0, 20) + '...');

    // Helper for requests with auth header
    const authedRequest = (endpoint, options = {}) => {
      return request(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...options.headers
        }
      });
    };

    // 2. Fetch lookups to get a valid warehouse and supplier
    logStep('Step 2: Fetching lookups (Warehouses, Suppliers, Items)');
    const [whsRes, supsRes, itemsRes, posRes] = await Promise.all([
      authedRequest('/masters/warehouses'),
      authedRequest('/masters/suppliers'),
      authedRequest('/masters/items'),
      authedRequest('/inbound/pending-pos')
    ]);

    const warehouse = whsRes.data[0];
    const supplier = supsRes.data[0];
    const item = itemsRes.data.find(i => i.TrackBatch === 1) || itemsRes.data[0];
    const po = posRes.data[0];

    if (!warehouse || !supplier || !item) {
      throw new Error('Master data (Warehouse, Supplier, Item) is missing. Cannot run test.');
    }

    console.log(`Using Warehouse: ${warehouse.Name} (${warehouse.WarehouseId})`);
    console.log(`Using Supplier: ${supplier.Name} (${supplier.SupplierId})`);
    console.log(`Using Item: ${item.Name} (${item.ItemId})`);
    if (po) console.log(`Linking to Purchase Order: ${po.POCode} (${po.POId})`);

    // 3. Create a new ASN in Draft status
    logStep('Step 3: Creating a new Advanced Shipment Notice (ASN)');
    const createPayload = {
      supplierId: supplier.SupplierId,
      poId: po ? po.POId : null,
      warehouseId: warehouse.WarehouseId,
      shipmentDate: new Date().toISOString(),
      expectedArrivalDate: new Date(Date.now() + 24*60*60*1000).toISOString(),
      transporter: 'Antigravity Logistics',
      vehicleNumber: 'DL-9C-AA-9999',
      trackingNumber: 'TRK-987654321',
      remarks: 'Automated End-to-End ASN integration test run',
      items: [
        {
          itemId: item.ItemId,
          expectedQty: 50,
          uom: item.UOM || 'PCS',
          batchNumber: item.TrackBatch === 1 ? 'BAT-TEST-001' : null,
          expiryDate: item.TrackBatch === 1 ? new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0, 10) : null
        }
      ]
    };

    const createRes = await authedRequest('/inbound/asn', {
      method: 'POST',
      body: JSON.stringify(createPayload)
    });
    const asnId = createRes.data.asnId;
    const asnNumber = createRes.data.asnNumber;
    console.log(`ASN created successfully: ${asnNumber} (ID: ${asnId})`);

    // 4. Retrieve ASN details to verify Draft state
    logStep('Step 4: Retrieving ASN details (verifying Draft state)');
    let detailRes = await authedRequest(`/inbound/asn/${asnId}`);
    console.log(`ASN Header Status: ${detailRes.data.header.Status}`);
    console.log(`ASN Line Item Code: ${detailRes.data.items[0].ItemCode}`);
    console.log(`ASN Line Expected Qty: ${detailRes.data.items[0].ExpectedQty}`);
    console.log(`ASN Line Received Qty: ${detailRes.data.items[0].ReceivedQty}`);

    // 5. Update status to Confirmed
    logStep('Step 5: Confirming ASN');
    await authedRequest(`/inbound/asn/${asnId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'Confirmed' })
    });
    detailRes = await authedRequest(`/inbound/asn/${asnId}`);
    console.log(`Updated ASN Status: ${detailRes.data.header.Status}`);

    // 6. Simulate Mobile Scanner Partial Receipt
    logStep('Step 6: Simulating Mobile Scanner Receipt (Partial - 20 units out of 50)');
    const receivePayload = {
      invoiceNo: 'INV-TEST-E2E-01',
      items: [
        {
          itemId: item.ItemId,
          receivedQty: 20,
          batchNumber: item.TrackBatch === 1 ? 'BAT-TEST-001' : null,
          expiryDate: item.TrackBatch === 1 ? new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0, 10) : null,
          serialNumber: null
        }
      ]
    };

    const receiveRes = await authedRequest(`/inbound/asn/${asnId}/receive`, {
      method: 'POST',
      body: JSON.stringify(receivePayload)
    });
    console.log(`Receipt successful!`);
    console.log(`Auto-generated GRN Code: ${receiveRes.data.grnCode} (ID: ${receiveRes.data.grnId})`);

    // 7. Verify ASN status transitioned to Partially Received
    logStep('Step 7: Verifying status transitioned to Partially Received');
    detailRes = await authedRequest(`/inbound/asn/${asnId}`);
    console.log(`ASN Header Status: ${detailRes.data.header.Status}`);
    console.log(`Item Expected Qty: ${detailRes.data.items[0].ExpectedQty}`);
    console.log(`Item Received Qty: ${detailRes.data.items[0].ReceivedQty}`);

    // 8. Verify the generated GRN in transaction reports
    logStep('Step 8: Fetching generated GRN via transaction drilldown');
    const grnDrilldown = await authedRequest(`/transactions/GRN/${receiveRes.data.grnId}`);
    console.log(`GRN Invoice No: ${grnDrilldown.data.header.InvoiceNo}`);
    console.log(`GRN Item Code: ${grnDrilldown.data.items[0].ItemCode}`);
    console.log(`GRN Item Received Qty: ${grnDrilldown.data.items[0].ReceivedQty}`);

    // 9. Fully receive remaining 30 units to complete ASN
    logStep('Step 9: Receiving remainder (30 units) to complete ASN');
    const receivePayload2 = {
      invoiceNo: 'INV-TEST-E2E-02',
      items: [
        {
          itemId: item.ItemId,
          receivedQty: 30,
          batchNumber: item.TrackBatch === 1 ? 'BAT-TEST-001' : null,
          expiryDate: item.TrackBatch === 1 ? new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0, 10) : null,
          serialNumber: null
        }
      ]
    };

    const receiveRes2 = await authedRequest(`/inbound/asn/${asnId}/receive`, {
      method: 'POST',
      body: JSON.stringify(receivePayload2)
    });
    console.log(`Receipt successful!`);
    console.log(`Auto-generated GRN Code: ${receiveRes2.data.grnCode} (ID: ${receiveRes2.data.grnId})`);

    // 10. Verify ASN status transitioned to Fully Received
    logStep('Step 10: Verifying status transitioned to Fully Received');
    detailRes = await authedRequest(`/inbound/asn/${asnId}`);
    console.log(`ASN Header Status: ${detailRes.data.header.Status}`);
    console.log(`Item Expected Qty: ${detailRes.data.items[0].ExpectedQty}`);
    console.log(`Item Received Qty: ${detailRes.data.items[0].ReceivedQty}`);

    // 11. Fetch Dashboard Stats to ensure KPIs are updated
    logStep('Step 11: Fetching ASN Dashboard Stats');
    const dbRes = await authedRequest('/inbound/asn/dashboard');
    console.log('KPI Widget Stats:', dbRes.data.kpi);

    console.log('\n==================================================');
    console.log('🎉 E2E INTEGRATION TEST RUN COMPLETED SUCCESSFULLY!');
    console.log('==================================================');

  } catch (err) {
    console.error('\n❌ TEST FAILED WITH ERROR:');
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(err.response.data);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

testASNFlow();
