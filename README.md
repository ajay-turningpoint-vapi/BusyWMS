# BusyWMS - Enterprise Warehouse Management System

BusyWMS is a comprehensive warehouse management system designed to integrate with BUSY ERP and operate exclusively on MariaDB.

---

## Default Login Credentials

All seeded accounts share the default password: **`Busy@123`**

| Role | Username | Purpose |
| :--- | :--- | :--- |
| **System Administrator** | `admin` | Full control over settings, users, and RBAC matrix. |
| **Warehouse Manager** | `manager` | Oversees all operations, stock levels, and logs. |
| **GRN Operator** | `grn_user` | Executes purchase order receipts (GRN actions). |
| **QC Inspector** | `qc_user` | Logs quality checks on received inbound stock. |
| **Order Picker** | `picker_user` | Retreives stock from bins for wave fulfillment. |
| **Order Packer** | `packer_user` | Packages picked items and outputs carton details. |
| **Dispatcher Agent** | `dispatcher_user` | Executes outbound shipments and dispatch notes. |

---

## Local Development Port Mapping

- **Frontend Application:** `http://localhost:3000` (React Dev Server)
- **Backend API & Swagger Docs:** `http://localhost:5000/api-docs`
- **MariaDB Database Server:** Port `2048`

---

## Running the Project

### 1. Database
Ensure MariaDB is running on port `2048`. The database `BusyWMS` should be initialized with the schema located at `database/schema_mariadb.sql`.

### 2. Start Backend Server
Navigate to the `/backend` folder:
```bash
npm run dev
```

### 3. Start Frontend Server
Navigate to the `/frontend` folder:
```bash
npm run dev
```
