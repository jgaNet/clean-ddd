import { client, Client, database, Json, Running, start, stop } from './openstay';

/**
 * Request 85: a listing in several languages. A description, texts per language, a default language,
 * and every listing read in the best match for the reader's `Accept-Language`.
 */
const db = database('listing-languages');
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

const description = (fields: Json = {}) => ({
  title: 'A room with a view',
  city: 'Lyon',
  capacity: 2,
  nightlyPrice: 10000,
  cleaningFee: 2000,
  cancellationPolicy: 'flexible',
  ...fields,
});
const write = (id: string, token: string | undefined, language: string, title: string, text = `${title}.`) =>
  api.act('PUT', `/listings/${id}/translations/${language}`, token, { title, description: text });
const written = async (id: string, token: string, language: string, title: string, text = `${title}.`) => {
  const outcome = await write(id, token, language, title, text);
  if (!outcome.accepted) throw new Error(`the ${language} text was refused: ${JSON.stringify(outcome.result)}`);
};
const translations = (id: string, token?: string) => api.list(`/listings/${id}/translations`, token);
/** The listing as read with `header` as its `Accept-Language` (none when undefined). */
const readAs = async (id: string, header?: string) => {
  const answer =
    header === undefined
      ? { status: 200, body: await api.read(`/listings/${id}`) }
      : await api.readIn(`/listings/${id}`, header);
  expect(answer.status).toBe(200);
  return answer.body;
};

