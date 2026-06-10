import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { InventoryService } from './inventory.service';
import { ReservationsService } from '../reservations/reservations.service';

@Controller('inventory/items')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly reservationsService: ReservationsService,
  ) {}

  @Post()
  createOrReset(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.upsert(dto);
  }

  @Get()
  async listSnapshots() {
    return this.reservationsService.getAllInventorySnapshots();
  }

  @Get(':itemId')
  async getSnapshot(@Param('itemId') itemId: string) {
    return this.reservationsService.getInventorySnapshot(itemId);
  }
}
