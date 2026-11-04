import { client, Client, database, day, Running, start, stop } from './openstay';

/** Request 11: amenities and house rules, kept as accepted. Invariant 8. */
const db = database('amenities');
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

describe('amenities and house rules', () => {
  it('declares amenities from the list, in its order, and house rules, with defaults until then', async () => {
    const hal = await api.host('hal@amenities.test');
    const id = await api.listing(hal.token);
    expect(await api.read(`/listings/${id}`)).toMatchObject({
      amenities: [],
      houseRules: { pets: false, smoking: false, events: false, checkInFrom: '15:00', checkOutBefore: '11:00' },
    });

    await api.done('PUT', `/listings/${id}/amenities`, hal.token, { amenities: ['pool', 'wifi', 'parking'] });
    await api.done('PUT', `/listings/${id}/house-rules`, hal.token, {
      pets: true,
      smoking: false,
      events: true,
      checkInFrom: '16:30',
      checkOutBefore: '10:00',
    });
    expect(await api.read(`/listings/${id}`)).toMatchObject({
      amenities: ['wifi', 'parking', 'pool'],
      houseRules: { pets: true, smoking: false, events: true, checkInFrom: '16:30', checkOutBefore: '10:00' },
    });
  }, 60000);

  it('refuses an amenity outside the list, one named twice, a time that is not one, and anyone but the host', async () => {
    const hal = await api.host('hal2@amenities.test');
    const ian = await api.host('ian2@amenities.test');
    const id = await api.listing(hal.token);
    const rules = { pets: false, smoking: false, events: false, checkInFrom: '15:00', checkOutBefore: '11:00' };

    expect(await api.refused('PUT', `/listings/${id}/amenities`, hal.token, { amenities: ['sauna'] })).toBe(true);
    expect(await api.refused('PUT', `/listings/${id}/amenities`, hal.token, { amenities: ['wifi', 'wifi'] })).toBe(
      true,
    );
    expect(await api.refused('PUT', `/listings/${id}/amenities`, ian.token, { amenities: ['wifi'] })).toBe(true);
    expect(await api.refused('PUT', `/listings/${id}/house-rules`, hal.token, { ...rules, checkInFrom: '25:00' })).toBe(
      true,
    );
    expect(
      await api.refused('PUT', `/listings/${id}/house-rules`, hal.token, { ...rules, checkOutBefore: 'noon' }),
    ).toBe(true);
    expect(await api.refused('PUT', `/listings/${id}/house-rules`, ian.token, rules)).toBe(true);
    expect((await api.read(`/listings/${id}`)).amenities).toEqual([]);

    await api.done('POST', `/listings/${id}/archive`, hal.token);
    expect(await api.refused('PUT', `/listings/${id}/amenities`, hal.token, { amenities: ['wifi'] })).toBe(true);
    expect(await api.refused('PUT', `/listings/${id}/house-rules`, hal.token, { ...rules, pets: true })).toBe(true);
  }, 60000);

  it('shows the rules on a quote and keeps them on the booking, whatever the listing says afterwards', async () => {
    const hal = await api.host('hal3@amenities.test');
    const tom = await api.traveller('tom3@amenities.test');
    const id = await api.listing(hal.token);
    const before = { pets: true, smoking: false, events: false, checkInFrom: '14:00', checkOutBefore: '12:00' };
    await api.done('PUT', `/listings/${id}/house-rules`, hal.token, before);

    const quoteId = await api.quote(tom.token, id, day(20), day(22));
    expect((await api.read(`/quotes/${quoteId}`, tom.token)).houseRules).toEqual(before);
    await api.done('PUT', `/listings/${id}/house-rules`, hal.token, {
      pets: false,
      smoking: true,
      events: true,
      checkInFrom: '18:00',
      checkOutBefore: '09:00',
    });
    expect((await api.read(`/quotes/${quoteId}`, tom.token)).houseRules).toEqual(before);
    const bookingId = await api.book(tom.token, quoteId);
    expect((await api.read(`/bookings/${bookingId}`, tom.token)).houseRules).toEqual(before);
  }, 60000);
});
