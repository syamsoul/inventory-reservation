import { Module, forwardRef } from '@nestjs/common';
import { SystemClock } from '../common/clock';
import { InventoryModule } from '../inventory/inventory.module';
import { LockingModule } from '../locking/locking.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [forwardRef(() => InventoryModule), LockingModule],
  controllers: [ReservationsController],
  providers: [ReservationsService, SystemClock],
  exports: [ReservationsService],
})
export class ReservationsModule {}
