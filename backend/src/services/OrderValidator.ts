import { db } from '../config/db';

export interface OrderItemInput {
  ItemId?: number;
  ItemCode?: string;
  OrderQty: number;
  UOM?: string;
  UnitPrice?: number;
}

export interface OrderInput {
  OrderCode: string; // POCode or SOCode
  PartnerName: string; // VendorName or CustomerName
  PartnerCode: string; // VendorCode or CustomerCode
  OrderDate: string;
  DeliveryDate?: string;
  Items: OrderItemInput[];
}

export class OrderValidator {
  public static async validate(input: OrderInput, type: 'PO' | 'SO', currentOrderId?: number): Promise<{ isValid: boolean; errors: string[]; cleanedItems?: any[] }> {
    const errors: string[] = [];
    
    // 1. Check required header fields
    if (!input.OrderCode || typeof input.OrderCode !== 'string' || input.OrderCode.trim() === '') {
      errors.push(`${type} Code is required.`);
    }
    if (!input.PartnerName || typeof input.PartnerName !== 'string' || input.PartnerName.trim() === '') {
      errors.push(`${type === 'PO' ? 'Vendor' : 'Customer'} Name is required.`);
    }
    if (!input.PartnerCode || typeof input.PartnerCode !== 'string' || input.PartnerCode.trim() === '') {
      errors.push(`${type === 'PO' ? 'Vendor' : 'Customer'} Code is required.`);
    }
    if (!input.OrderDate || isNaN(Date.parse(input.OrderDate))) {
      errors.push(`Order Date is required and must be a valid date.`);
    }
    
    // 2. Check uniqueness of Code
    if (input.OrderCode && input.OrderCode.trim() !== '') {
      const code = input.OrderCode.trim();
      let duplicateQuery = '';
      if (type === 'PO') {
        duplicateQuery = currentOrderId 
          ? 'SELECT POId, Status FROM tblPurchaseOrder WHERE POCode = @code AND POId <> @currentOrderId'
          : 'SELECT POId, Status FROM tblPurchaseOrder WHERE POCode = @code';
      } else {
        duplicateQuery = currentOrderId
          ? 'SELECT SOId, Status FROM tblSalesOrder WHERE SOCode = @code AND SOId <> @currentOrderId'
          : 'SELECT SOId, Status FROM tblSalesOrder WHERE SOCode = @code';
      }
      
      const duplicates = await db.query(duplicateQuery, { code, currentOrderId });
      if (duplicates.length > 0) {
        errors.push(`${type} Code '${code}' already exists.`);
      }
    }
    
    // 3. Validate detail lines
    if (!input.Items || !Array.isArray(input.Items) || input.Items.length === 0) {
      errors.push(`At least one item is required in the ${type} detail lines.`);
    } else {
      const cleanedItems: any[] = [];
      for (let i = 0; i < input.Items.length; i++) {
        const item = input.Items[i];
        const lineNum = i + 1;
        
        if (!item.ItemCode && !item.ItemId) {
          errors.push(`Line ${lineNum}: Item is required.`);
          continue;
        }
        
        // Resolve item from db
        let dbItem: any = null;
        if (item.ItemId) {
          const res = await db.query('SELECT ItemId, Code, Name, UOM FROM tblItem WHERE ItemId = @ItemId', { ItemId: item.ItemId });
          if (res.length > 0) dbItem = res[0];
        } else if (item.ItemCode) {
          const res = await db.query('SELECT ItemId, Code, Name, UOM FROM tblItem WHERE Code = @ItemCode', { ItemCode: item.ItemCode });
          if (res.length > 0) dbItem = res[0];
        }
        
        if (!dbItem) {
          errors.push(`Line ${lineNum}: Item '${item.ItemId || item.ItemCode}' does not exist in Masters.`);
          continue;
        }
        
        if (item.OrderQty === undefined || item.OrderQty === null || isNaN(item.OrderQty) || item.OrderQty <= 0) {
          errors.push(`Line ${lineNum} (${dbItem.Name}): Order Quantity must be greater than zero.`);
        }
        
        const unitPrice = item.UnitPrice !== undefined ? Number(item.UnitPrice) : 0;
        if (isNaN(unitPrice) || unitPrice < 0) {
          errors.push(`Line ${lineNum} (${dbItem.Name}): Unit Price cannot be negative.`);
        }
        
        cleanedItems.push({
          ItemId: dbItem.ItemId,
          ItemCode: dbItem.Code,
          OrderQty: Number(item.OrderQty),
          UOM: item.UOM || dbItem.UOM,
          UnitPrice: unitPrice
        });
      }
      
      return {
        isValid: errors.length === 0,
        errors,
        cleanedItems: errors.length === 0 ? cleanedItems : undefined
      };
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
