import { DomainEvent } from './EventTypes';

class Greeted extends DomainEvent<{ name: string }> {}
class Waved extends DomainEvent<{ name: string }> {}

describe('Event', () => {
  it('is named after its class, and carries its payload where a comparison can see it', () => {
    const event = Greeted.set({ name: 'alice' });

    expect(event.name).toBe('Greeted');
    expect(event.payload).toEqual({ name: 'alice' });
    expect({ ...event }).toEqual({ name: 'Greeted', payload: { name: 'alice' } });
  });

  it('compares by payload, so a spec asserting an event asserts what it says', () => {
    expect(Greeted.set({ name: 'alice' })).toEqual(Greeted.set({ name: 'alice' }));
    // The reason payload and name are public readonly fields rather than #private ones: this
    // assertion passed whatever the payload said while they were hidden.
    expect(Greeted.set({ name: 'alice' })).not.toEqual(Greeted.set({ name: 'bob' }));
    expect(Greeted.set({ name: 'alice' })).not.toEqual(Waved.set({ name: 'alice' }));
  });
});
