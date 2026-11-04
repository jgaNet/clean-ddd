import {
  client,
  Client,
  database,
  idOf,
  JPEG,
  Json,
  Outcome,
  padded,
  PDF,
  PNG,
  restart,
  Running,
  start,
  stop,
} from './openstay';

/**
 * Request 54: attachments. A PDF, a JPEG or a PNG of up to 5 MB, typed by its first bytes, uploaded to a
 * conversation, attached once to a message of its uploader, and downloaded as it was uploaded by everyone
 * who reads the conversation, through any server on the database, after a restart too.
 */
const db = database('attachments');
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

const MAX = 5_242_880;
const upload = (id: string, token: string, bytes: Uint8Array, name?: string, through = api) =>
  through.upload(`/conversations/${id}/attachments`, token, bytes, name);
/**
 * The id of an accepted upload. The upload answers `{ id, type, size }` at once; an upload answered later
 * (request 1) has the new upload's id as its result, and its type and size are read on the message.
 */
const uploaded = (outcome: Outcome, type: string, size: number) => {
  if (!outcome.accepted) throw new Error(`the upload was refused: ${JSON.stringify(outcome.result)}`);
  if (typeof outcome.result === 'object' && outcome.result !== null)
    expect(outcome.result).toMatchObject({ type, size });
  const id = idOf(outcome.result);
  expect(id).not.toBe('');
  return id;
};
const messagesOf = async (id: string, token: string, through = api) =>
  (await through.read(`/conversations/${id}`, token)).messages as Json[];
const send = (id: string, token: string, text: string, attachmentIds?: string[], through = api) =>
  through.act('POST', `/conversations/${id}/messages`, token, {
    text,
    ...(attachmentIds !== undefined && { attachmentIds }),
  });

/** A host with a published listing in an organisation, a manager and a viewer of it, a traveller and an outsider. */
async function aConversation(name: string) {
  const hal = await api.host(`hal@${name}.test`);
  const mia = await api.host(`mia@${name}.test`);
  const vic = await api.host(`vic@${name}.test`);
  const tom = await api.traveller(`tom@${name}.test`);
  const una = await api.traveller(`una@${name}.test`);
  const listingId = await api.listing(hal.token);
  const organisationId = await api.create('/organisations', hal.token, { name: 'Hal & Co' });
  await api.done('POST', `/listings/${listingId}/move-to-organisation`, hal.token, { organisationId });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: mia.email, role: 'manager' });
  await api.done('POST', `/organisations/${organisationId}/members`, hal.token, { email: vic.email, role: 'viewer' });
  const id = await api.create('/conversations', tom.token, { listingId, text: 'Hello, a question first' });
  return { hal, mia, vic, tom, una, listingId, id };
}

