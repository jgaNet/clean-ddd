import { Event } from './Event';

/**
 * The three kinds of message in the system. They share one shape (a name and a payload,
 * see Event) and differ in intent, which is why they are distinct classes: a handler, a bus
 * decorator or a test can tell them apart with `instanceof`.
 *
 * - CommandEvent      asks for something to happen; one handler, may be refused.
 *                     `CreateNoteCommandEvent`, published by a controller, answered with an operation id.
 * - DomainEvent       states that something happened inside a context; recorded by an aggregate,
 *                     published after commit, any number of handlers. `NoteSharedEvent`.
 * - IntegrationEvent  tells other contexts about it; the published contract of a context, kept in
 *                     @SharedKernel/Application/IntegrationEvents. `NoteSharedIntegrationEvent`.
 *
 * Declare one as `class NoteSharedEvent extends DomainEvent<{ noteId: string }> {}` and build it
 * with `NoteSharedEvent.set({ noteId })`.
 */

export class CommandEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class DomainEvent<PayloadDTO> extends Event<PayloadDTO> {}
export class IntegrationEvent<PayloadDTO> extends Event<PayloadDTO> {}
