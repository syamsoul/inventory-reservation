import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SystemClock } from '../common/clock';
import { InventoryService } from '../inventory/inventory.service';
import { InventorySnapshot } from '../inventory/inventory-item.model';
import { LockService } from '../locking/lock.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationStatus } from './reservation-status.enum';
import { Reservation } from './reservation.model';

const HOLD_TIME_MS = 2 * 60 * 1000;

@Injectable()
export class ReservationsService {
  private readonly reservations = new Map<string, Reservation>();
  private readonly expiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @Inject(forwardRef(() => InventoryService))
    private readonly inventoryService: InventoryService,
    private readonly lockService: LockService,
    private readonly clock: SystemClock,
  ) {}

  async reserve(dto: CreateReservationDto): Promise<Reservation> {
    return this.lockService.forItem(dto.itemId).runExclusive(() => {
      this.inventoryService.get(dto.itemId);
      this.expireDueActiveReservationsForItem(dto.itemId);

      const snapshot = this.calculateSnapshot(dto.itemId);
      if (snapshot.availableStock < 1) {
        throw new ConflictException(`No stock available for item '${dto.itemId}'.`);
      }

      const now = this.clock.now();
      const reservation: Reservation = {
        id: randomUUID(),
        itemId: dto.itemId,
        userId: dto.userId,
        status: ReservationStatus.Active,
        createdAt: now,
        expiresAt: new Date(now.getTime() + HOLD_TIME_MS),
      };

      this.reservations.set(reservation.id, reservation);
      this.scheduleExpiry(reservation);

      return reservation;
    });
  }

  async confirm(reservationId: string): Promise<Reservation> {
    const reservation = this.getExisting(reservationId);

    return this.lockService.forItem(reservation.itemId).runExclusive(() => {
      const current = this.getExisting(reservationId);
      this.expireIfDue(current);
      this.assertActive(current, 'confirm');

      current.status = ReservationStatus.Confirmed;
      current.confirmedAt = this.clock.now();
      this.clearExpiryTimer(current.id);

      return current;
    });
  }

  async cancel(reservationId: string): Promise<Reservation> {
    const reservation = this.getExisting(reservationId);

    return this.lockService.forItem(reservation.itemId).runExclusive(() => {
      const current = this.getExisting(reservationId);
      this.expireIfDue(current);
      this.assertActive(current, 'cancel');

      current.status = ReservationStatus.Cancelled;
      current.cancelledAt = this.clock.now();
      this.clearExpiryTimer(current.id);

      return current;
    });
  }

  async getReservation(reservationId: string): Promise<Reservation> {
    const reservation = this.getExisting(reservationId);

    return this.lockService.forItem(reservation.itemId).runExclusive(() => {
      const current = this.getExisting(reservationId);
      this.expireIfDue(current);
      return current;
    });
  }

  async getAllReservations(): Promise<Reservation[]> {
    const itemIds = this.getKnownItemIds();

    await Promise.all(
      itemIds.map((itemId) =>
        this.lockService.forItem(itemId).runExclusive(() => {
          this.expireDueActiveReservationsForItem(itemId);
        }),
      ),
    );

    return [...this.reservations.values()];
  }

  async getInventorySnapshot(itemId: string): Promise<InventorySnapshot> {
    return this.lockService.forItem(itemId).runExclusive(() => {
      this.inventoryService.get(itemId);
      this.expireDueActiveReservationsForItem(itemId);
      return this.calculateSnapshot(itemId);
    });
  }

  async getAllInventorySnapshots(): Promise<InventorySnapshot[]> {
    const items = this.inventoryService.list();

    return Promise.all(
      items.map((item) =>
        this.lockService.forItem(item.itemId).runExclusive(() => {
          this.expireDueActiveReservationsForItem(item.itemId);
          return this.calculateSnapshot(item.itemId);
        }),
      ),
    );
  }

  private getKnownItemIds(): string[] {
    return [
      ...new Set([
        ...this.inventoryService.list().map((item) => item.itemId),
        ...[...this.reservations.values()].map((reservation) => reservation.itemId),
      ]),
    ];
  }

  private calculateSnapshot(itemId: string): InventorySnapshot {
    const item = this.inventoryService.get(itemId);
    const itemReservations = [...this.reservations.values()].filter(
      (reservation) => reservation.itemId === itemId,
    );
    const confirmedSales = itemReservations.filter(
      (reservation) => reservation.status === ReservationStatus.Confirmed,
    ).length;
    const activeReservations = itemReservations.filter(
      (reservation) => reservation.status === ReservationStatus.Active,
    ).length;

    return {
      itemId,
      totalStock: item.totalStock,
      confirmedSales,
      activeReservations,
      availableStock: item.totalStock - confirmedSales - activeReservations,
    };
  }

  private scheduleExpiry(reservation: Reservation): void {
    const delayMs = Math.max(
      0,
      reservation.expiresAt.getTime() - this.clock.now().getTime(),
    );
    const timer = this.clock.setTimeout(() => {
      void this.expireReservation(reservation.id);
    }, delayMs);
    timer.unref?.();
    this.expiryTimers.set(reservation.id, timer);
  }

  private async expireReservation(reservationId: string): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return;
    }

    await this.lockService.forItem(reservation.itemId).runExclusive(() => {
      const current = this.reservations.get(reservationId);
      if (!current || current.status !== ReservationStatus.Active) {
        return;
      }
      this.markExpired(current);
    });
  }

  private expireDueActiveReservationsForItem(itemId: string): void {
    for (const reservation of this.reservations.values()) {
      if (reservation.itemId === itemId) {
        this.expireIfDue(reservation);
      }
    }
  }

  private expireIfDue(reservation: Reservation): void {
    if (
      reservation.status === ReservationStatus.Active &&
      reservation.expiresAt.getTime() <= this.clock.now().getTime()
    ) {
      this.markExpired(reservation);
    }
  }

  private markExpired(reservation: Reservation): void {
    reservation.status = ReservationStatus.Expired;
    reservation.expiredAt = this.clock.now();
    this.clearExpiryTimer(reservation.id);
  }

  private clearExpiryTimer(reservationId: string): void {
    const timer = this.expiryTimers.get(reservationId);
    if (timer) {
      this.clock.clearTimeout(timer);
      this.expiryTimers.delete(reservationId);
    }
  }

  private getExisting(reservationId: string): Reservation {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      throw new NotFoundException(`Reservation '${reservationId}' was not found.`);
    }
    return reservation;
  }

  private assertActive(reservation: Reservation, action: string): void {
    if (reservation.status !== ReservationStatus.Active) {
      throw new ConflictException(
        `Cannot ${action} reservation '${reservation.id}' because it is ${reservation.status}.`,
      );
    }
  }
}
