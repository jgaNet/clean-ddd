import { AggregateRoot, Id, IResult, Result } from '@Architecture/Domain';

import { ILink, INewLink } from '@Contexts/Links/Domain/Link/DTOs';
import { LinkArchivedEvent, LinkSavedEvent } from '@Contexts/Links/Domain/Link/Events/LinkEvents';
import { LinkAlreadyArchivedException } from '@Contexts/Links/Domain/Link/LinkExceptions';
import { LinkStatus } from '@Contexts/Links/Domain/Link/LinkStatus';
import { LinkTitle } from '@Contexts/Links/Domain/Link/LinkTitle';
import { LinkUrl } from '@Contexts/Links/Domain/Link/LinkUrl';

/**
 * Link is the aggregate root of the Links context: what the legacy kept as a row in a Map, with
 * its rules moved from the request handlers into the object. A link has a valid title and url
 * (the value objects), is archived once, and records what happened to it (the activity feed is a
 * projection of those facts). Time is a parameter with a default, so the same input gives the
 * same link in a test.
 */
export class Link extends AggregateRoot {
  #url: LinkUrl;
  #title: LinkTitle;
  #status: LinkStatus;
  #createdAt: Date;

  private constructor(id: Id, url: LinkUrl, title: LinkTitle, status: LinkStatus, createdAt: Date, version = 0) {
    super(id, version);
    this.#url = url;
    this.#title = title;
    this.#status = status;
    this.#createdAt = createdAt;
  }

  /** Saves a new link; the only way to bring one into existence. The title is refused before the url, as the legacy did. */
  static create(props: INewLink, now: Date = new Date()): IResult<Link> {
    const title = LinkTitle.create(props.title);
    if (title.isFailure()) return title;
    const url = LinkUrl.create(props.url);
    if (url.isFailure()) return url;

    const id = Id.generate();
    const link = new Link(id, url.data, title.data, LinkStatus.ACTIVE, now);
    link.record(
      LinkSavedEvent.set({ linkId: id.value, url: url.data.value, title: title.data.value, at: now.toISOString() }),
    );
    return Result.ok(link);
  }

  /** Rebuilds a link from storage; nothing happened, so nothing is recorded, and corrupted data throws. */
  static fromSnapshot(snapshot: ILink): Link {
    const title = LinkTitle.create(snapshot.title);
    const url = LinkUrl.create(snapshot.url);
    if (title.isFailure()) throw new Error(`Corrupted link ${snapshot._id}: ${title.error.message}`);
    if (url.isFailure()) throw new Error(`Corrupted link ${snapshot._id}: ${url.error.message}`);
    const createdAt = new Date(snapshot.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error(`Corrupted link ${snapshot._id}: createdAt`);

    return new Link(new Id(snapshot._id), url.data, title.data, snapshot.status, createdAt, snapshot.version);
  }

  archive(now: Date = new Date()): IResult {
    if (this.#status === LinkStatus.ARCHIVED) return Result.fail(new LinkAlreadyArchivedException(this._id.value));

    this.#status = LinkStatus.ARCHIVED;
    this.record(LinkArchivedEvent.set({ linkId: this._id.value, title: this.#title.value, at: now.toISOString() }));
    return Result.ok();
  }

  toSnapshot(): ILink {
    return {
      _id: this._id.value,
      url: this.#url.value,
      title: this.#title.value,
      status: this.#status,
      createdAt: this.#createdAt.toISOString(),
      version: this.version,
    };
  }

  get title(): string {
    return this.#title.value;
  }

  get url(): string {
    return this.#url.value;
  }

  get status(): LinkStatus {
    return this.#status;
  }
}
