export interface InventoryItem {
  itemId: string;
  totalStock: number;
}

export interface InventorySnapshot {
  itemId: string;
  totalStock: number;
  confirmedSales: number;
  activeReservations: number;
  availableStock: number;
}
