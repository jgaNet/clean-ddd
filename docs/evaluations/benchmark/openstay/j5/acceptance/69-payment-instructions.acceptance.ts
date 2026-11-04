import {
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  iban,
  INVALID_IBAN,
  Json,
  restart,
  Running,
  spaced,
  start,
  stop,
} from './openstay';
import { paymentProvider } from './provider';

/**
 * Request 69: a host's bank details, checked and kept as they are written, shown to the traveller of a
 * booking whose payment is due, always as they are now, with a change of IBAN in the last 7 days flagged.
 */
const db = database('payment-instructions');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;
type Person = { id: string; email: string; token: string };
let hal: Person;
let tom: Person;
let una: Person;
let listingId: string;
/** hal's IBAN as last set, and its holder. */
let current = { iban: '', holder: '' };
beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  hal = await api.host('hal@instructions.test');
  tom = await api.traveller('tom@instructions.test');
  una = await api.traveller('una@instructions.test');
  listingId = await api.listing(hal.token, { city: 'Transferville' });
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const PATH = '/hosts/me/bank-details';
const setDetails = (token: string, value: string, holder: string) => api.done('PUT', PATH, token, { iban: value, holder });
const instructions = (bookingId: string) => `/bookings/${bookingId}/payment-instructions`;
const bookAt = (from: number, id = listingId) =>
  api.quote(tom.token, id, day(from), day(from + 1)).then(quoteId => api.book(tom.token, quoteId));
const paymentOf = async (bookingId: string) => (await api.read(`/bookings/${bookingId}`, tom.token)).payment as Json | null;

