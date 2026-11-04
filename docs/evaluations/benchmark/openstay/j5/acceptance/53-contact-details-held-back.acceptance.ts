import { client, Client, database, day, eventually, Json, Running, start, stop } from './openstay';
import { paymentProvider, payBooking } from './provider';

/**
 * Request 53: contact details held back. Until a booking of the conversation's traveller for its listing
 * is paid or declared paid, every IBAN, email address and phone number in a message is shown as
 * `[hidden]` to everyone but its sender; from then on, every message shows in full.
 */
const db = database('held-back');
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

const CONTACT = 'Write to anna.b@mail.example.com or call +33 6 12 34 56 78, thanks';
const CONTACT_HIDDEN = 'Write to [hidden] or call [hidden], thanks';
const PLAIN = 'Is there a cot for the baby?';

/** A host with a published listing in an organisation, a manager and a viewer of it, and a traveller. */
async function anOrganisation(name: string) {
  const hal = await api.host(`hal@${name}.test`);
  const mia = await api.host(`mia@${name}.test`);
  const vic = await api.host(`vic@${name}.test`);
  const tom = await api.traveller(`tom@${name}.test`);
  const listingId = await api.listing(hal.token);
  const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
  await api.done('POST', `/listings/${listingId}/move-to-organisation`, hal.token, { organisationId });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });
  return { hal, mia, vic, tom, listingId };
}

describe('contact details held back', () => {
  it('hides contact details from everyone but the sender until a stay is paid, and shows a plain message as written', async () => {
    const { hal, mia, vic, tom, listingId } = await anOrganisation('held');
    const id = await api.create('/conversations', tom.token, { listingId, text: CONTACT });
    await api.done('POST', `/conversations/${id}/messages`, tom.token, { text: PLAIN });
    await api.done('POST', `/conversations/${id}/messages`, mia.token, { text: 'Mine is 0612345678, Mia' });

    expect(await shown(id, tom.token)).toEqual([
      [CONTACT, false],
      [PLAIN, false],
      ['Mine is [hidden], Mia', true],
    ]);
    expect(await shown(id, mia.token)).toEqual([
      [CONTACT_HIDDEN, true],
      [PLAIN, false],
      ['Mine is 0612345678, Mia', false],
    ]);
    for (const reader of [hal, vic])
      expect(await shown(id, reader.token)).toEqual([
        [CONTACT_HIDDEN, true],
        [PLAIN, false],
        ['Mine is [hidden], Mia', true],
      ]);

    // A booking not paid yet changes nothing.
    const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(10), day(12)));
    await api.create('/conversations', tom.token, { listingId, text: PLAIN, bookingId });
    expect((await shown(id, hal.token))[0]).toEqual([CONTACT_HIDDEN, true]);
  }, 60000);

  it('replaces each IBAN, then each email address, then each phone number, whole, by one [hidden]', async () => {
    const hal = await api.host('hal@patterns.held.test');
    const tom = await api.traveller('tom@patterns.held.test');
    const listingId = await api.listing(hal.token);
    const cases: [string, string, boolean][] = [
      ['Pay to FR76 3000 6000 0112 3456 7890 189, please', 'Pay to [hidden], please', true],
      ['Or to FR7630006000011234567890189, please', 'Or to [hidden], please', true],
      ['Mail anna.b@mail.example.com, or tom_2+stay@my-host.co.uk', 'Mail [hidden], or [hidden]', true],
      ['Call +33 6 12 34 56 78, or 06.12.34.56.78, or 0612345678 now', 'Call [hidden], or [hidden], or [hidden] now', true],
      ['Arriving 2026-12-01, leaving 2026.12.05, door code 1234 5678', '', false],
      ['A room for 2 adults and 1 child, on the 3rd floor', '', false],
    ];
    const id = await api.create('/conversations', tom.token, { listingId, text: cases[0][0] });
    for (const [text] of cases.slice(1)) await api.done('POST', `/conversations/${id}/messages`, tom.token, { text });

    expect(await shown(id, hal.token)).toEqual(
      cases.map(([text, hidden, masked]) => [masked ? hidden : text, masked]),
    );
    expect(await shown(id, tom.token)).toEqual(cases.map(([text]) => [text, false]));
  }, 60000);

  it('shows every message in full once a booking of the traveller for the listing is paid, even cancelled afterwards', async () => {
    const hal = await api.host('hal@paid.held.test');
    const tom = await api.traveller('tom@paid.held.test');
    const una = await api.traveller('una@paid.held.test');
    const listingId = await api.listing(hal.token);
    const elsewhere = await api.listing(hal.token);
    const unpaid = await api.book(tom.token, await api.quote(tom.token, listingId, day(10), day(12)));
    const id = await api.create('/conversations', tom.token, { listingId, text: CONTACT, bookingId: unpaid });
    await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: 'Mine is 0612345678, Hal' });

    // Another traveller's paid booking of the listing, and Tom's paid booking of another listing, change nothing.
    await payBooking(api, provider, una.token, await api.book(una.token, await api.quote(una.token, listingId, day(20), day(21))));
    await payBooking(api, provider, tom.token, await api.book(tom.token, await api.quote(tom.token, elsewhere, day(20), day(21))));
    expect(await shown(id, hal.token)).toEqual([
      [CONTACT_HIDDEN, true],
      ['Mine is 0612345678, Hal', false],
    ]);
    expect(await shown(id, tom.token)).toEqual([
      [CONTACT, false],
      ['Mine is [hidden], Hal', true],
    ]);

    // Another booking of Tom's for this listing, not the one the conversation is about, is paid.
    const paid = await api.book(tom.token, await api.quote(tom.token, listingId, day(30), day(31)));
    await payBooking(api, provider, tom.token, paid);
    const full = [
      [CONTACT, false],
      ['Mine is 0612345678, Hal', false],
    ];
    expect(
      await eventually(
        () => shown(id, hal.token),
        messages => messages[0][1] === false,
      ),
    ).toEqual(full);
    expect(
      await eventually(
        () => shown(id, tom.token),
        messages => messages[1][1] === false,
      ),
    ).toEqual(full);
    await api.done('POST', `/conversations/${id}/messages`, hal.token, { text: 'Or hal@stay.example.org, Hal' });
    expect((await shown(id, tom.token))[2]).toEqual(['Or hal@stay.example.org, Hal', false]);

    // Cancelled and refunded afterwards, it still counts.
    await api.done('POST', `/bookings/${paid}/cancel`, tom.token);
    await eventually(
      () => api.read(`/bookings/${paid}`, tom.token),
      booking => booking.status === 'cancelled',
    );
    expect((await shown(id, hal.token)).slice(0, 2)).toEqual(full);
  }, 90000);

  it('shows every message in full once the host declares a booking paid directly', async () => {
    const hal = await api.host('hal@declared.held.test');
    const tom = await api.traveller('tom@declared.held.test');
    const listingId = await api.listing(hal.token);
    const id = await api.create('/conversations', tom.token, { listingId, text: CONTACT });
    expect(await shown(id, hal.token)).toEqual([[CONTACT_HIDDEN, true]]);

    const bookingId = await api.book(tom.token, await api.quote(tom.token, listingId, day(10), day(12)));
    await api.done('POST', `/bookings/${bookingId}/declare-paid`, hal.token);
    expect(
      await eventually(
        () => shown(id, hal.token),
        messages => messages[0][1] === false,
      ),
    ).toEqual([[CONTACT, false]]);
  }, 60000);
});