describe('attachments', () => {
  it('attaches an upload to a message, and serves it, byte for byte, to everyone who reads the conversation only', async () => {
    const { hal, mia, vic, tom, una, id } = await aConversation('files');
    const scan = uploaded(await upload(id, tom.token, PDF, 'id-scan.pdf'), 'application/pdf', PDF.length);

    // Not attached yet: only its uploader downloads it.
    const before = await api.download(`/attachments/${scan}`, tom.token);
    expect(before.status).toBe(200);
    expect(Buffer.compare(before.bytes, PDF)).toBe(0);
    for (const other of [hal, mia, vic, una]) expect((await api.download(`/attachments/${scan}`, other.token)).status).toBe(404);

    expect((await send(id, tom.token, 'Here is my ID', [scan])).accepted).toBe(true);
    const messages = await messagesOf(id, hal.token);
    expect(messages[0].attachments).toEqual([]);
    expect(messages[1]).toMatchObject({ senderId: tom.id, text: 'Here is my ID' });
    expect(messages[1].attachments).toEqual([
      expect.objectContaining({ id: scan, name: 'id-scan.pdf', type: 'application/pdf', size: PDF.length }),
    ]);

    for (const reader of [tom, hal, mia, vic]) {
      const file = await api.download(`/attachments/${scan}`, reader.token);
      expect(file.status).toBe(200);
      expect(file.type).toMatch(/^application\/pdf\b/);
      expect(Buffer.compare(file.bytes, PDF)).toBe(0);
    }
    expect((await api.download(`/attachments/${scan}`, una.token)).status).toBe(404);
  }, 60000);

  it('reads the type from the first bytes, never the name, and refuses any other file, an empty one or one over 5 MB', async () => {
    const { hal, tom, id } = await aConversation('types.files');
    const png = uploaded(await upload(id, tom.token, PNG, 'plan.pdf'), 'image/png', PNG.length);
    const jpeg = uploaded(await upload(id, hal.token, JPEG, 'photo'), 'image/jpeg', JPEG.length);
    const largest = uploaded(await upload(id, tom.token, padded(PDF, MAX), 'large.pdf'), 'application/pdf', MAX);
    const named = uploaded(await upload(id, tom.token, PNG, 'n'.repeat(200)), 'image/png', PNG.length);

    const text = Buffer.from('Just some words, not a file of any accepted type');
    expect((await upload(id, tom.token, text, 'notes.pdf')).accepted).toBe(false);
    expect((await upload(id, tom.token, Buffer.from('%PDX-1.4 almost a PDF'), 'almost.pdf')).accepted).toBe(false);
    expect((await upload(id, tom.token, Buffer.alloc(0), 'empty.pdf')).accepted).toBe(false);
    expect((await upload(id, tom.token, padded(PDF, MAX + 1), 'too-large.pdf')).accepted).toBe(false);
    expect((await upload(id, tom.token, PDF, '')).accepted).toBe(false);
    expect((await upload(id, tom.token, PDF, 'n'.repeat(201))).accepted).toBe(false);
    expect((await upload(id, tom.token, PDF)).accepted).toBe(false);

    expect((await send(id, tom.token, 'The plan and two more', [png, largest, named])).accepted).toBe(true);
    expect((await send(id, hal.token, 'A photo of the door', [jpeg])).accepted).toBe(true);
    const [, mine, photo] = await messagesOf(id, tom.token);
    const sorted = (attachments: unknown) =>
      (attachments as Json[]).map(each => [each.id, each.name, each.type, each.size]).sort();
    expect(sorted(mine.attachments)).toEqual(
      [
        [png, 'plan.pdf', 'image/png', PNG.length],
        [largest, 'large.pdf', 'application/pdf', MAX],
        [named, 'n'.repeat(200), 'image/png', PNG.length],
      ].sort(),
    );
    expect(sorted(photo.attachments)).toEqual([[jpeg, 'photo', 'image/jpeg', JPEG.length]]);

    const plan = await api.download(`/attachments/${png}`, hal.token);
    expect(plan.type).toMatch(/^image\/png\b/);
    expect(Buffer.compare(plan.bytes, PNG)).toBe(0);
    const door = await api.download(`/attachments/${jpeg}`, tom.token);
    expect(door.type).toMatch(/^image\/jpeg\b/);
    expect(Buffer.compare(door.bytes, JPEG)).toBe(0);
    const large = await api.download(`/attachments/${largest}`, hal.token);
    expect(large.bytes.length).toBe(MAX);
    expect(Buffer.compare(large.bytes, padded(PDF, MAX))).toBe(0);
  }, 120000);

  it("lets the traveller, the host and a manager upload, and attaches only the sender's own unattached uploads to that conversation", async () => {
    const { hal, mia, vic, tom, una, listingId, id } = await aConversation('attach.files');
    const other = await api.create('/conversations', una.token, { listingId, text: 'Another question here' });
    const tomsOther = await api.create('/conversations', tom.token, {
      listingId: await api.listing(hal.token),
      text: 'A question about another place',
    });
    expect((await upload(id, vic.token, PDF, 'viewer.pdf')).accepted).toBe(false);
    expect((await upload(id, una.token, PDF, 'outsider.pdf')).accepted).toBe(false);
    const halsFile = uploaded(await upload(id, hal.token, PDF, 'access-plan.pdf'), 'application/pdf', PDF.length);
    const miasFile = uploaded(await upload(id, mia.token, PNG, 'map.png'), 'image/png', PNG.length);
    const tomsFile = uploaded(await upload(id, tom.token, JPEG, 'me.jpg'), 'image/jpeg', JPEG.length);
    const elsewhere = uploaded(await upload(other, una.token, PDF, 'elsewhere.pdf'), 'application/pdf', PDF.length);
    const tomsElsewhere = uploaded(await upload(tomsOther, tom.token, PNG, 'there.png'), 'image/png', PNG.length);
    const count = async () => (await messagesOf(id, tom.token)).length;
    const messages = await count();

    // Someone else's upload, an upload to another conversation, an unknown id: the message is refused with it.
    expect((await send(id, tom.token, 'With the host file', [halsFile])).accepted).toBe(false);
    expect((await send(id, tom.token, 'With my file from there', [tomsElsewhere])).accepted).toBe(false);
    expect((await send(other, una.token, 'With my file and his', [elsewhere, tomsFile])).accepted).toBe(false);
    expect((await send(id, tom.token, 'With nothing real', ['no-such-upload'])).accepted).toBe(false);
    // A text is still needed when the message carries a file.
    expect((await send(id, tom.token, '', [tomsFile])).accepted).toBe(false);
    expect(await count()).toBe(messages);

    expect((await send(id, mia.token, 'The map, from Mia', [miasFile])).accepted).toBe(true);
    expect((await send(id, tom.token, 'My photo', [tomsFile])).accepted).toBe(true);
    // Attached once.
    expect((await send(id, tom.token, 'My photo again', [tomsFile])).accepted).toBe(false);
    expect((await send(id, hal.token, 'The plan', [halsFile])).accepted).toBe(true);
    const latest = (await messagesOf(id, vic.token)).slice(-3);
    expect(latest.map(each => [each.senderId, (each.attachments as Json[]).map(file => file.id)])).toEqual([
      [mia.id, [miasFile]],
      [tom.id, [tomsFile]],
      [hal.id, [halsFile]],
    ]);
    expect(await count()).toBe(messages + 3);
    // Una's own upload, refused with Tom's, was not attached: she attaches it now.
    expect((await send(other, una.token, 'With my file alone', [elsewhere])).accepted).toBe(true);
  }, 60000);

  it('passes a file on as uploaded, contact details in it included', async () => {
    const { hal, tom, id } = await aConversation('as-is.files');
    const file = Buffer.concat([PDF, Buffer.from('% write to anna.b@mail.example.com or call 0612345678\n')]);
    const scan = uploaded(await upload(id, tom.token, file, 'details.pdf'), 'application/pdf', file.length);
    expect((await send(id, tom.token, 'My details are in the file', [scan])).accepted).toBe(true);
    const download = await api.download(`/attachments/${scan}`, hal.token);
    expect(download.status).toBe(200);
    expect(Buffer.compare(download.bytes, file)).toBe(0);
  }, 60000);

  it('serves a file uploaded through one server through another on the same database, and after a restart', async () => {
    const { hal, tom, id } = await aConversation('kept.files');
    let scan = '';
    const second = await start(db.path);
    try {
      const other = client(second.port);
      const token = await other.login(tom.email);
      scan = uploaded(await upload(id, token, PDF, 'kept.pdf', other), 'application/pdf', PDF.length);
      const photo = uploaded(await upload(id, token, PNG, 'kept.png', other), 'image/png', PNG.length);
      expect((await send(id, token, 'Kept for later', [scan], other)).accepted).toBe(true);
      const download = await api.download(`/attachments/${scan}`, hal.token);
      expect(download.status).toBe(200);
      expect(Buffer.compare(download.bytes, PDF)).toBe(0);
      // An upload not attached yet is its uploader's, through any server.
      expect(Buffer.compare((await api.download(`/attachments/${photo}`, tom.token)).bytes, PNG)).toBe(0);
    } finally {
      await stop(second);
    }

    server = await restart(server, db.path);
    api = client(server.port);
    const after = await api.download(`/attachments/${scan}`, await api.login(hal.email));
    expect(after.status).toBe(200);
    expect(after.type).toMatch(/^application\/pdf\b/);
    expect(Buffer.compare(after.bytes, PDF)).toBe(0);
    const messages = await messagesOf(id, await api.login(tom.email));
    expect(messages[1].attachments).toEqual([
      expect.objectContaining({ id: scan, name: 'kept.pdf', type: 'application/pdf', size: PDF.length }),
    ]);
  }, 120000);
});
