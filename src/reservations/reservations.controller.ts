import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  reserve(@Body() dto: CreateReservationDto) {
    return this.reservationsService.reserve(dto);
  }

  @Get()
  list() {
    return this.reservationsService.getAllReservations();
  }

  @Get(':reservationId')
  get(@Param('reservationId') reservationId: string) {
    return this.reservationsService.getReservation(reservationId);
  }

  @Post(':reservationId/confirm')
  confirm(@Param('reservationId') reservationId: string) {
    return this.reservationsService.confirm(reservationId);
  }

  @Post(':reservationId/cancel')
  cancel(@Param('reservationId') reservationId: string) {
    return this.reservationsService.cancel(reservationId);
  }
}
