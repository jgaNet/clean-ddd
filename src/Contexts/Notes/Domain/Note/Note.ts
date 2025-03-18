import { Entity } from '@SharedKernel/Domain/DDD';
import { Result, IResult } from '@SharedKernel/Domain/Application';
import { Id } from '@Contexts/@SharedKernel/Domain';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';

export class Note extends Entity {
  #ownerId: Id;
  #title: INote['title'];
  #content: INote['content'];

  static create(userDto: INote): IResult<Note> {
    return Result.ok(new Note(new Id(userDto._id), new Id(userDto.ownerId), userDto.content, userDto.title));
  }

  private constructor(_id: Id, ownerId: Id, content: INote['content'], title: INote['title']) {
    super(_id);
    this.#ownerId = ownerId;
    this.#content = content;
    this.#title = title;
  }

  get content(): INote['content'] {
    return this.#content;
  }

  get title(): INote['title'] {
    return this.#title;
  }

  get ownerId(): Id {
    return this.#ownerId;
  }
}
