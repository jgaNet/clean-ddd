import {
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  idOf,
  JPEG,
  Json,
  padded,
  PDF,
  PNG,
  restart,
  Running,
  sleep,
  start,
  stop,
} from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 73: a traveller's proof of a bank transfer keeps a due booking from lapsing while its host
 * checks; the host side confirms it (declared, never verified) or contests it (due again under its
 * original dueBy); left alone for TRANSFER_CONFIRM_DAYS (2 here) it reads unconfirmed. Days pass by
 * starting the server again later (CLOCK_OFFSET_DAYS, request 57); a deadline passes by a short
 * PAYMENT_TTL_SECONDS (request 30) on a server of its own.
 */
const db = database('transfer-proof');
const provider = paymentProvider();
let environment: Record<string, string>;
let server: Running;
let api: Client;

interface Person {
  id: string;
  email: string;
  token: string;
}
const people: Person[] = [];
const signed = async (made: Promise<Person>) => {
  const person = await made;
  people.push(person);
  return person;
};

let hal: Person; // the host
let tom: Person; // the traveller
let una: Person; // a stranger
let mia: Person; // a manager of hal's organisation
let vic: Person; // a viewer of hal's organisation
let organisationId: string;

beforeAll(async () => {
  environment = { ...(await provider.environment()), JOBS_INTERVAL_SECONDS: '1', TRANSFER_CONFIRM_DAYS: '2' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  hal = await signed(api.host('hal@transfer-proof.test'));
  tom = await signed(api.traveller('tom@transfer-proof.test'));
  una = await signed(api.traveller('una@transfer-proof.test'));
  mia = await signed(api.host('mia@transfer-proof.test'));
  vic = await signed(api.host('vic@transfer-proof.test'));
  organisationId = await api.create('/organisations', hal.token, { name: 'Hal Lets' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });
}, 60000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

/** A booking of tom's in ten days, on a new listing of hal's organisation, its payment due. */
async function due(on: Client = api, host = hal, traveller = tom) {
  const listingId = await on.listing(host.token, { city: 'Colmar' });
  if (host === hal) await on.done('POST', `/listings/${listingId}/move-to-organisation`, hal.token, { organisationId });
  return on.book(traveller.token, await on.quote(traveller.token, listingId, day(10), day(11)));
}
const proof = (bookingId: string) => `/bookings/${bookingId}/transfer-proof`;
const bookingOf = (bookingId: string, token = tom.token, on = api) => on.read(`/bookings/${bookingId}`, token);
const paymentOf = async (bookingId: string, token = tom.token, on = api) =>
  (await bookingOf(bookingId, token, on)).payment as Json;
const transferOf = async (bookingId: string, token = tom.token, on = api) =>
  (await paymentOf(bookingId, token, on)).transfer as Json | null;
const confirm = (bookingId: string, token: string, on = api) =>
  on.act('POST', `/bookings/${bookingId}/transfer/confirm`, token);
const contest = (bookingId: string, token: string, reason: string, on = api) =>
  on.act('POST', `/bookings/${bookingId}/transfer/contest`, token, { reason });
/**
 * An accepted proof: its id, and the answer when it came at once (`{ id, type, size }`). A proof answered
 * later (request 1) has its id as the operation's result, and its type and size are read on the payment.
 */
const sent = async (bookingId: string, bytes: Uint8Array, name: string, token = tom.token, on = api) => {
  const outcome = await on.upload(proof(bookingId), token, bytes, name);
  if (!outcome.accepted) throw new Error(`the proof of ${bookingId} was refused: ${JSON.stringify(outcome.result)}`);
  const id = idOf(outcome.result);
  expect(id).not.toBe('');
  const answer = typeof outcome.result === 'object' && outcome.result !== null ? (outcome.result as Json) : null;
  return { id, answer };
};
const typeOf = (contentType: string) => contentType.split(';')[0].trim().toLowerCase();

describe('proof of a direct payment', () => {
  it('takes a PDF, a JPEG or a PNG by its first bytes, shows it on the payment, and gives it back byte for byte to the two sides only', async () => {
    const files = [
      { bytes: PDF, name: 'transfer.pdf', type: 'application/pdf' },
      // Recognised by its first bytes, not by its name.
      { bytes: JPEG, name: 'screenshot.png', type: 'image/jpeg' },
      { bytes: PNG, name: 'bank receipt.png', type: 'image/png' },
    ];
    for (const file of files) {
      const bookingId = await due();
      expect(await transferOf(bookingId)).toBeNull();
      expect((await api.download(proof(bookingId), tom.token)).status).toBe(404);

      const { id, answer } = await sent(bookingId, file.bytes, file.name);
      if (answer) expect(answer).toMatchObject({ id, type: file.type, size: file.bytes.length });
      const transfer = await transferOf(bookingId);
      expect(transfer).toMatchObject({
        status: 'proof-sent',
        proof: { id, name: file.name, type: file.type, size: file.bytes.length },
      });
      expect(typeof transfer?.at).toBe('string');
      expect(await transferOf(bookingId, hal.token)).toMatchObject({ status: 'proof-sent' });

      for (const reader of [tom, hal, mia, vic]) {
        const read = await api.download(proof(bookingId), reader.token);
        expect(read.status).toBe(200);
        expect(typeOf(read.type)).toBe(file.type);
        expect(read.bytes.equals(file.bytes)).toBe(true);
      }
      expect((await api.download(proof(bookingId), una.token)).status).toBe(404);
    }
  }, 90000);

  it('refuses another type, more than 5 MB, a name missing or too long, a second proof, and anyone but the traveller', async () => {
    const bookingId = await due();
    const refused = async (bytes: Uint8Array, name: string | undefined, token = tom.token) =>
      !(await api.upload(proof(bookingId), token, bytes, name)).accepted;
    expect(await refused(Buffer.from('I paid you on Monday, honestly'), 'transfer.pdf')).toBe(true);
    expect(await refused(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'binary'), 'transfer.gif')).toBe(true);
    expect(await refused(padded(PDF, 5_242_881), 'transfer.pdf')).toBe(true);
    expect(await refused(PDF, undefined)).toBe(true);
    expect(await refused(PDF, '')).toBe(true);
    expect(await refused(PDF, `${'x'.repeat(252)}.pdf`)).toBe(true);
    expect(await refused(PDF, 'transfer.pdf', hal.token)).toBe(true);
    expect(await refused(PDF, 'transfer.pdf', mia.token)).toBe(true);
    expect(await refused(PDF, 'transfer.pdf', una.token)).toBe(true);
    expect(await transferOf(bookingId)).toBeNull();

    // At the limits: 5 MB exactly, a name of 255 characters.
    const name = `${'x'.repeat(251)}.pdf`;
    const { id, answer } = await sent(bookingId, padded(PDF, 5_242_880), name);
    if (answer) expect(answer).toMatchObject({ type: 'application/pdf', size: 5_242_880 });
    expect(await transferOf(bookingId)).toMatchObject({
      proof: { id, name, type: 'application/pdf', size: 5_242_880 },
    });
    expect(await refused(PNG, 'another.png')).toBe(true);
    expect(await transferOf(bookingId)).toMatchObject({ proof: { id, type: 'application/pdf' } });
  }, 90000);

  it('takes no proof for a payment that is not due: under way, paid through the provider, or declared paid', async () => {
    const underWay = await due();
    await api.done('POST', `/bookings/${underWay}/pay`, tom.token);
    const paid = await due();
    await payBooking(api, provider, tom.token, paid);
    const declared = await due();
    await api.done('POST', `/bookings/${declared}/declare-paid`, hal.token);
    for (const bookingId of [underWay, paid, declared]) {
      expect((await api.upload(proof(bookingId), tom.token, PDF, 'transfer.pdf')).accepted).toBe(false);
      expect((await api.download(proof(bookingId), tom.token)).status).toBe(404);
    }
  }, 60000);

  it('lets the host side confirm a proof: declared, never verified, no longer paid through the provider', async () => {
    const bookingId = await due();
    expect((await confirm(bookingId, hal.token)).accepted).toBe(false); // no proof yet
    await sent(bookingId, PDF, 'transfer.pdf');
    // While the host checks, the provider is not asked.
    expect(await api.refused('POST', `/bookings/${bookingId}/pay`, tom.token)).toBe(true);
    expect((await confirm(bookingId, tom.token)).accepted).toBe(false);
    expect((await confirm(bookingId, vic.token)).accepted).toBe(false);
    expect((await confirm(bookingId, una.token)).accepted).toBe(false);
    expect(await transferOf(bookingId)).toMatchObject({ status: 'proof-sent' });

    await api.done('POST', `/bookings/${bookingId}/transfer/confirm`, mia.token);
    for (const reader of [tom, hal])
      expect(await paymentOf(bookingId, reader.token)).toMatchObject({
        status: 'declared',
        verified: false,
        transfer: { status: 'confirmed-by-host', proof: { name: 'transfer.pdf' } },
      });
    expect((await confirm(bookingId, hal.token)).accepted).toBe(false);
    expect((await contest(bookingId, hal.token, 'No money ever came')).accepted).toBe(false);
    expect(await api.refused('POST', `/bookings/${bookingId}/pay`, tom.token)).toBe(true);
    expect(provider.paymentFor(bookingId)).toEqual([]);
    expect(await paymentOf(bookingId)).toMatchObject({ status: 'declared', verified: false });
    expect((await bookingOf(bookingId)).status).toBe('confirmed');
  }, 60000);

  it('lets the host side contest a proof with a reason: due again under its dueBy, payable through the provider', async () => {
    const bookingId = await due();
    const { dueBy } = await paymentOf(bookingId);
    expect((await contest(bookingId, hal.token, 'No money ever came')).accepted).toBe(false); // no proof yet
    await sent(bookingId, PNG, 'transfer.png');
    expect((await contest(bookingId, hal.token, '')).accepted).toBe(false);
    expect((await contest(bookingId, hal.token, 'x'.repeat(501))).accepted).toBe(false);
    expect((await contest(bookingId, tom.token, 'I contest my own proof')).accepted).toBe(false);
    expect((await contest(bookingId, vic.token, 'A viewer changes nothing')).accepted).toBe(false);
    expect(await transferOf(bookingId)).toMatchObject({ status: 'proof-sent' });

    await api.done('POST', `/bookings/${bookingId}/transfer/contest`, hal.token, { reason: 'x'.repeat(500) });
    expect(await paymentOf(bookingId)).toMatchObject({ status: 'due', dueBy, transfer: { status: 'contested' } });
    expect((await confirm(bookingId, hal.token)).accepted).toBe(false);
    expect((await contest(bookingId, mia.token, 'Contested a second time')).accepted).toBe(false);
    expect((await api.upload(proof(bookingId), tom.token, PDF, 'another.pdf')).accepted).toBe(false);

    await payBooking(api, provider, tom.token, bookingId);
    expect(await paymentOf(bookingId)).toMatchObject({ status: 'paid', verified: true });
  }, 60000);

  it('keeps a booking past its dueBy while the host checks, and lets it lapse at the next sweep once contested', async () => {
    const own = database('transfer-proof-lapse');
    const lapsing = await start(own.path, { ...environment, PAYMENT_TTL_SECONDS: '30' });
    try {
      const on = client(lapsing.port);
      const ian = await on.host('ian@transfer-proof.test');
      const sue = await on.traveller('sue@transfer-proof.test');
      // Each proof right after its booking, well within its deadline; the booking left alone comes last.
      const contested = await due(on, ian, sue);
      await sent(contested, PDF, 'transfer.pdf', sue.token, on);
      const confirmed = await due(on, ian, sue);
      await sent(confirmed, JPEG, 'transfer.jpg', sue.token, on);
      const alone = await due(on, ian, sue);
      const dueBy = Date.parse(String((await paymentOf(alone, sue.token, on)).dueBy));
      await sleep(Math.max(0, dueBy - Date.now()) + 1000);
      // The booking without a proof lapses (request 30); the two with one do not.
      expect(
        await eventually(
          () => bookingOf(alone, sue.token, on),
          booking => booking.status === 'lapsed',
        ),
      ).toMatchObject({ status: 'lapsed' });
      await sleep(2000);
      for (const bookingId of [contested, confirmed]) {
        expect(await bookingOf(bookingId, sue.token, on)).toMatchObject({ status: 'confirmed' });
        expect(await transferOf(bookingId, sue.token, on)).toMatchObject({ status: 'proof-sent' });
      }

      await on.done('POST', `/bookings/${contested}/transfer/contest`, ian.token, { reason: 'No money ever came' });
      expect(
        await eventually(
          () => bookingOf(contested, sue.token, on),
          booking => booking.status === 'lapsed',
        ),
      ).toMatchObject({ status: 'lapsed' });
      await on.done('POST', `/bookings/${confirmed}/transfer/confirm`, ian.token);
      await sleep(3000);
      expect(await bookingOf(confirmed, sue.token, on)).toMatchObject({
        status: 'confirmed',
        payment: { status: 'declared', verified: false, transfer: { status: 'confirmed-by-host' } },
      });
    } finally {
      await stop(lapsing);
      own.remove();
    }
  }, 120000);

  it('reads unconfirmed once TRANSFER_CONFIRM_DAYS have passed, keeps the booking, and still lets the host decide', async () => {
    const confirmed = await due();
    const contested = await due();
    await sent(confirmed, PDF, 'transfer.pdf');
    await sent(contested, PDF, 'transfer.pdf');
    const { dueBy } = await paymentOf(contested);

    // A day later, past every dueBy: still waiting for the host, still booked.
    const later = async (days: number) => {
      server = await restart(server, db.path, { ...environment, ...clock(days) });
      provider.attach(server.port);
      api = client(server.port);
      for (const person of people) person.token = await api.login(person.email);
    };
    await later(1);
    await sleep(2500);
    for (const bookingId of [confirmed, contested]) {
      expect(await bookingOf(bookingId)).toMatchObject({ status: 'confirmed' });
      expect(await transferOf(bookingId)).toMatchObject({ status: 'proof-sent' });
    }

    // Three days later: more than two days since the proofs, with nobody acting.
    await later(3);
    for (const bookingId of [confirmed, contested])
      expect(
        await eventually(
          () => transferOf(bookingId),
          transfer => transfer?.status === 'unconfirmed',
        ),
      ).toMatchObject({ status: 'unconfirmed', proof: { name: 'transfer.pdf' } });
    await sleep(2500);
    for (const bookingId of [confirmed, contested])
      expect(await bookingOf(bookingId)).toMatchObject({ status: 'confirmed' });
    expect(await api.refused('POST', `/bookings/${confirmed}/pay`, tom.token)).toBe(true);

    await api.done('POST', `/bookings/${confirmed}/transfer/confirm`, hal.token);
    expect(await paymentOf(confirmed)).toMatchObject({
      status: 'declared',
      verified: false,
      transfer: { status: 'confirmed-by-host' },
    });
    await api.done('POST', `/bookings/${contested}/transfer/contest`, mia.token, { reason: 'No money ever came' });
    expect(await paymentOf(contested)).toMatchObject({ dueBy, transfer: { status: 'contested' } });
    expect(
      await eventually(
        () => bookingOf(contested),
        booking => booking.status === 'lapsed',
      ),
    ).toMatchObject({ status: 'lapsed' });
    await sleep(2000);
    expect(await bookingOf(confirmed)).toMatchObject({ status: 'confirmed' });
  }, 150000);
});
