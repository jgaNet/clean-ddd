import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { ILinkRepository } from '@Contexts/Links/Domain/Link/Ports/ILinkRepository';
import { LinkNotFoundException } from '@Contexts/Links/Domain/Link/LinkExceptions';
import { ArchiveLinkCommandEvent } from '@Contexts/Links/Application/Commands/ArchiveLink/ArchiveLinkCommandEvent';

export class ArchiveLinkCommandHandler extends CommandHandler<ArchiveLinkCommandEvent> {
  constructor(private links: ILinkRepository) {
    super();
  }

  async execute({ payload }: ArchiveLinkCommandEvent, context: ExecutionContext): Promise<IResult> {
    const link = await this.links.findById(payload.linkId);
    if (!link) return Result.fail(new LinkNotFoundException(payload.linkId));

    const archived = link.archive();
    if (archived.isFailure()) return archived;

    const saved = await this.links.save(link);
    if (saved.isFailure()) return saved;
    await this.publishDomainEvents(link, context);

    return Result.ok();
  }
}
