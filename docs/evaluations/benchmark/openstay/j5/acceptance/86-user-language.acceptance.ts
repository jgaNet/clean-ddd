import {
  client,
  Client,
  database,
  day,
  eventually,
  Json,
  kill,
  notificationService,
  PASSWORD,
  Running,
  sleep,
  start,
  stop,
} from './openstay';

/**
 * Request 86: the user's language. An account reads in a language, `en` until set, and every notice
 * sent to `NOTIFY_URL` carries the language of the account it is for, as it was when the notice arose.
 */
const db = database('user-language');
const service = notificationService(0);
let environment: Record<string, string>;
let server: Running;
let api: Client;
beforeAll(async () => {
  environment = { NOTIFY_URL: await service.url(), JOBS_INTERVAL_SECONDS: '1' };
  server = await start(db.path, environment);
  api = client(server.port);
}, 60000);
afterAll(async () => {
  await stop(server);
  await service.close();
  db.remove();
});

/** An account signed up with `language` (left out when undefined), and signed in. */
async function signUp(email: string, roles: string[], language?: string) {
  const id = await api.create('/accounts', undefined, {
    email,
    password: PASSWORD,
    roles,
    ...(language !== undefined && { language }),
  });
  return { id, email, token: await api.login(email) };
}
const languageOf = async (token: string) => (await api.read('/accounts/me', token)).language;
const noticesWhere = (match: (notice: Json) => boolean) =>
  eventually(
    async () => service.notices().filter(match),
    found => found.length > 0,
    20000,
  );

describe("the user's language", () => {
  it('is en until set, may be given at sign-up, is changed by the account itself, and is answered normalised', async () => {
    const ann = await signUp('ann@user-language.test', ['traveller']);
    const bea = await signUp('bea@user-language.test', ['host'], 'FR');
    const cid = await signUp('cid@user-language.test', ['traveller', 'host'], 'pt-br');
    expect(await languageOf(ann.token)).toBe('en');
    expect(await languageOf(bea.token)).toBe('fr');
    expect(await languageOf(cid.token)).toBe('pt-BR');
    expect(await api.read('/accounts/me', bea.token)).toMatchObject({ id: bea.id, email: bea.email, language: 'fr' });

    for (const language of ['french', 'f', 'en_GB', 'en-GBR', 'abcd', 'e1'])
      expect(
        await api.refused('POST', '/accounts', undefined, {
          email: `dan-${language}@user-language.test`,
          password: PASSWORD,
          roles: ['traveller'],
          language,
        }),
      ).toBe(true);

    await api.done('PUT', '/accounts/me/language', ann.token, { language: 'ja' });
    expect(await languageOf(ann.token)).toBe('ja');
    await api.done('PUT', '/accounts/me/language', ann.token, { language: 'EN-gb' });
    expect(await languageOf(ann.token)).toBe('en-GB');
    for (const language of ['english', 'en-G', 'en_GB', 'x'])
      expect(await api.refused('PUT', '/accounts/me/language', ann.token, { language })).toBe(true);
    expect(await api.refused('PUT', '/accounts/me/language', undefined, { language: 'de' })).toBe(true);
    expect(await languageOf(ann.token)).toBe('en-GB');
    expect(await languageOf(bea.token)).toBe('fr');
  }, 60000);

  it('gives every notice the language of the account it is for', async () => {
    const hal = await signUp('hal@user-language.test', ['host'], 'fr');
    const tom = await signUp('tom@user-language.test', ['traveller'], 'ja');
    const instant = await api.listing(hal.token, { city: 'Nara' });
    const asked = await api.listing(hal.token, { city: 'Nara' });
    await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
    const confirmed = await api.book(tom.token, await api.quote(tom.token, instant, day(10), day(12)));
    const requested = await api.book(tom.token, await api.quote(tom.token, asked, day(10), day(12)));

    // A booking confirmed or requested: the host's language.
    expect(await noticesWhere(notice => notice.bookingId === confirmed)).toEqual([
      expect.objectContaining({ kind: 'booking-confirmed', hostId: hal.id, bookingId: confirmed, lang: 'fr' }),
    ]);
    expect(await noticesWhere(notice => notice.bookingId === requested)).toEqual([
      expect.objectContaining({ kind: 'booking-requested', hostId: hal.id, bookingId: requested, lang: 'fr' }),
    ]);

    // A message: the language of the account told.
    const conversationId = await api.create('/conversations', tom.token, {
      listingId: instant,
      text: 'Is there a kettle in the room?',
    });
    await api.done('POST', `/conversations/${conversationId}/messages`, hal.token, { text: 'Yes, and some tea.' });
    const messages = await eventually(
      async () => service.notices('message').filter(notice => notice.conversationId === conversationId),
      found => found.length >= 2,
      20000,
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'message', accountId: hal.id, conversationId, lang: 'fr' }),
        expect.objectContaining({ kind: 'message', accountId: tom.id, conversationId, lang: 'ja' }),
      ]),
    );

    // An email to verify: the account's language.
    await api.done('POST', '/accounts/me/email/verify-request', tom.token);
    expect(await noticesWhere(notice => notice.kind === 'email-verification' && notice.accountId === tom.id)).toEqual([
      expect.objectContaining({ kind: 'email-verification', accountId: tom.id, lang: 'ja' }),
    ]);

    // An account that never set its language reads en.
    const ida = await signUp('ida@user-language.test', ['host']);
    const elsewhere = await api.listing(ida.token, { city: 'Nara' });
    const third = await api.book(tom.token, await api.quote(tom.token, elsewhere, day(20), day(21)));
    expect(await noticesWhere(notice => notice.bookingId === third)).toEqual([
      expect.objectContaining({ kind: 'booking-confirmed', hostId: ida.id, lang: 'en' }),
    ]);
  }, 90000);

  it('keeps the language a notice arose with when it is sent again, across a crash, and uses the new one afterwards', async () => {
    const hal = await signUp('hal3@user-language.test', ['host'], 'fr');
    const tom = await signUp('tom3@user-language.test', ['traveller']);
    const listingId = await api.listing(hal.token, { city: 'Kobe' });

    service.state.accepting = false;
    const first = await api.book(tom.token, await api.quote(tom.token, listingId, day(10), day(11)));
    await eventually(
      async () => service.attempts.filter(attempt => attempt.body.bookingId === first),
      found => found.length > 0,
      20000,
    );
    await api.done('PUT', '/accounts/me/language', hal.token, { language: 'de' });
    await kill(server);
    server = await start(db.path, environment);
    api = client(server.port);
    service.state.accepting = true;

    const [accepted] = await noticesWhere(notice => notice.bookingId === first);
    expect(accepted).toMatchObject({ kind: 'booking-confirmed', hostId: hal.id, bookingId: first, lang: 'fr' });
    await sleep(3000);
    const attempts = service.attempts.filter(attempt => attempt.body.bookingId === first);
    for (const attempt of attempts) expect(attempt.body).toEqual(accepted);
    expect(service.notices().filter(notice => notice.bookingId === first)).toHaveLength(1);

    const traveller = await api.login(tom.email);
    const second = await api.book(traveller, await api.quote(traveller, listingId, day(20), day(21)));
    expect(await noticesWhere(notice => notice.bookingId === second)).toEqual([
      expect.objectContaining({ kind: 'booking-confirmed', hostId: hal.id, bookingId: second, lang: 'de' }),
    ]);
  }, 120000);
});
