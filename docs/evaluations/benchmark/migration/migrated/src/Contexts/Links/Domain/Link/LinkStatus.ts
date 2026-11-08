/** The lifecycle of a link: saved, then archived; the legacy had a boolean, the aggregate has a status. */
export enum LinkStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}
