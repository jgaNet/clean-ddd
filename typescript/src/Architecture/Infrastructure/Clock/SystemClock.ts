import { Clock } from '@Architecture/Application';

/**
 * The machine's time, read here and nowhere else (DOMAIN-ONE-CLOCK, ADR 42): the wiring passes it to what needs a now.
 * An application that moves time (a demo, a test server, an offset) builds another clock in its wiring and passes that.
 */
export const systemClock: Clock = () => new Date();
