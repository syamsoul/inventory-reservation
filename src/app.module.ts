import { Module } from '@nestjs/common';
import { InventoryModule } from './inventory/inventory.module';
import { ReservationsModule } from './reservations/reservations.module';

@Module({
  imports: [InventoryModule, ReservationsModule],
})
export class AppModule {}
