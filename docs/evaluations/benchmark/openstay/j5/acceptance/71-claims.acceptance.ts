import {
  adminEnvironment,
  client,
  Client,
  clock,
  database,
  day,
  eventually,
  Json,
  restart,
  Running,
  sleep,
  start,
  stop,
} from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 71: claims after a stay. The traveller or the host side of a stay that took place opens a
 * claim within 14 days of the check-out, the other side answers once, an administrator decides once,
 * and the decision is an entry of the audit log. The stays are booked and paid today, then the server
 * is started again two days later (CLOCK_OFFSET_DAYS, request 57), and sixteen days later for the window.
 */
const db = database('claims');
const provider = paymentProvider();
const ADA = 'ada@claims.test';
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
/** Starts the server again `days` after today, and signs everyone in again. */
async function later(days: number) {
  server = await restart(server, db.path, { ...environment, ...clock(days) });
  provider.attach(server.port);
  api = client(server.port);
  for (const person of people) person.token = await api.login(person.email);
}

let hal: Person; // the host
let tom: Person; // the traveller
let una: Person; // a traveller with nothing to do with the stays
let mia: Person; // a manager of hal's organisation
let vic: Person; // a viewer of hal's organisation
let ada: Person; // an administrator
let organisationId: string;
const stays: Record<string, string> = {};

/** A booking of tom's from `from` to `to` days from today, on a new listing of hal's, paid unless said otherwise. */
async function stay(from: number, to: number, { inOrganisation = false, paid = true } = {}) {
  const listingId = await api.listing(hal.token, { city: 'Annecy' });
  if (inOrganisation)
    await api.done('POST', `/listings/${listingId}/move-to-organisation`, hal.token, { organisationId });
  const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(from), day(to)));
  if (paid) await payBooking(api, provider, tom.token, bookingId);
  return bookingId;
}

