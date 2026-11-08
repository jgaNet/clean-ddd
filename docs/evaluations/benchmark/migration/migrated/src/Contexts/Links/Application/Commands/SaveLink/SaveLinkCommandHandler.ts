import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { Link } from '@Contexts/Links/Domain/Link/Link';
import { ILinkRepository } from '@Contexts/Links/Domain/Link/Ports/ILinkRepository';
import { SaveLinkCommandEvent } from '@Contexts/Links/Application/Commands/SaveLink/SaveLinkCommandEvent';

/** Anyone may save a link, as anyone could on the legacy: no caller is required. The new id is the result. */
export class SaveLinkCommandHandler extends CommandHandler<SaveLinkCommandEvent> {
  constructor(private links: ILinkRepository) {
    super();
  }

  async execute({ payload }: SaveLinkCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const link = Link.create({ url: payload.url, title: payload.title });
    if (link.isFailure()) return link;

    const saved = await this.links.save(link.data);
    if (saved.isFailure()) return saved;
    await this.publishDomainEvents(link.data, context);

    return Result.ok(link.data._id.value);
  }
}
