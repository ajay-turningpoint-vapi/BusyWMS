import { create } from 'zustand';

export type TransactionType = 
  | 'PO' 
  | 'GRN' 
  | 'QC' 
  | 'Putaway' 
  | 'Transfer' 
  | 'SO' 
  | 'Reservation' 
  | 'Pick' 
  | 'Pack' 
  | 'Dispatch'
  | 'SalesReturn'
  | 'PurchaseReturn'
  | 'Adjustment'
  | 'ASN';

interface TransactionModalState {
  isOpen: boolean;
  type: TransactionType | null;
  id: string | number | null;
  mode: 'view' | 'edit';
  clickSetting: 'single' | 'double';
  openTransaction: (type: TransactionType, id: string | number, mode?: 'view' | 'edit') => void;
  closeTransaction: () => void;
  setClickSetting: (setting: 'single' | 'double') => void;
}

export const useTransactionModalStore = create<TransactionModalState>((set) => {
  const savedSetting = localStorage.getItem('wms_drilldown_click') as 'single' | 'double' || 'single';

  return {
    isOpen: false,
    type: null,
    id: null,
    mode: 'view',
    clickSetting: savedSetting,
    
    openTransaction: (type, id, mode = 'view') => {
      set({ isOpen: true, type, id, mode });
    },
    
    closeTransaction: () => {
      set({ isOpen: false, type: null, id: null, mode: 'view' });
    },
    
    setClickSetting: (setting) => {
      localStorage.setItem('wms_drilldown_click', setting);
      set({ clickSetting: setting });
    }
  };
});
