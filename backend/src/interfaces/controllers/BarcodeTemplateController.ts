import { Response } from 'express';
import { db } from '../../config/db';
import { AuthenticatedRequest } from '../middlewares/auth';

export class BarcodeTemplateController {

  public static async getTemplates(req: AuthenticatedRequest, res: Response) {
    try {
      const rows = await db.query('SELECT * FROM tblBarcodeTemplate ORDER BY Name');
      return res.json(rows);
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to retrieve barcode templates', error: err.message });
    }
  }

  public static async getTemplateById(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      const rows = await db.query('SELECT * FROM tblBarcodeTemplate WHERE TemplateId = @id', { id });
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Template not found' });
      }
      return res.json(rows[0]);
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to retrieve template', error: err.message });
    }
  }

  public static async createTemplate(req: AuthenticatedRequest, res: Response) {
    const { 
      name, isDefault, pageSize, labelWidth, labelHeight, marginLeft, marginTop, 
      rowsPerPage, colsPerPage, gapX, gapY, orientation, barcodeType, barcodePosition, 
      textPosition, fontSize, fontStyle, alignment, printItemName, printItemCode, 
      printSKU, printBarcodeNumber, printBatchNumber, printSerialNumber, printMRP, 
      printSalePrice, printMfgDate, printExpiryDate, printCompanyName, companyName 
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Template Name is required' });
    }

    try {
      // If setting as default, clear other default templates first
      if (isDefault) {
        await db.executeCmd('UPDATE tblBarcodeTemplate SET IsDefault = 0');
      }

      const result = await db.executeCmd(`
        INSERT INTO tblBarcodeTemplate (
          Name, IsDefault, PageSize, LabelWidth, LabelHeight, MarginLeft, MarginTop, 
          RowsPerPage, ColsPerPage, GapX, GapY, Orientation, BarcodeType, BarcodePosition, 
          TextPosition, FontSize, FontStyle, Alignment, PrintItemName, PrintItemCode, 
          PrintSKU, PrintBarcodeNumber, PrintBatchNumber, PrintSerialNumber, PrintMRP, 
          PrintSalePrice, PrintMfgDate, PrintExpiryDate, PrintCompanyName, CompanyName
        ) VALUES (
          @name, @isDefault, @pageSize, @labelWidth, @labelHeight, @marginLeft, @marginTop, 
          @rowsPerPage, @colsPerPage, @gapX, @gapY, @orientation, @barcodeType, @barcodePosition, 
          @textPosition, @fontSize, @fontStyle, @alignment, @printItemName, @printItemCode, 
          @printSKU, @printBarcodeNumber, @printBatchNumber, @printSerialNumber, @printMRP, 
          @printSalePrice, @printMfgDate, @printExpiryDate, @printCompanyName, @companyName
        )
      `, {
        name,
        isDefault: isDefault ? 1 : 0,
        pageSize: pageSize || 'CUSTOM',
        labelWidth: labelWidth || 50.0,
        labelHeight: labelHeight || 30.0,
        marginLeft: marginLeft || 2.0,
        marginTop: marginTop || 2.0,
        rowsPerPage: rowsPerPage || 1,
        colsPerPage: colsPerPage || 1,
        gapX: gapX || 1.0,
        gapY: gapY || 1.0,
        orientation: orientation || 'PORTRAIT',
        barcodeType: barcodeType || 'CODE39',
        barcodePosition: barcodePosition || 'CENTER',
        textPosition: textPosition || 'BOTTOM',
        fontSize: fontSize || 10,
        fontStyle: fontStyle || 'normal',
        alignment: alignment || 'center',
        printItemName: printItemName ? 1 : 0,
        printItemCode: printItemCode ? 1 : 0,
        printSKU: printSKU ? 1 : 0,
        printBarcodeNumber: printBarcodeNumber ? 1 : 0,
        printBatchNumber: printBatchNumber ? 1 : 0,
        printSerialNumber: printSerialNumber ? 1 : 0,
        printMRP: printMRP ? 1 : 0,
        printSalePrice: printSalePrice ? 1 : 0,
        printMfgDate: printMfgDate ? 1 : 0,
        printExpiryDate: printExpiryDate ? 1 : 0,
        printCompanyName: printCompanyName ? 1 : 0,
        companyName: companyName || 'BusyWMS Enterprise'
      });

      return res.status(201).json({ message: 'Barcode template created successfully', lastID: result.lastID });
    } catch (err: any) {
      console.error('Failed to create template:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  public static async updateTemplate(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    const { 
      name, isDefault, pageSize, labelWidth, labelHeight, marginLeft, marginTop, 
      rowsPerPage, colsPerPage, gapX, gapY, orientation, barcodeType, barcodePosition, 
      textPosition, fontSize, fontStyle, alignment, printItemName, printItemCode, 
      printSKU, printBarcodeNumber, printBatchNumber, printSerialNumber, printMRP, 
      printSalePrice, printMfgDate, printExpiryDate, printCompanyName, companyName 
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Template Name is required' });
    }

    try {
      if (isDefault) {
        await db.executeCmd('UPDATE tblBarcodeTemplate SET IsDefault = 0');
      }

      await db.executeCmd(`
        UPDATE tblBarcodeTemplate SET
          Name = @name,
          IsDefault = @isDefault,
          PageSize = @pageSize,
          LabelWidth = @labelWidth,
          LabelHeight = @labelHeight,
          MarginLeft = @marginLeft,
          MarginTop = @marginTop,
          RowsPerPage = @rowsPerPage,
          ColsPerPage = @colsPerPage,
          GapX = @gapX,
          GapY = @gapY,
          Orientation = @orientation,
          BarcodeType = @barcodeType,
          BarcodePosition = @barcodePosition,
          TextPosition = @textPosition,
          FontSize = @fontSize,
          FontStyle = @fontStyle,
          Alignment = @alignment,
          PrintItemName = @printItemName,
          PrintItemCode = @printItemCode,
          PrintSKU = @printSKU,
          PrintBarcodeNumber = @printBarcodeNumber,
          PrintBatchNumber = @printBatchNumber,
          PrintSerialNumber = @printSerialNumber,
          PrintMRP = @printMRP,
          PrintSalePrice = @printSalePrice,
          PrintMfgDate = @printMfgDate,
          PrintExpiryDate = @printExpiryDate,
          PrintCompanyName = @printCompanyName,
          CompanyName = @companyName
        WHERE TemplateId = @id
      `, {
        id,
        name,
        isDefault: isDefault ? 1 : 0,
        pageSize: pageSize || 'CUSTOM',
        labelWidth: labelWidth || 50.0,
        labelHeight: labelHeight || 30.0,
        marginLeft: marginLeft || 2.0,
        marginTop: marginTop || 2.0,
        rowsPerPage: rowsPerPage || 1,
        colsPerPage: colsPerPage || 1,
        gapX: gapX || 1.0,
        gapY: gapY || 1.0,
        orientation: orientation || 'PORTRAIT',
        barcodeType: barcodeType || 'CODE39',
        barcodePosition: barcodePosition || 'CENTER',
        textPosition: textPosition || 'BOTTOM',
        fontSize: fontSize || 10,
        fontStyle: fontStyle || 'normal',
        alignment: alignment || 'center',
        printItemName: printItemName ? 1 : 0,
        printItemCode: printItemCode ? 1 : 0,
        printSKU: printSKU ? 1 : 0,
        printBarcodeNumber: printBarcodeNumber ? 1 : 0,
        printBatchNumber: printBatchNumber ? 1 : 0,
        printSerialNumber: printSerialNumber ? 1 : 0,
        printMRP: printMRP ? 1 : 0,
        printSalePrice: printSalePrice ? 1 : 0,
        printMfgDate: printMfgDate ? 1 : 0,
        printExpiryDate: printExpiryDate ? 1 : 0,
        printCompanyName: printCompanyName ? 1 : 0,
        companyName: companyName || 'BusyWMS Enterprise'
      });

      return res.json({ message: 'Barcode template updated successfully' });
    } catch (err: any) {
      console.error('Failed to update template:', err);
      return res.status(500).json({ message: err.message });
    }
  }

  public static async deleteTemplate(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      await db.executeCmd('DELETE FROM tblBarcodeTemplate WHERE TemplateId = @id', { id });
      return res.json({ message: 'Barcode template deleted successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to delete barcode template', error: err.message });
    }
  }

  public static async setDefaultTemplate(req: AuthenticatedRequest, res: Response) {
    const { id } = req.params;
    try {
      await db.executeCmd('UPDATE tblBarcodeTemplate SET IsDefault = 0');
      await db.executeCmd('UPDATE tblBarcodeTemplate SET IsDefault = 1 WHERE TemplateId = @id', { id });
      return res.json({ message: 'Default template updated successfully' });
    } catch (err: any) {
      return res.status(500).json({ message: 'Failed to set default template', error: err.message });
    }
  }
}
