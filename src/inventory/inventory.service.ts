import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { InventoryItem } from './inventory-item.model';

@Injectable()
export class InventoryService {
  private readonly items = new Map<string, InventoryItem>();

  upsert(dto: CreateInventoryItemDto): InventoryItem {
    const item = { itemId: dto.itemId, totalStock: dto.totalStock };
    this.items.set(dto.itemId, item);
    return item;
  }

  get(itemId: string): InventoryItem {
    const item = this.items.get(itemId);
    if (!item) {
      throw new NotFoundException(`Inventory item '${itemId}' was not found.`);
    }
    return item;
  }

  list(): InventoryItem[] {
    return [...this.items.values()];
  }
}
