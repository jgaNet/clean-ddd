import { DomainEvent } from '@Architecture/Domain';

/** The facts the legacy wrote to its activity feed, now recorded by the aggregate whose rule produced them. */
export class LinkSavedEvent extends DomainEvent<{ linkId: string; url: string; title: string; at: string }> {}

export class LinkArchivedEvent extends DomainEvent<{ linkId: string; title: string; at: string }> {}
