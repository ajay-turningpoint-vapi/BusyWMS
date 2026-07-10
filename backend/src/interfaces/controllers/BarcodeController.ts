import { Request, Response } from 'express';
import { db } from '../../config/db';
import bwipjs from 'bwip-js';

export class BarcodeController {

  // Generates a Barcode/QR Code image dynamically in PNG format using bwip-js
  public static async generateBarcode(req: Request, res: Response) {
    const text = req.query.text as string;
    const type = (req.query.type as string || 'code128').toLowerCase();
    const scale = parseInt(req.query.scale as string || '2', 10);
    const height = parseInt(req.query.height as string || '15', 10);
    const includeText = req.query.includetext !== 'false';

    if (!text) {
      return res.status(400).json({ message: 'text parameter is required' });
    }

    let bcid = 'code128';
    if (type === 'code39') bcid = 'code39';
    else if (type === 'ean13') bcid = 'ean13';
    else if (type === 'ean8') bcid = 'ean8';
    else if (type === 'upc' || type === 'upca') bcid = 'upca';
    else if (type === 'qrcode' || type === 'qr') bcid = 'qrcode';

    try {
      const options: any = {
        bcid,
        text,
        scale: scale > 0 && scale < 10 ? scale : 2,
        includetext: bcid !== 'qrcode' ? includeText : false,
        textxalign: 'center',
      };

      if (bcid !== 'qrcode') {
        options.height = height > 0 && height <= 300 ? height : 15;
      }

      bwipjs.toBuffer(options, (err, png) => {
        if (err) {
          console.error('bwip-js rendering failed:', err);
          return res.status(500).json({ message: 'Barcode rendering failed', error: err instanceof Error ? err.message : String(err) });
        }
        res.setHeader('Content-Type', 'image/png');
        return res.send(png);
      });
    } catch (err: any) {
      console.error('Barcode generation error:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Validates a scanned barcode
  public static async validateBarcode(req: Request, res: Response) {
    const { type, barcode } = req.body; // type: 'item' | 'bin' | 'serial'
    if (!type || !barcode) {
      return res.status(400).json({ message: 'type and barcode are required' });
    }

    try {
      if (type === 'item') {
        const items = await db.query(`
          SELECT ItemId, Code, Name, UOM, TrackBatch, TrackSerial, Weight, Volume 
          FROM tblItem 
          WHERE Barcode = @barcode OR Code = @barcode
        `, { barcode });
        
        if (items.length === 0) {
          return res.status(404).json({ valid: false, message: 'Item barcode not found' });
        }
        return res.json({ valid: true, data: items[0] });
      }

      if (type === 'bin') {
        const bins = await db.query(`
          SELECT b.BinId, b.Code, b.Barcode, b.CapacityWeight, b.CapacityVolume, b.OccupiedWeight, b.OccupiedVolume, z.Name AS ZoneName, w.Name AS WarehouseName
          FROM tblBin b
          INNER JOIN tblShelf s ON b.ShelfId = s.ShelfId
          INNER JOIN tblRack r ON s.RackId = r.RackId
          INNER JOIN tblZone z ON r.ZoneId = z.ZoneId
          INNER JOIN tblWarehouse w ON z.WarehouseId = w.WarehouseId
          WHERE b.Barcode = @barcode OR b.Code = @barcode
        `, { barcode });

        if (bins.length === 0) {
          return res.status(404).json({ valid: false, message: 'Bin barcode not found' });
        }
        return res.json({ valid: true, data: bins[0] });
      }

      if (type === 'serial') {
        const serials = await db.query(`
          SELECT sn.SerialId, sn.SerialNumber, sn.Status, i.Name AS ItemName, i.Code AS ItemCode, bat.BatchNumber
          FROM tblSerialNo sn
          INNER JOIN tblItem i ON sn.ItemId = i.ItemId
          LEFT JOIN tblBatch bat ON sn.BatchId = bat.BatchId
          WHERE sn.SerialNumber = @barcode
        `, { barcode });

        if (serials.length === 0) {
          return res.status(404).json({ valid: false, message: 'Serial number barcode not found' });
        }
        return res.json({ valid: true, data: serials[0] });
      }

      return res.status(400).json({ message: 'Invalid validation type' });
    } catch (err: any) {
      console.error('Barcode validation error:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  // Get item print details (including price, mfg/exp date, batch details)
  public static async getPrintDetails(req: Request, res: Response) {
    const itemCode = req.query.itemCode as string;
    const batchNumber = req.query.batchNumber as string;

    if (!itemCode) {
      return res.status(400).json({ message: 'itemCode query parameter is required' });
    }

    try {
      const items = await db.query(`
        SELECT ItemId, Code, Name, UOM, Barcode, TrackBatch, TrackSerial, UnitCost, SellingPrice, MRP
        FROM tblItem
        WHERE Code = @itemCode OR Barcode = @itemCode
      `, { itemCode });

      if (items.length === 0) {
        return res.status(404).json({ message: 'Item not found' });
      }

      const item = items[0];
      const result: any = {
        itemCode: item.Code,
        itemName: item.Name,
        uom: item.UOM,
        barcodeNumber: item.Barcode || item.Code,
        sku: item.Code,
        mrp: item.MRP ? Number(item.MRP).toFixed(2) : (item.UnitCost ? Number(item.UnitCost).toFixed(2) : '0.00'),
        salePrice: item.SellingPrice ? Number(item.SellingPrice).toFixed(2) : '0.00',
        mfgDate: '',
        expiryDate: '',
        batchNumber: batchNumber || '',
        serialNumber: ''
      };

      if (batchNumber) {
        const batches = await db.query(`
          SELECT ManufactureDate, ExpiryDate
          FROM tblBatch
          WHERE ItemId = @itemId AND BatchNumber = @batchNumber
        `, { itemId: item.ItemId, batchNumber });

        if (batches.length > 0) {
          result.mfgDate = batches[0].ManufactureDate || '';
          result.expiryDate = batches[0].ExpiryDate || '';
        }
      } else if (item.TrackBatch) {
        const batches = await db.query(`
          SELECT BatchNumber, ManufactureDate, ExpiryDate
          FROM tblBatch
          WHERE ItemId = @itemId
          ORDER BY ExpiryDate DESC, BatchId DESC
          LIMIT 1
        `, { itemId: item.ItemId });

        if (batches.length > 0) {
          result.batchNumber = batches[0].BatchNumber;
          result.mfgDate = batches[0].ManufactureDate || '';
          result.expiryDate = batches[0].ExpiryDate || '';
        }
      }

      return res.json(result);
    } catch (err: any) {
      console.error('Failed to retrieve print details:', err);
      return res.status(500).json({ message: 'Failed to retrieve print details', error: err.message });
    }
  }
}

