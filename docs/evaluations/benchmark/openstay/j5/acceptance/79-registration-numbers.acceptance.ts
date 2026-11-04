import { adminEnvironment, client, Client, database, eventually, Running, start, stop } from './openstay';

/**
 * Request 79: an administrator says whether a city requires a registration number and its format; a
 * listing in that city is published only with a number matching it, the whole number; a listing
 * already published stays so. Each city uses its own name here, so that no case sees another's rule.
 */
const db = database('registration-numbers');
const ADA = 'ada@registration-numbers.test';
let server: Running;
let api: Client;
let ada: { id: string; email: string; token: string };
beforeAll(async () => {
  server = await start(db.path, adminEnvironment(ADA));
  api = client(server.port);
  ada = await api.admin(ADA);
}, 60000);
afterAll(async () => {
  await stop(server);
  db.remove();
});

const ruleOf = (city: string, token?: string) => api.read(`/cities/${encodeURIComponent(city)}/registration`, token);
const setRule = (city: string, body: unknown, token = ada.token) =>
  api.act('PUT', `/admin/cities/${encodeURIComponent(city)}/registration`, token, body);
const numbered = (listingId: string, token: string, number: string) =>
  api.act('PUT', `/listings/${listingId}/registration-number`, token, { number });
const publish = (listingId: string, token: string) => api.act('POST', `/listings/${listingId}/publish`, token);
const statusOf = async (listingId: string, token: string) => (await api.read(`/listings/${listingId}`, token)).status;