describe('direct payment instructions', () => {
  it('keeps a host’s IBAN upper-case without spaces, with its holder and when it took its value', async () => {
    expect((await api.call('GET', PATH, hal.token)).status).toBe(404);
    current = { iban: iban('FR'), holder: 'Hal Martin' };
    await setDetails(hal.token, spaced(current.iban).toLowerCase(), current.holder);
    const details = await api.read(PATH, hal.token);
    expect(details).toMatchObject({ iban: current.iban, holder: current.holder, changedAt: expect.any(String) });
    expect(Number.isNaN(Date.parse(String(details.changedAt)))).toBe(false);

    expect(await api.refused('PUT', PATH, tom.token, { iban: iban('FR'), holder: 'Tom' })).toBe(true);
    expect((await api.call('GET', PATH, tom.token)).status).toBe(404);
  }, 60000);

  it('takes any IBAN of 15 to 34 characters whose check digits are right, and a holder of 1 to 100 characters', async () => {
    const kai = await api.host('kai@instructions.test');
    for (const [value, holder] of [
      [iban('NO', 15), 'K'],
      [iban('MT', 31), 'x'.repeat(100)],
      [iban('LC', 34), 'Kai Bank Account'],
      [iban('DE', 22), 'Kai'],
    ]) {
      await setDetails(kai.token, value, holder);
      expect(await api.read(PATH, kai.token)).toMatchObject({ iban: value, holder });
    }
  }, 60000);

  it('refuses an IBAN of the wrong shape or check digits, or a holder out of bounds, and keeps the details already set', async () => {
    const before = await api.read(PATH, hal.token);
    for (const value of [
      INVALID_IBAN,
      iban('FR', 14),
      iban('FR', 35),
      iban('FR').replace(/(.{4})/g, '$1-'),
      `1${iban('FR').slice(1)}`,
      '',
    ])
      expect(await api.refused('PUT', PATH, hal.token, { iban: value, holder: 'Hal Martin' })).toBe(true);
    for (const holder of ['', '   ', 'x'.repeat(101)])
      expect(await api.refused('PUT', PATH, hal.token, { iban: iban('FR'), holder })).toBe(true);
    expect(await api.read(PATH, hal.token)).toEqual(before);
  }, 60000);

  it('shows the traveller of a due booking the host’s details and the booking as reference, and nobody else', async () => {
    const bookingId = await bookAt(10);
    expect(await api.read(instructions(bookingId), tom.token)).toMatchObject({
      iban: current.iban,
      holder: current.holder,
      reference: bookingId,
      changedRecently: true,
    });
    for (const token of [hal.token, una.token]) expect((await api.call('GET', instructions(bookingId), token)).status).toBe(404);
    expect(await api.hidden(instructions(bookingId))).toBe(true);

    // A host who has set no bank details: there are none to show.
    const ian = await api.host('ian@instructions.test');
    const plain = await bookAt(10, await api.listing(ian.token, { city: 'Transferville' }));
    expect((await api.call('GET', instructions(plain), tom.token)).status).toBe(404);
  }, 60000);

  it('shows them only while the booking is confirmed and its payment due', async () => {
    const asked = await api.listing(hal.token, { city: 'Transferville' });
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    const requested = await bookAt(12, asked);
    expect((await api.call('GET', instructions(requested), tom.token)).status).toBe(404);
    await api.done('POST', `/bookings/${requested}/accept`, hal.token);
    expect(await api.read(instructions(requested), tom.token)).toMatchObject({ reference: requested });

    // A payment under way with the provider, failed (due again), then paid.
    const paying = await bookAt(14);
    await api.done('POST', `/bookings/${paying}/pay`, tom.token);
    expect((await api.call('GET', instructions(paying), tom.token)).status).toBe(404);
    const [failed] = provider.paymentFor(paying);
    provider.fail(failed.id);
    await eventually(
      () => paymentOf(paying),
      payment => payment?.status === 'due',
    );
    expect(await api.read(instructions(paying), tom.token)).toMatchObject({ reference: paying });
    await api.done('POST', `/bookings/${paying}/pay`, tom.token);
    const payment = provider.paymentFor(paying).find(each => each.status !== 'failed')!;
    provider.pay(payment.id);
    await eventually(
      () => paymentOf(paying),
      each => each?.status === 'paid',
    );
    expect((await api.call('GET', instructions(paying), tom.token)).status).toBe(404);

    const declared = await bookAt(16);
    await api.done('POST', `/bookings/${declared}/declare-paid`, hal.token);
    expect((await api.call('GET', instructions(declared), tom.token)).status).toBe(404);

    const cancelled = await bookAt(18);
    await api.done('POST', `/bookings/${cancelled}/cancel`, tom.token);
    expect((await api.call('GET', instructions(cancelled), tom.token)).status).toBe(404);
  }, 90000);

  it('shows the details as they are now, and keeps when the IBAN took its value when the same IBAN is set again', async () => {
    const bookingId = await bookAt(20);
    current = { iban: iban('FR'), holder: 'Hal Martin SARL' };
    await setDetails(hal.token, current.iban, current.holder);
    expect(await api.read(instructions(bookingId), tom.token)).toMatchObject({ ...current, reference: bookingId, changedRecently: true });

    const before = await api.read(PATH, hal.token);
    current = { ...current, holder: 'Martin Holidays' };
    await setDetails(hal.token, spaced(current.iban), current.holder);
    expect(await api.read(PATH, hal.token)).toMatchObject({ ...current, changedAt: before.changedAt });
    expect(await api.read(instructions(bookingId), tom.token)).toMatchObject(current);
  }, 60000);

  it('flags the IBAN as changed recently for 7 days, and again when it changes', async () => {
    // Six days later: still less than 7 days.
    server = await restart(server, db.path, { ...environment, ...clock(6) });
    provider.attach(server.port);
    api = client(server.port);
    hal.token = await api.login(hal.email);
    tom.token = await api.login(tom.email);
    const sixDays = await bookAt(30);
    expect(await api.read(instructions(sixDays), tom.token)).toMatchObject({ ...current, changedRecently: true });

    // Eight days later: no longer.
    server = await restart(server, db.path, { ...environment, ...clock(8) });
    provider.attach(server.port);
    api = client(server.port);
    hal.token = await api.login(hal.email);
    tom.token = await api.login(tom.email);
    const bookingId = await bookAt(32);
    expect(await api.read(instructions(bookingId), tom.token)).toMatchObject({
      ...current,
      reference: bookingId,
      changedRecently: false,
    });
    const before = await api.read(PATH, hal.token);
    await setDetails(hal.token, current.iban, 'Hal Martin');
    expect(await api.read(instructions(bookingId), tom.token)).toMatchObject({
      iban: current.iban,
      holder: 'Hal Martin',
      changedRecently: false,
    });
    expect((await api.read(PATH, hal.token)).changedAt).toBe(before.changedAt);

    const changed = iban('BE', 16);
    await setDetails(hal.token, changed, 'Hal Martin');
    expect(await api.read(instructions(bookingId), tom.token)).toMatchObject({ iban: changed, changedRecently: true });
    const after = await api.read(PATH, hal.token);
    expect(Date.parse(String(after.changedAt))).toBeGreaterThan(Date.parse(String(before.changedAt)));
  }, 120000);
});
