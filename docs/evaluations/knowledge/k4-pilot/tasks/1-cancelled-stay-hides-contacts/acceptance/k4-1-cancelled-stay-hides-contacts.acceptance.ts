import { client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * K4, task 1 (a defect in an existing rule): request 53 says a stay of the traveller for the listing that has
 * been paid shows the conversation in full from then on, "even if it is cancelled or refunded afterwards".
 * The injected defect hides the contact details again once the paid booking is cancelled.
 */
const db = database('k4-cancelled-stay');
const provider = paymentProvider();
let server: Running;
let api: Client;
beforeAll(async () => {
  server = await start(db.path, { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' });
  provider.attach(server.port);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** The messages of a conversation as `token` is shown them: `[text, masked]`, in order. */
const shown = async (id: string, token: string) =>
  ((await api.read(`/conversations/${id}`, token)).messages as Json[]).map(each => [each.text, each.masked]);

const HOST_SAYS = 'Call me on +33 6 12 34 56 78 when you land';
const TRAVELLER_SAYS = 'Mine is tom.k@mail.example.com';

describe('a paid stay, cancelled afterwards', () => {
  it('keeps every message of the conversation in full after the paid booking is cancelled, for both sides', async () => {
    const hal = await api.host('hal@k4-cancelled.test');
    const tom = await api.traveller('tom@k4-cancelled.test');
    const listingId = await api.listing(hal.token, { cancellationPolicy: 'flexible' });
    const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(20), day(23)));
    const id = await api.create('/conversations', tom.token, { listingId, text: 'Hello, is parking free?' });
    await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: HOST_SAYS });
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: TRAVELLER_SAYS });
    expect((await shown(id, tom.token))[1]).toEqual(['Call me on [hidden] when you land', true]);

    await payBooking(api, provider, tom.token, bookingId);
    const full = [
      ['Hello, is parking free?', false],
      [HOST_SAYS, false],
      [TRAVELLER_SAYS, false],
    ];
    expect(
      await eventually(
        () => shown(id, tom.token),
        messages => messages[1][1] === false,
      ),
    ).toEqual(full);

    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);
    await eventually(
      () => api.read(`/bookings/${bookingId}`, tom.token),
      booking => booking.status === 'cancelled',
    );
    // Whatever the refund does afterwards, the conversation stays in full: give the reactions time to run.
    await new Promise(resolve => setTimeout(resolve, 3000));
    expect(await shown(id, tom.token)).toEqual(full);
    expect(await shown(id, hal.token)).toEqual(full);

    // A message written after the cancellation is shown in full too.
    await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: 'Or write to hal@stay.example.org' });
    expect((await shown(id, tom.token))[3]).toEqual(['Or write to hal@stay.example.org', false]);
  }, 120000);

  it('still holds contact details back when the cancelled booking was never paid', async () => {
    const hal = await api.host('hal@k4-unpaid.test');
    const tom = await api.traveller('tom@k4-unpaid.test');
    const listingId = await api.listing(hal.token);
    const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(20), day(22)));
    const id = await api.create('/conversations', tom.token, { listingId, text: 'Hello' });
    await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: HOST_SAYS });
    await api.done('POST', `/bookings/${bookingId}/cancel`, tom.token);
    await eventually(
      () => api.read(`/bookings/${bookingId}`, tom.token),
      booking => booking.status === 'cancelled',
    );
    expect((await shown(id, tom.token))[1]).toEqual(['Call me on [hidden] when you land', true]);
  }, 90000);
});
