import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SystemClock } from '../common/clock';
import { InventoryService } from '../inventory/inventory.service';
import { LockService } from '../locking/lock.service';
import { ReservationStatus } from './reservation-status.enum';
import { ReservationsService } from './reservations.service';

class FakeClock implements SystemClock {
  private current = new Date('2026-01-01T00:00:00.000Z');
  private readonly timers = new Map<NodeJS.Timeout, () => void>();

  now(): Date {
    return new Date(this.current);
  }

  setTimeout(callback: () => void): NodeJS.Timeout {
    const token = { hasRef: () => true } as NodeJS.Timeout;
    this.timers.set(token, callback);
    return token;
  }

  clearTimeout(timeout: NodeJS.Timeout): void {
    this.timers.delete(timeout);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

describe('ReservationsService', () => {
  let inventoryService: InventoryService;
  let reservationsService: ReservationsService;
  let clock: FakeClock;

  beforeEach(async () => {
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        LockService,
        ReservationsService,
        { provide: SystemClock, useValue: clock },
      ],
    }).compile();

    inventoryService = moduleRef.get(InventoryService);
    reservationsService = moduleRef.get(ReservationsService);
  });

  it('reports full stock when no reservations exist', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 2 });

    await expect(reservationsService.getInventorySnapshot('sku-1')).resolves.toMatchObject({
      totalStock: 2,
      confirmedSales: 0,
      activeReservations: 0,
      availableStock: 2,
    });
  });

  it('counts active reservations against available stock', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 2 });

    await reservationsService.reserve({ itemId: 'sku-1', userId: 'user-1' });

    await expect(reservationsService.getInventorySnapshot('sku-1')).resolves.toMatchObject({
      confirmedSales: 0,
      activeReservations: 1,
      availableStock: 1,
    });
  });

  it('lists all inventory snapshots with calculated stock', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 2 });
    inventoryService.upsert({ itemId: 'sku-2', totalStock: 5 });

    await reservationsService.reserve({ itemId: 'sku-1', userId: 'user-1' });

    await expect(reservationsService.getAllInventorySnapshots()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: 'sku-1',
          totalStock: 2,
          activeReservations: 1,
          availableStock: 1,
        }),
        expect.objectContaining({
          itemId: 'sku-2',
          totalStock: 5,
          activeReservations: 0,
          availableStock: 5,
        }),
      ]),
    );
  });

  it('counts confirmed purchases against available stock', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 2 });
    const reservation = await reservationsService.reserve({
      itemId: 'sku-1',
      userId: 'user-1',
    });

    await reservationsService.confirm(reservation.id);

    await expect(reservationsService.getInventorySnapshot('sku-1')).resolves.toMatchObject({
      confirmedSales: 1,
      activeReservations: 0,
      availableStock: 1,
    });
  });

  it('releases stock after cancellation', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 1 });
    const reservation = await reservationsService.reserve({
      itemId: 'sku-1',
      userId: 'user-1',
    });

    await reservationsService.cancel(reservation.id);

    await expect(reservationsService.getInventorySnapshot('sku-1')).resolves.toMatchObject({
      confirmedSales: 0,
      activeReservations: 0,
      availableStock: 1,
    });
  });

  it('expires active reservations after the hold time', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 1 });
    const reservation = await reservationsService.reserve({
      itemId: 'sku-1',
      userId: 'user-1',
    });

    clock.advance(2 * 60 * 1000 + 1);

    await expect(reservationsService.getReservation(reservation.id)).resolves.toMatchObject({
      status: ReservationStatus.Expired,
    });
    await expect(reservationsService.getInventorySnapshot('sku-1')).resolves.toMatchObject({
      availableStock: 1,
    });
  });

  it('lists all reservations and refreshes expired statuses first', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 1 });
    const reservation = await reservationsService.reserve({
      itemId: 'sku-1',
      userId: 'user-1',
    });
    clock.advance(2 * 60 * 1000 + 1);

    await expect(reservationsService.getAllReservations()).resolves.toEqual([
      expect.objectContaining({
        id: reservation.id,
        status: ReservationStatus.Expired,
      }),
    ]);
  });

  it('does not allow confirmed reservations to be cancelled', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 1 });
    const reservation = await reservationsService.reserve({
      itemId: 'sku-1',
      userId: 'user-1',
    });
    await reservationsService.confirm(reservation.id);

    await expect(reservationsService.cancel(reservation.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('does not allow expired reservations to be confirmed', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 1 });
    const reservation = await reservationsService.reserve({
      itemId: 'sku-1',
      userId: 'user-1',
    });
    clock.advance(2 * 60 * 1000 + 1);

    await expect(reservationsService.confirm(reservation.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows exactly one successful reservation when 500 users race for one item', async () => {
    inventoryService.upsert({ itemId: 'sku-1', totalStock: 1 });

    const attempts = await Promise.allSettled(
      Array.from({ length: 500 }, (_, index) =>
        reservationsService.reserve({
          itemId: 'sku-1',
          userId: `user-${index}`,
        }),
      ),
    );

    const successes = attempts.filter((result) => result.status === 'fulfilled');
    const failures = attempts.filter((result) => result.status === 'rejected');
    const successfulIds = new Set(
      successes.map((result) =>
        result.status === 'fulfilled' ? result.value.id : undefined,
      ),
    );

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(499);
    expect(successfulIds.size).toBe(1);
    await expect(reservationsService.getInventorySnapshot('sku-1')).resolves.toMatchObject({
      availableStock: 0,
    });
  });
});
