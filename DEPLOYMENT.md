# Deployment Guide: BusyWMS Enterprise

This document details the configuration, database restoration, manual compilation, and container orchestration guide for **BusyWMS**.

---

## 1. Prerequisites
Ensure you have the following installed on your host system:
* **Node.js** (v18 or v20) & npm
* **Microsoft SQL Server** (2016 or newer) OR **Docker**
* **Git**

---

## 2. Directory Structure
```
BusyWMS/
├── database/            # SQL Scripts (schema, views, stored procedures, seed data)
├── backend/             # Node.js + Express API server (TypeScript)
├── frontend/            # React + Vite client app (TypeScript)
├── Dockerfile.backend   # Docker image for backend API
├── Dockerfile.frontend  # Docker image for frontend client
├── nginx.conf           # Custom Nginx proxy configuration
└── docker-compose.yml   # Multi-container orchestration
```

---

## 3. Database Set Up (MSSQL)
To set up the database locally on your SQL Server instance:
1. Connect to your SQL Server using **SQL Server Management Studio (SSMS)** or VS Code MSSQL Extension.
2. Open and execute the scripts in the following order:
   - [schema.sql](file:///d:/node/BusyWMS/database/schema.sql): Generates tables, foreign keys, and indexes.
   - [views.sql](file:///d:/node/BusyWMS/database/views.sql): Generates analysis views.
   - [sps.sql](file:///d:/node/BusyWMS/database/sps.sql): Generates stored procedures.
   - [triggers.sql](file:///d:/node/BusyWMS/database/triggers.sql): Configures triggers for inventory logs.
   - [seed.sql](file:///d:/node/BusyWMS/database/seed.sql): Populates demo inventory and orders.

---

## 4. Manual Local Execution (For Development)

### Backend setup
1. Open terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Copy environment sample:
   ```bash
   cp .env.example .env
   ```
3. Set `DB_TYPE=MSSQL` in `.env` and fill in SQL server host, username, and password. (Or leave as `SQLITE` to run locally without SQL Server).
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start development hot-reload server:
   ```bash
   npm run dev
   ```
   API Server runs on `http://localhost:5000`. Swagger API docs are served at `http://localhost:5000/api-docs`.

### Frontend setup
1. Open another terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Vite client server:
   ```bash
   npm run dev
   ```
   Client website will run on `http://localhost:3000` with hot-reload enabled.

---

## 5. Docker Orchestration (Single-Command Launch)
To run the entire stack including MSSQL Server, Node.js API, and Nginx client proxy:
1. Start the container stack:
   ```bash
   docker-compose up --build -d
   ```
2. Access the frontend app at `http://localhost`. The backend API proxy is exposed on `http://localhost/api`.

---

## 6. Backup Strategy
To secure production inventory history, schedule the following SQL server backups:
1. **Transaction Log Backups**: Every hour (to support point-in-time recovery during transaction locks).
2. **Differential Backups**: Daily at midnight.
3. **Full Database Backups**: Weekly (Sunday 02:00 AM).
4. **Export Script (Powershell example)**:
   ```powershell
   Backup-SqlDatabase -ServerInstance "localhost" -Database "BusyWMS" -BackupFile "D:\backups\BusyWMS_Full.bak"
   ```