describe('a listing in several languages', () => {
  it('has an empty description in en until written, and keeps a text per language, the default one being its own', async () => {
    const hal = await api.host('hal@listing-languages.test');
    const id = await api.create('/listings', hal.token, description({ city: 'Annecy' }));
    await api.done('POST', `/listings/${id}/publish`, hal.token);
    expect(await api.read(`/listings/${id}`)).toMatchObject({
      title: 'A room with a view',
      description: '',
      defaultLanguage: 'en',
      language: 'en',
    });
    expect(await translations(id)).toEqual([
      expect.objectContaining({ language: 'en', title: 'A room with a view', description: '' }),
    ]);

    await written(id, hal.token, 'fr', 'Une chambre avec vue');
    await written(id, hal.token, 'DE-ch', 'Ein Zimmer mit Aussicht');
    await written(id, hal.token, 'fr', 'Chambre avec vue', 'Au calme, sur le lac.');
    expect(await translations(id)).toEqual([
      expect.objectContaining({
        language: 'de-CH',
        title: 'Ein Zimmer mit Aussicht',
        description: 'Ein Zimmer mit Aussicht.',
      }),
      expect.objectContaining({ language: 'en', title: 'A room with a view', description: '' }),
      expect.objectContaining({ language: 'fr', title: 'Chambre avec vue', description: 'Au calme, sur le lac.' }),
    ]);

    // Writing in the default language is writing the listing's own title and description.
    await written(id, hal.token, 'en', 'A quiet room', 'On the lake, away from the road.');
    expect(await api.read(`/listings/${id}`)).toMatchObject({
      title: 'A quiet room',
      description: 'On the lake, away from the road.',
      defaultLanguage: 'en',
    });
    // And describing the listing (request 2) changes the default language's title.
    await api.done('PUT', `/listings/${id}`, hal.token, description({ city: 'Annecy', title: 'A bright room' }));
    expect((await translations(id)).find(each => each.language === 'en')).toMatchObject({ title: 'A bright room' });
    expect(await api.read(`/listings/${id}`)).toMatchObject({ title: 'A bright room', language: 'en' });

    for (const tag of ['english', 'e', 'abcd', 'en-GBR', 'en-G', 'en_GB', 'e1', 'en-12'])
      expect((await write(id, hal.token, tag, 'A title')).accepted).toBe(false);
    for (const title of ['', '   ', 'x'.repeat(101)])
      expect((await write(id, hal.token, 'it', title, 'Una camera.')).accepted).toBe(false);
    expect((await write(id, hal.token, 'it', 'Una camera', 'x'.repeat(5001))).accepted).toBe(false);
    expect((await translations(id)).map(each => each.language)).toEqual(['de-CH', 'en', 'fr']);
    await written(id, hal.token, 'it', 'x'.repeat(100), 'x'.repeat(5000));
    await written(id, hal.token, 'pt-br', 'Um quarto com vista');
    expect((await translations(id)).map(each => each.language)).toEqual(['de-CH', 'en', 'fr', 'it', 'pt-BR']);
  }, 90000);

  it("answers in the best match for Accept-Language, and says which in 'language'", async () => {
    const hal = await api.host('hal2@listing-languages.test');
    const id = await api.create('/listings', hal.token, description({ city: 'Montreux', title: 'A flat by the lake' }));
    await api.done('POST', `/listings/${id}/publish`, hal.token);
    await written(id, hal.token, 'en', 'A flat by the lake', 'Two rooms.');
    await written(id, hal.token, 'fr', 'Un appartement au bord du lac', 'Deux pièces.');
    await written(id, hal.token, 'de-CH', 'Eine Wohnung am See', 'Zwei Zimmer.');

    const cases: [string | undefined, string][] = [
      ['it, de;q=0.8, fr;q=0.5', 'de-CH'],
      ['fr;q=0.5, de;q=0.9', 'de-CH'],
      ['fr, de', 'fr'],
      ['de, fr', 'de-CH'],
      ['fr-CH', 'fr'],
      ['fr', 'fr'],
      ['de', 'de-CH'],
      ['de-AT', 'de-CH'],
      ['de-CH', 'de-CH'],
      ['fr;q=0, it', 'en'],
      ['pt-BR, ja', 'en'],
      ['*', 'en'],
      [undefined, 'en'],
    ];
    const texts: Record<string, [string, string]> = {
      en: ['A flat by the lake', 'Two rooms.'],
      fr: ['Un appartement au bord du lac', 'Deux pièces.'],
      'de-CH': ['Eine Wohnung am See', 'Zwei Zimmer.'],
    };
    for (const [header, language] of cases) {
      const [title, text] = texts[language];
      expect({ header, read: await readAs(id, header) }).toEqual({
        header,
        read: expect.objectContaining({ language, title, description: text, defaultLanguage: 'en' }),
      });
    }

    // Of several regions of a language, the first in the alphabetical order of tags.
    const other = await api.create('/listings', hal.token, description({ city: 'Montreux', title: 'A chalet' }));
    await api.done('POST', `/listings/${other}/publish`, hal.token);
    await written(other, hal.token, 'fr-CA', 'Un chalet au Québec');
    await written(other, hal.token, 'fr-BE', 'Un chalet en Belgique');
    for (const header of ['fr-CH', 'fr'])
      expect(await readAs(other, header)).toMatchObject({ language: 'fr-BE', title: 'Un chalet en Belgique' });
    expect(await readAs(other, 'fr-CA')).toMatchObject({ language: 'fr-CA', title: 'Un chalet au Québec' });

    // Every search result too.
    const found = await api.readIn('/listings?city=Montreux', 'fr-CH, de;q=0.5');
    expect(found.status).toBe(200);
    const results = found.body as unknown as Json[];
    expect(results.find(each => each.id === id)).toMatchObject({
      language: 'fr',
      title: 'Un appartement au bord du lac',
      description: 'Deux pièces.',
    });
    expect(results.find(each => each.id === other)).toMatchObject({
      language: 'fr-BE',
      title: 'Un chalet en Belgique',
    });
  }, 90000);

  it('makes another language the default only when the listing has a text in it, keeping the former as a translation', async () => {
    const hal = await api.host('hal3@listing-languages.test');
    const id = await api.create('/listings', hal.token, description({ city: 'Colmar', title: 'A house in the vines' }));
    await api.done('POST', `/listings/${id}/publish`, hal.token);
    await written(id, hal.token, 'fr', 'Une maison dans les vignes', 'Au calme.');
    for (const language of ['it', 'de', 'french', 'fr_FR'])
      expect(await api.refused('PUT', `/listings/${id}/default-language`, hal.token, { language })).toBe(true);
    expect(await api.read(`/listings/${id}`)).toMatchObject({ defaultLanguage: 'en', title: 'A house in the vines' });

    await api.done('PUT', `/listings/${id}/default-language`, hal.token, { language: 'fr' });
    expect(await api.read(`/listings/${id}`)).toMatchObject({
      defaultLanguage: 'fr',
      language: 'fr',
      title: 'Une maison dans les vignes',
      description: 'Au calme.',
    });
    expect(await readAs(id, 'en')).toMatchObject({ language: 'en', title: 'A house in the vines', description: '' });
    expect(await readAs(id, 'ja')).toMatchObject({ language: 'fr', title: 'Une maison dans les vignes' });
    expect(await translations(id)).toEqual([
      expect.objectContaining({ language: 'en', title: 'A house in the vines', description: '' }),
      expect.objectContaining({ language: 'fr', title: 'Une maison dans les vignes', description: 'Au calme.' }),
    ]);

    // The listing's own title is now the French one: describing the listing changes it.
    await api.done('PUT', `/listings/${id}`, hal.token, description({ city: 'Colmar', title: 'Maison des vignes' }));
    expect((await translations(id)).map(each => [each.language, each.title])).toEqual([
      ['en', 'A house in the vines'],
      ['fr', 'Maison des vignes'],
    ]);
  }, 60000);

  it('finds the same listings in the same order whatever the language', async () => {
    const hal = await api.host('hal4@listing-languages.test');
    const ids: string[] = [];
    for (const [price, language, title] of [
      [12000, 'de', 'Haus am Fluss'],
      [9000, 'fr', 'Maison sur la rivière'],
      [15000, 'es', 'Casa junto al río'],
    ] as const) {
      const id = await api.create('/listings', hal.token, description({ city: 'Strasbourg', nightlyPrice: price }));
      await api.done('POST', `/listings/${id}/publish`, hal.token);
      await written(id, hal.token, language, title);
      ids.push(id);
    }
    const plain = (await api.list('/listings?city=Strasbourg')).map(each => each.id);
    expect(plain).toEqual([ids[1], ids[0], ids[2]]);
    for (const header of ['de', 'fr', 'es, fr;q=0.5', '*']) {
      const answer = await api.readIn('/listings?city=Strasbourg', header);
      expect((answer.body as unknown as Json[]).map(each => each.id)).toEqual(plain);
    }
  }, 60000);

  it("lets the host and the organisation's managers write, nobody else, nothing on an archived listing, and anyone who sees it read", async () => {
    const hal = await api.host('hal5@listing-languages.test');
    const mia = await api.host('mia5@listing-languages.test');
    const val = await api.host('val5@listing-languages.test');
    const ian = await api.host('ian5@listing-languages.test');
    const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
    const id = await api.create('/listings', hal.token, description({ city: 'Arles' }));
    await api.done('POST', `/listings/${id}/publish`, hal.token);
    const draft = await api.create('/listings', hal.token, description({ city: 'Arles' }));
    await api.done('POST', `/listings/${id}/move-to-organisation`, hal.token, { organisationId });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, {
      email: mia.email,
      role: 'manager',
    });
    await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: val.email, role: 'viewer' });

    await written(id, mia.token, 'es', 'Una habitación con vistas');
    await api.done('PUT', `/listings/${id}/default-language`, mia.token, { language: 'es' });
    for (const token of [val.token, ian.token, undefined]) {
      expect((await write(id, token, 'it', 'Una camera')).accepted).toBe(false);
      expect(await api.refused('PUT', `/listings/${id}/default-language`, token, { language: 'en' })).toBe(true);
    }
    expect((await translations(id)).map(each => each.language)).toEqual(['en', 'es']);
    expect((await translations(id, ian.token)).map(each => each.language)).toEqual(['en', 'es']);
    expect(await api.read(`/listings/${id}`)).toMatchObject({
      defaultLanguage: 'es',
      title: 'Una habitación con vistas',
    });

    await written(draft, hal.token, 'fr', 'Un brouillon');
    expect(await api.hidden(`/listings/${draft}/translations`)).toBe(true);
    expect(await api.hidden(`/listings/${draft}/translations`, ian.token)).toBe(true);
    expect((await translations(draft, hal.token)).map(each => each.language)).toEqual(['en', 'fr']);

    await api.done('POST', `/listings/${id}/archive`, hal.token);
    expect((await write(id, hal.token, 'it', 'Una camera')).accepted).toBe(false);
    expect(await api.refused('PUT', `/listings/${id}/default-language`, hal.token, { language: 'en' })).toBe(true);
  }, 60000);
});
