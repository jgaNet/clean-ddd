/**
 * The lifecycle of a note. A note starts ACTIVE, can be ARCHIVED, and can come back.
 * The transitions themselves are enforced by the Note aggregate, not by this enum.
 */
export enum NoteStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
