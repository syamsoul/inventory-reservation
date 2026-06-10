import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Inventory reservation API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates an item, reserves it, confirms it, and reports inventory', async () => {
    await request(app.getHttpServer())
      .post('/inventory/items')
      .send({ itemId: 'sku-1', totalStock: 1 })
      .expect(201);

    const reservationResponse = await request(app.getHttpServer())
      .post('/reservations')
      .send({ itemId: 'sku-1', userId: 'user-1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/reservations/${reservationResponse.body.id}/confirm`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/inventory/items/sku-1')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          totalStock: 1,
          confirmedSales: 1,
          activeReservations: 0,
          availableStock: 0,
        });
      });
  });

  it('rejects the second reservation when the only item is already reserved', async () => {
    await request(app.getHttpServer())
      .post('/inventory/items')
      .send({ itemId: 'sku-1', totalStock: 1 })
      .expect(201);

    await request(app.getHttpServer())
      .post('/reservations')
      .send({ itemId: 'sku-1', userId: 'user-1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/reservations')
      .send({ itemId: 'sku-1', userId: 'user-2' })
      .expect(409);
  });

  it('allows a new reservation after cancellation releases stock', async () => {
    await request(app.getHttpServer())
      .post('/inventory/items')
      .send({ itemId: 'sku-1', totalStock: 1 })
      .expect(201);

    const reservationResponse = await request(app.getHttpServer())
      .post('/reservations')
      .send({ itemId: 'sku-1', userId: 'user-1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/reservations/${reservationResponse.body.id}/cancel`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/reservations')
      .send({ itemId: 'sku-1', userId: 'user-2' })
      .expect(201);
  });

  it('lists inventory snapshots and reservations', async () => {
    await request(app.getHttpServer())
      .post('/inventory/items')
      .send({ itemId: 'sku-1', totalStock: 2 })
      .expect(201);

    const reservationResponse = await request(app.getHttpServer())
      .post('/reservations')
      .send({ itemId: 'sku-1', userId: 'user-1' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/inventory/items')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            itemId: 'sku-1',
            totalStock: 2,
            activeReservations: 1,
            availableStock: 1,
          }),
        ]);
      });

    await request(app.getHttpServer())
      .get('/reservations')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({
            id: reservationResponse.body.id,
            itemId: 'sku-1',
            userId: 'user-1',
          }),
        ]);
      });
  });
});
