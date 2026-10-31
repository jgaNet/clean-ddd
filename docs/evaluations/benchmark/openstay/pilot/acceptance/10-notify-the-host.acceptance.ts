import { client, database, day, eventually, kill, notificationService, sleep, start, stop } from './openstay';

/** Request 10: a notice per booking, through a service that fails, across crashes. Invariant 12. */
const services: ReturnType<typeof notificationService>[] = [];
/** A service the test plays, closed after the file even when a server never started. */
const outside = (refusals: number) => {
  const service = notificationService(refusals);
  services.push(service);
  return service;
};
afterAll(async () => {
  await Promise.all(services.map(service => service.close()));
});

describe('notify the host', () => {
  it('sends each new booking and request until the service accepts it, the same body each time, then never again', async () => {
    const service = outside(3);
    const db = database('notify');
    const server = await start(db.path, { NOTIFY_URL: await service.url() });
    try {
      const api = client(server.port);
      const hal = await api.host('hal@notify.test');
      const tom = await api.traveller('tom@notify.test');
      const instant = await api.listing(hal.token, { city: 'Arles' });
      const asked = await api.listing(hal.token, { city: 'Arles' });
      await api.done('PUT', `/listings/${asked}/booking-mode`, hal.token, { mode: 'request' });
      const confirmed = await api.book(tom.token, await api.quote(tom.token, instant, day(10), day(12)));
      const requested = await api.book(tom.token, await api.quote(tom.token, asked, day(10), day(12)));

      const accepted = await eventually(
        async () => [...service.accepted.values()],
        notices => notices.length >= 2,
        30000,
      );
      expect(accepted.map(notice => [notice.kind, notice.bookingId, notice.hostId]).sort()).toEqual(
        [
          ['booking-confirmed', confirmed, hal.id],
          ['booking-requested', requested, hal.id],
        ].sort(),
      );
      await sleep(3000);
      for (const notice of accepted) {
        const attempts = service.attemptsOf(String(notice.id));
        expect(attempts).toHaveLength(4);
        expect(attempts.every(attempt => JSON.stringify(attempt.body) === JSON.stringify(notice))).toBe(true);
        const gaps = attempts.slice(1).map((attempt, n) => attempt.at - attempts[n].at);
        expect(gaps[0]).toBeLessThanOrEqual(1500);
        expect(Math.max(...gaps)).toBeLessThanOrEqual(5500);
      }
      expect(new Set(service.attempts.map(attempt => attempt.body.id)).size).toBe(2);
    } finally {
      await stop(server);
      await service.close();
      db.remove();
    }
  }, 120000);

  it('sends, after a restart, a notice the service had not accepted when the server was killed', async () => {
    const service = outside(0);
    service.state.accepting = false;
    const db = database('notify-restart');
    const url = await service.url();
    let server = await start(db.path, { NOTIFY_URL: url });
    try {
      let api = client(server.port);
      const hal = await api.host('hal2@notify.test');
      const tom = await api.traveller('tom2@notify.test');
      const id = await api.listing(hal.token, { city: 'Nîmes' });
      const bookingId = await api.book(tom.token, await api.quote(tom.token, id, day(10), day(12)));
      await eventually(
        async () => service.attempts.length,
        count => count >= 1,
      );
      await kill(server);

      service.state.accepting = true;
      server = await start(db.path, { NOTIFY_URL: url });
      api = client(server.port);
      const accepted = await eventually(
        async () => [...service.accepted.values()],
        notices => notices.length >= 1,
        30000,
      );
      expect(accepted).toEqual([expect.objectContaining({ kind: 'booking-confirmed', bookingId, hostId: hal.id })]);
      await sleep(3000);
      expect(new Set(service.attempts.map(attempt => attempt.body.id)).size).toBe(1);
    } finally {
      await stop(server);
      await service.close();
      db.remove();
    }
  }, 120000);

  it('after kills at random moments, gives every recorded booking one notice, and an unrecorded one none', async () => {
    const service = outside(1);
    const db = database('notify-chaos');
    const url = await service.url();
    // A fixed seed, so that two gradings kill at the same delays; the moment reached is still the machine's.
    let seed = 7654321;
    const random = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    let server = await start(db.path, { NOTIFY_URL: url });
    let api = client(server.port);
    try {
      const hal = await api.host('hal3@notify.test');
      const tom = await api.traveller('tom3@notify.test');
      const id = await api.listing(hal.token, { city: 'Uzès' });
      let token = tom.token;
      for (let round = 0; round < 10; round++) {
        const quoteId = await api.quote(token, id, day(20 + 2 * round), day(21 + 2 * round));
        void api.call('POST', '/bookings', token, { quoteId }).catch(() => undefined);
        await sleep(Math.floor(random() * 40));
        await kill(server);
        server = await start(db.path, { NOTIFY_URL: url });
        api = client(server.port);
        token = await api.login(tom.email);
      }

      const recorded = (await api.list('/bookings/mine', token)).map(each => String(each.id));
      const noticed = async () => {
        const byBooking = new Map<string, Set<string>>();
        for (const notice of service.accepted.values()) {
          const ids = byBooking.get(String(notice.bookingId)) ?? new Set<string>();
          ids.add(String(notice.id));
          byBooking.set(String(notice.bookingId), ids);
        }
        return byBooking;
      };
      const final = await eventually(noticed, byBooking => recorded.every(each => byBooking.has(each)), 60000);
      expect(recorded.filter(each => !final.has(each))).toEqual([]);
      expect([...final.entries()].filter(([, ids]) => ids.size !== 1)).toEqual([]);
      expect([...final.keys()].filter(each => !recorded.includes(each))).toEqual([]);
    } finally {
      await stop(server);
      await service.close();
      db.remove();
    }
  }, 300000);
});