describe('registration numbers by city', () => {
  it('reads no rule for a city until an administrator sets one, to anyone, whatever its case', async () => {
    const tom = await api.traveller('tom@registration-numbers.test');
    expect(await ruleOf('Bordeaux')).toEqual(expect.objectContaining({ required: false, pattern: null }));
    expect(await ruleOf('bordeaux', tom.token)).toEqual(expect.objectContaining({ required: false, pattern: null }));

    await api.done('PUT', '/admin/cities/Bordeaux/registration', ada.token, {
      required: true,
      pattern: '\\d{5}[A-Z]{2}',
    });
    for (const city of ['Bordeaux', 'bordeaux', 'BORDEAUX'])
      expect(await ruleOf(city)).toEqual(expect.objectContaining({ required: true, pattern: '\\d{5}[A-Z]{2}' }));
    expect(await ruleOf('Bordeaux', tom.token)).toEqual(expect.objectContaining({ required: true }));

    // Set again, it replaces the first; lifted, its pattern may be null.
    await api.done('PUT', '/admin/cities/BORDEAUX/registration', ada.token, { required: true, pattern: '33-\\d{4}' });
    expect(await ruleOf('bordeaux')).toEqual(expect.objectContaining({ required: true, pattern: '33-\\d{4}' }));
    await api.done('PUT', '/admin/cities/bordeaux/registration', ada.token, { required: false, pattern: null });
    expect(await ruleOf('Bordeaux')).toEqual(expect.objectContaining({ required: false, pattern: null }));
  }, 60000);

  it('refuses a pattern that is not a regular expression, a requirement without one, and anyone but an administrator', async () => {
    const hal = await api.host('hal@registration-numbers.test');
    expect((await setRule('Nantes', { required: true, pattern: '[A-Z' })).accepted).toBe(false);
    expect((await setRule('Nantes', { required: true, pattern: '(\\d{3}' })).accepted).toBe(false);
    expect((await setRule('Nantes', { required: true, pattern: null })).accepted).toBe(false);
    expect((await setRule('Nantes', { required: true, pattern: '\\d{6}' }, hal.token)).accepted).toBe(false);
    // With no token at all: `setRule`'s default would sign it as the administrator.
    expect(
      (await api.act('PUT', '/admin/cities/Nantes/registration', undefined, { required: true, pattern: '\\d{6}' }))
        .accepted,
    ).toBe(false);
    expect(await ruleOf('Nantes')).toEqual(expect.objectContaining({ required: false, pattern: null }));
    await api.done('PUT', '/admin/cities/Nantes/registration', ada.token, { required: true, pattern: '\\d{6}' });
    expect((await setRule('Nantes', { required: false, pattern: null }, hal.token)).accepted).toBe(false);
    expect(await ruleOf('nantes')).toEqual(expect.objectContaining({ required: true, pattern: '\\d{6}' }));
  }, 60000);

  it("writes each setting of a city's rule to the audit log, under the city in lower case", async () => {
    await api.done('PUT', '/admin/cities/Strasbourg/registration', ada.token, { required: true, pattern: '67\\d{3}' });
    await api.done('PUT', '/admin/cities/STRASBOURG/registration', ada.token, { required: false, pattern: null });
    const entries = await eventually(
      () => api.list('/admin/audit?subjectId=strasbourg', ada.token),
      found => found.length >= 2,
    );
    expect(entries).toEqual([
      expect.objectContaining({
        adminId: ada.id,
        action: 'city-registration-set',
        subjectId: 'strasbourg',
        note: null,
      }),
      expect.objectContaining({
        adminId: ada.id,
        action: 'city-registration-set',
        subjectId: 'strasbourg',
        note: null,
      }),
    ]);
    expect(entries.every(entry => typeof entry.at === 'string')).toBe(true);
  }, 60000);

  it("lets the host or a manager set a listing's number, kept as given, in any state but archived, shown to anyone who sees it", async () => {
    const hal = await api.host('hal2@registration-numbers.test');
    const mia = await api.host('mia2@registration-numbers.test');
    const vic = await api.host('vic2@registration-numbers.test');
    const tom = await api.traveller('tom2@registration-numbers.test');
    const draft = await api.listing(hal.token, { city: 'Toulouse' }, false);
    expect((await api.read(`/listings/${draft}`, hal.token)).registrationNumber).toBeNull();
    await api.done('PUT', `/listings/${draft}/registration-number`, hal.token, { number: 'tls-2024 / 0042' });
    expect((await api.read(`/listings/${draft}`, hal.token)).registrationNumber).toBe('tls-2024 / 0042');

    const published = await api.listing(hal.token, { city: 'Toulouse' });
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal Lets' });
    await api.done('POST', `/listings/${published}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });
    await api.done('PUT', `/listings/${published}/registration-number`, mia.token, { number: '31555000111AB' });
    expect((await api.read(`/listings/${published}`)).registrationNumber).toBe('31555000111AB');
    expect((await api.read(`/listings/${published}`, tom.token)).registrationNumber).toBe('31555000111AB');

    for (const [token, number] of [
      [vic.token, '31000'],
      [tom.token, '31000'],
      [hal.token, ''],
      [hal.token, '   '],
      [hal.token, 'x'.repeat(51)],
    ])
      expect((await numbered(published, token, number)).accepted).toBe(false);
    expect((await api.read(`/listings/${published}`)).registrationNumber).toBe('31555000111AB');
    await api.done('PUT', `/listings/${published}/registration-number`, hal.token, { number: 'x'.repeat(50) });
    expect((await api.read(`/listings/${published}`)).registrationNumber).toBe('x'.repeat(50));

    await api.done('POST', `/listings/${published}/suspend`, hal.token);
    await api.done('PUT', `/listings/${published}/registration-number`, hal.token, { number: 'SUSPENDED-1' });
    expect((await api.read(`/listings/${published}`, hal.token)).registrationNumber).toBe('SUSPENDED-1');
    await api.done('POST', `/listings/${draft}/archive`, hal.token);
    expect((await numbered(draft, hal.token, 'ARCHIVED-1')).accepted).toBe(false);
    expect((await api.read(`/listings/${draft}`, hal.token)).registrationNumber).toBe('tls-2024 / 0042');
  }, 60000);

  it("publishes a listing in a city that requires a number only when its whole number matches the city's pattern", async () => {
    const hal = await api.host('hal3@registration-numbers.test');
    await api.done('PUT', '/admin/cities/Annecy/registration', ada.token, {
      required: true,
      pattern: '\\d{5}[A-Z]{2}',
    });
    // The listing's city in another case than the rule's.
    const listingId = await api.listing(hal.token, { city: 'ANNECY' }, false);
    expect((await publish(listingId, hal.token)).accepted).toBe(false);
    for (const number of ['74000ab', '74000AB-1', 'X74000AB', '7400AB']) {
      await api.done('PUT', `/listings/${listingId}/registration-number`, hal.token, { number });
      expect((await publish(listingId, hal.token)).accepted).toBe(false);
    }
    expect(await statusOf(listingId, hal.token)).toBe('draft');
    await api.done('PUT', `/listings/${listingId}/registration-number`, hal.token, { number: '74000AB' });
    await api.done('POST', `/listings/${listingId}/publish`, hal.token);
    expect(await statusOf(listingId, hal.token)).toBe('published');

    // Groups and `|`, the whole number matching one of the alternatives.
    await api.done('PUT', '/admin/cities/Chamonix/registration', ada.token, { required: true, pattern: 'A\\d|B\\d' });
    const chamonix = await api.listing(hal.token, { city: 'Chamonix' }, false);
    for (const number of ['A1X', 'XB2', 'A12']) {
      await api.done('PUT', `/listings/${chamonix}/registration-number`, hal.token, { number });
      expect((await publish(chamonix, hal.token)).accepted).toBe(false);
    }
    await api.done('PUT', `/listings/${chamonix}/registration-number`, hal.token, { number: 'B2' });
    await api.done('POST', `/listings/${chamonix}/publish`, hal.token);
    await api.done('PUT', '/admin/cities/Megeve/registration', ada.token, {
      required: true,
      pattern: '(MG|SV)-\\d{3}',
    });
    const megeve = await api.listing(hal.token, { city: 'Megeve' }, false);
    await api.done('PUT', `/listings/${megeve}/registration-number`, hal.token, { number: 'MG-12' });
    expect((await publish(megeve, hal.token)).accepted).toBe(false);
    await api.done('PUT', `/listings/${megeve}/registration-number`, hal.token, { number: 'SV-123' });
    await api.done('POST', `/listings/${megeve}/publish`, hal.token);
    expect(await statusOf(megeve, hal.token)).toBe('published');
  }, 60000);

  it('keeps published what was published before the rule, checks it again when it is published again, and asks nothing once the rule is lifted', async () => {
    const hal = await api.host('hal4@registration-numbers.test');
    const before = await api.listing(hal.token, { city: 'Grenoble' });
    const changed = await api.listing(hal.token, { city: 'Grenoble' }, false);
    await api.done('PUT', '/admin/cities/grenoble/registration', ada.token, { required: true, pattern: '38\\d{3}' });
    expect(await statusOf(before, hal.token)).toBe('published');

    await api.done('PUT', `/listings/${changed}/registration-number`, hal.token, { number: '38100' });
    await api.done('POST', `/listings/${changed}/publish`, hal.token);
    // A number changed after publishing leaves the listing published.
    await api.done('PUT', `/listings/${changed}/registration-number`, hal.token, { number: 'none yet' });
    expect(await statusOf(changed, hal.token)).toBe('published');

    // Suspended by its host, then published again: the rule is checked then.
    await api.done('POST', `/listings/${before}/suspend`, hal.token);
    expect((await publish(before, hal.token)).accepted).toBe(false);
    expect(await statusOf(before, hal.token)).toBe('suspended');
    await api.done('PUT', `/listings/${before}/registration-number`, hal.token, { number: '38000' });
    await api.done('POST', `/listings/${before}/publish`, hal.token);
    expect(await statusOf(before, hal.token)).toBe('published');

    // Lifted: a listing without a number is published.
    await api.done('PUT', '/admin/cities/Grenoble/registration', ada.token, { required: false, pattern: null });
    const after = await api.listing(hal.token, { city: 'Grenoble' }, false);
    await api.done('POST', `/listings/${after}/publish`, hal.token);
    expect(await statusOf(after, hal.token)).toBe('published');
    // A city with no rule asks for nothing.
    expect(await statusOf(await api.listing(hal.token, { city: 'Valence' }), hal.token)).toBe('published');
  }, 60000);
});
