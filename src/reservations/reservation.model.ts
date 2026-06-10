import { ReservationStatus } from './reservation-status.enum';

export interface Reservation {
  id: string;
  itemId: string;
  userId: string;
  status: ReservationStatus;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
}