beforeAll(async () => {
  environment = { ...(await provider.environment()), ...adminEnvironment(ADA), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  provider.attach(server.port);
  api = client(server.port);
  hal = await signed(api.host('hal@claims.test'));
  tom = await signed(api.traveller('tom@claims.test'));
  una = await signed(api.traveller('una@claims.test'));
  mia = await signed(api.host('mia@claims.test'));
  vic = await signed(api.host('vic@claims.test'));
  ada = await signed(api.admin(ADA));
  organisationId = await api.create('/organisations', hal.token, { name: 'Hal Lets' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });

  // Tonight's stays, which will have taken place two days from now.
  for (const name of ['plain', 'hosted', 'again', 'listed', 'late']) stays[name] = await stay(0, 1);
  for (const name of ['fields', 'told', 'managed', 'seen']) stays[name] = await stay(0, 1, { inOrganisation: true });
  // A stay whose check-out is two days from now: it will check out on the day the server is started at.
  stays.endsToday = await stay(1, 2);
  stays.fourteenth = await stay(1, 2);
  // A stay never paid: two days from now its payment is long past its dueBy (request 30), so it lapsed.
  stays.lapsed = await stay(0, 1, { paid: false });
  // A stay cancelled before it began.
  stays.cancelled = await stay(0, 1, { paid: false });
  await api.done('POST', `/bookings/${stays.cancelled}/cancel`, tom.token);

  await later(2);
}, 180000);
afterAll(async () => {
  await stop(server);
  await provider.close();
  db.remove();
});

const claimOf = (id: string, token: string) => api.read(`/claims/${id}`, token);
const open = (bookingId: string, token: string, body: Json) =>
  api.act('POST', `/bookings/${bookingId}/claims`, token, body);
const opened = (
  bookingId: string,
  token: string,
  amount = 5000,
  description = 'The window of the bedroom was broken',
) => api.create(`/bookings/${bookingId}/claims`, token, { amount, description });
const answer = (claimId: string, token: string, text: string) =>
  api.act('POST', `/claims/${claimId}/answer`, token, { text });
const decide = (claimId: string, token: string, outcome: string, note: string) =>
  api.act('POST', `/admin/claims/${claimId}/decide`, token, { outcome, note });
const NOTE = 'The photos show the broken window';

describe('claims after a stay', () => {
  it('opens a claim on a stay that took place, from the day after its check-out, and on no other', async () => {
    // Checked out today: not yet the day after.
    expect(
      await api.refused('POST', `/bookings/${stays.endsToday}/claims`, tom.token, {
        amount: 1000,
        description: 'A stain',
      }),
    ).toBe(true);
    // A stay still to come, booked now.
    const listingId = await api.listing(hal.token, { city: 'Annecy' });
    const future = await api.book(tom.token, await api.quote(tom.token, listingId, day(3), day(4)));
    expect(
      await api.refused('POST', `/bookings/${future}/claims`, tom.token, { amount: 1000, description: 'A stain' }),
    ).toBe(true);
    // Lapsed, and cancelled.
    expect(
      await api.refused('POST', `/bookings/${stays.lapsed}/claims`, tom.token, {
        amount: 1000,
        description: 'A stain',
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/bookings/${stays.cancelled}/claims`, tom.token, {
        amount: 1000,
        description: 'A stain',
      }),
    ).toBe(true);
    for (const bookingId of [stays.endsToday, future, stays.lapsed, stays.cancelled])
      expect(await api.list(`/bookings/${bookingId}/claims`, tom.token)).toEqual([]);

    const id = await opened(stays.plain, tom.token, 4500, 'The flat was not as described');
    const claim = await claimOf(id, tom.token);
    expect(claim).toMatchObject({
      id,
      bookingId: stays.plain,
      openedBy: 'traveller',
      amount: 4500,
      description: 'The flat was not as described',
      answer: null,
      status: 'open',
      decision: null,
    });
    expect(typeof claim.createdAt).toBe('string');
  }, 90000);

  it('refuses an amount below a cent, a description empty, of spaces or over 2,000 characters, and anyone but the two sides', async () => {
    const bookingId = stays.fields;
    const refusedWith = async (token: string, body: Json) => !(await open(bookingId, token, body)).accepted;
    expect(await refusedWith(tom.token, { amount: 0, description: 'A broken chair' })).toBe(true);
    expect(await refusedWith(tom.token, { amount: -100, description: 'A broken chair' })).toBe(true);
    expect(await refusedWith(tom.token, { amount: 1000, description: '' })).toBe(true);
    expect(await refusedWith(tom.token, { amount: 1000, description: '     ' })).toBe(true);
    expect(await refusedWith(tom.token, { amount: 1000, description: 'x'.repeat(2001) })).toBe(true);
    // A viewer changes nothing; a stranger and an administrator are neither side.
    expect(await refusedWith(vic.token, { amount: 1000, description: 'A broken chair' })).toBe(true);
    expect(await refusedWith(una.token, { amount: 1000, description: 'A broken chair' })).toBe(true);
    expect(await refusedWith(ada.token, { amount: 1000, description: 'A broken chair' })).toBe(true);
    expect(
      await api.refused('POST', `/bookings/${bookingId}/claims`, undefined, {
        amount: 1000,
        description: 'A broken chair',
      }),
    ).toBe(true);
    expect(await api.list(`/bookings/${bookingId}/claims`, tom.token)).toEqual([]);

    const id = await opened(bookingId, tom.token, 1, 'x'.repeat(2000));
    expect(await claimOf(id, tom.token)).toMatchObject({ amount: 1, description: 'x'.repeat(2000), status: 'open' });
  }, 60000);

  it('lets the other side answer once, an administrator decide once, and writes the decision to the audit log', async () => {
    const id = await opened(stays.told, tom.token, 15000, 'The window of the bedroom was broken');
    // The side that opened it does not answer; neither does a viewer or a stranger.
    expect((await answer(id, tom.token, 'I add that the door was broken too')).accepted).toBe(false);
    expect((await answer(id, vic.token, 'We will look into this soon')).accepted).toBe(false);
    expect((await answer(id, una.token, 'I know nothing of this stay')).accepted).toBe(false);
    expect((await answer(id, hal.token, '')).accepted).toBe(false);
    expect((await answer(id, hal.token, 'x'.repeat(2001))).accepted).toBe(false);
    expect(await claimOf(id, tom.token)).toMatchObject({ status: 'open', answer: null });

    await api.done('POST', `/claims/${id}/answer`, hal.token, { text: 'The window was broken before the stay' });
    const answered = await claimOf(id, tom.token);
    expect(answered).toMatchObject({
      status: 'answered',
      answer: { text: 'The window was broken before the stay', by: hal.id },
      decision: null,
    });
    expect(typeof (answered.answer as Json).at).toBe('string');
    expect((await answer(id, mia.token, 'A second answer from the host side')).accepted).toBe(false);
    expect((await answer(id, hal.token, 'A second answer from the host')).accepted).toBe(false);

    // Only an administrator decides, with an outcome that exists and a note of 1 to 500 characters.
    expect((await decide(id, tom.token, 'traveller', NOTE)).accepted).toBe(false);
    expect((await decide(id, hal.token, 'host', NOTE)).accepted).toBe(false);
    expect((await decide(id, ada.token, 'halves', NOTE)).accepted).toBe(false);
    expect((await decide(id, ada.token, 'host', '')).accepted).toBe(false);
    expect((await decide(id, ada.token, 'host', 'x'.repeat(501))).accepted).toBe(false);
    expect(await claimOf(id, tom.token)).toMatchObject({ status: 'answered', decision: null });

    await api.done('POST', `/admin/claims/${id}/decide`, ada.token, { outcome: 'host', note: NOTE });
    const decided = await claimOf(id, hal.token);
    expect(decided).toMatchObject({ status: 'decided', decision: { outcome: 'host', note: NOTE } });
    expect(typeof (decided.decision as Json).at).toBe('string');
    expect((await decide(id, ada.token, 'traveller', 'On second thoughts the traveller')).accepted).toBe(false);
    expect(await claimOf(id, tom.token)).toMatchObject({
      status: 'decided',
      decision: { outcome: 'host', note: NOTE },
    });

    const entries = await eventually(
      () => api.list(`/admin/audit?subjectId=${id}`, ada.token),
      found => found.length > 0,
    );
    expect(entries).toEqual([
      expect.objectContaining({ adminId: ada.id, action: 'claim-decided', subjectId: id, note: NOTE }),
    ]);
    expect(typeof entries[0].at).toBe('string');
    await sleep(2000);
    expect(await api.list(`/admin/audit?subjectId=${id}`, ada.token)).toHaveLength(1);
  }, 90000);

  it('lets a manager open a claim for the host side, which the traveller answers, and decides a claim nobody answered', async () => {
    const id = await opened(stays.managed, mia.token, 8000, 'A sofa was stained with red wine');
    expect(await claimOf(id, mia.token)).toMatchObject({ openedBy: 'host', amount: 8000, status: 'open' });
    expect((await answer(id, hal.token, 'The host side cannot answer itself')).accepted).toBe(false);
    expect((await answer(id, mia.token, 'The manager cannot answer either')).accepted).toBe(false);
    await api.done('POST', `/claims/${id}/answer`, tom.token, { text: 'The stain was there when I arrived' });
    expect(await claimOf(id, hal.token)).toMatchObject({
      openedBy: 'host',
      status: 'answered',
      answer: { text: 'The stain was there when I arrived', by: tom.id },
    });

    // Opened by the host, decided while still open: the answer then comes too late.
    const hosted = await opened(stays.hosted, hal.token, 3000, 'A lamp was missing');
    expect(await claimOf(hosted, hal.token)).toMatchObject({ openedBy: 'host', status: 'open' });
    await api.done('POST', `/admin/claims/${hosted}/decide`, ada.token, {
      outcome: 'rejected',
      note: 'No proof of the lamp',
    });
    expect(await claimOf(hosted, tom.token)).toMatchObject({
      status: 'decided',
      answer: null,
      decision: { outcome: 'rejected', note: 'No proof of the lamp' },
    });
    expect((await answer(hosted, tom.token, 'There never was a lamp there')).accepted).toBe(false);
    expect(await claimOf(hosted, tom.token)).toMatchObject({ status: 'decided', answer: null });
  }, 60000);

  it("keeps one undecided claim per booking, and lists a booking's claims oldest first", async () => {
    const bookingId = stays.again;
    const first = await opened(bookingId, tom.token, 2000, 'The heating did not work');
    expect(
      await api.refused('POST', `/bookings/${bookingId}/claims`, hal.token, {
        amount: 500,
        description: 'A towel went missing',
      }),
    ).toBe(true);
    expect(
      await api.refused('POST', `/bookings/${bookingId}/claims`, tom.token, {
        amount: 500,
        description: 'And the shower was cold',
      }),
    ).toBe(true);
    await api.done('POST', `/claims/${first}/answer`, hal.token, { text: 'The heating was repaired that day' });
    expect(
      await api.refused('POST', `/bookings/${bookingId}/claims`, hal.token, {
        amount: 500,
        description: 'A towel went missing',
      }),
    ).toBe(true);
    await api.done('POST', `/admin/claims/${first}/decide`, ada.token, {
      outcome: 'traveller',
      note: 'Three cold nights',
    });

    const second = await opened(bookingId, hal.token, 500, 'A towel went missing');
    expect(await claimOf(second, tom.token)).toMatchObject({ openedBy: 'host', status: 'open' });
    for (const token of [tom.token, hal.token]) {
      const claims = await api.list(`/bookings/${bookingId}/claims`, token);
      expect(claims.map(each => each.id)).toEqual([first, second]);
      expect(claims[0]).toMatchObject({ bookingId, openedBy: 'traveller', status: 'decided' });
      expect(claims[1]).toMatchObject({ bookingId, openedBy: 'host', status: 'open' });
    }
  }, 60000);

  it('shows a claim to both sides and the administrators only, and lists the undecided ones to administrators, oldest first', async () => {
    const seen = await opened(stays.seen, tom.token, 6000, 'The kitchen was dirty on arrival');
    for (const reader of [tom, hal, mia, vic, ada])
      expect(await claimOf(seen, reader.token)).toMatchObject({ id: seen });
    expect((await api.call('GET', `/claims/${seen}`, una.token)).status).toBe(404);
    expect(await api.hidden(`/bookings/${stays.seen}/claims`, una.token)).toBe(true);
    expect((await api.list(`/bookings/${stays.seen}/claims`, vic.token)).map(each => each.id)).toEqual([seen]);

    const listed = await opened(stays.listed, hal.token, 7000, 'The garden furniture was broken');
    await api.done('POST', `/claims/${listed}/answer`, tom.token, { text: 'It was broken when I arrived' });
    const mine = (claims: Json[]) => claims.map(each => String(each.id)).filter(each => [seen, listed].includes(each));
    let waiting = await api.list('/admin/claims', ada.token);
    expect(mine(waiting)).toEqual([seen, listed]);
    expect(waiting.find(each => each.id === listed)).toMatchObject({ status: 'answered', openedBy: 'host' });
    expect(waiting.every(each => each.status === 'open' || each.status === 'answered')).toBe(true);

    await api.done('POST', `/admin/claims/${seen}/decide`, ada.token, {
      outcome: 'traveller',
      note: 'The photos agree',
    });
    waiting = await api.list('/admin/claims', ada.token);
    expect(mine(waiting)).toEqual([listed]);
    for (const other of [tom, hal, mia]) expect((await api.call('GET', '/admin/claims', other.token)).status).toBe(403);
  }, 60000);

  it('takes a claim up to 14 days after the check-out, and refuses one later', async () => {
    // Sixteen days from the first start: tonight's stays checked out 15 days ago, tomorrow's 14 days ago.
    await later(16);
    expect(
      await api.refused('POST', `/bookings/${stays.late}/claims`, tom.token, { amount: 1000, description: 'A stain' }),
    ).toBe(true);
    expect(await api.list(`/bookings/${stays.late}/claims`, tom.token)).toEqual([]);
    const id = await opened(stays.fourteenth, hal.token, 1000, 'A stain on the carpet');
    expect(await claimOf(id, tom.token)).toMatchObject({ openedBy: 'host', status: 'open' });
  }, 90000);
});
