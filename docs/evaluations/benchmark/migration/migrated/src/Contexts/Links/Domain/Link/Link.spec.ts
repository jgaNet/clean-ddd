import { expect } from '@jest/globals';

import { Link } from '@Contexts/Links/Domain/Link/Link';
import { LinkArchivedEvent, LinkSavedEvent } from '@Contexts/Links/Domain/Link/Events/LinkEvents';
import { LinkStatus } from '@Contexts/Links/Domain/Link/LinkStatus';

/** A link made in a test, or the test fails here rather than on an undefined later. */
const made = (props: { url: string; title: string }, now?: Date): Link => {
  const link = Link.create(props, now);
  if (link.isFailure()) throw new Error(link.error.message);
  return link.data;
};

const at = new Date('2026-11-08T10:00:00.000Z');

describe('Link', () => {
  it('saves a link with its title trimmed, at the time given, and records the fact', () => {
    const link = made({ url: 'https://example.org/a', title: '  A  ' }, at);

    expect(link.toSnapshot()).toMatchObject({
      url: 'https://example.org/a',
      title: 'A',
      status: LinkStatus.ACTIVE,
      createdAt: at.toISOString(),
      version: 0,
    });
    expect(link.pullDomainEvents()).toEqual([
      LinkSavedEvent.set({
        linkId: link._id.value,
        url: 'https://example.org/a',
        title: 'A',
        at: at.toISOString(),
      }),
    ]);
  });

  it('refuses a blank title, then a long title, then a url that is not http(s), in that order', () => {
    expect(Link.create({ url: 'ftp://x', title: ' ' }).error?.type).toBe('BlankLinkTitle');
    expect(Link.create({ url: 'ftp://x', title: 'x'.repeat(81) }).error?.type).toBe('LinkTitleTooLong');
    expect(Link.create({ url: 'ftp://x', title: 'x'.repeat(80) }).error?.type).toBe('InvalidLinkUrl');
  });

  it('archives once, and refuses the second time', () => {
    const link = made({ url: 'https://example.org/a', title: 'A' }, at);
    link.pullDomainEvents();

    expect(link.archive(at).isSuccess()).toBe(true);
    expect(link.status).toBe(LinkStatus.ARCHIVED);
    expect(link.pullDomainEvents()).toEqual([
      LinkArchivedEvent.set({ linkId: link._id.value, title: 'A', at: at.toISOString() }),
    ]);
    expect(link.archive(at).error?.type).toBe('LinkAlreadyArchived');
  });

  it('rebuilds from a snapshot without recording anything, and throws on corrupted data', () => {
    const saved = made({ url: 'https://example.org/a', title: 'A' }, at);
    const rebuilt = Link.fromSnapshot({ ...saved.toSnapshot(), version: 3 });

    expect(rebuilt.toSnapshot()).toEqual({ ...saved.toSnapshot(), version: 3 });
    expect(rebuilt.pullDomainEvents()).toEqual([]);
    expect(() => Link.fromSnapshot({ ...saved.toSnapshot(), url: 'nope' })).toThrow(/Corrupted link/);
  });
});
