import { v4 as uuidv4 } from 'uuid';

import { ValueObject } from './ValueObject';

/**
 * Id is the identity of an entity. The domain generates it itself (`Id.generate()`)
 * when it creates an aggregate, so a persistence round-trip is never needed to know
 * who a new object is, and the repository stays a plain load/save port.
 */
export class Id extends ValueObject<string> {
  static generate(): Id {
    return new Id(uuidv4());
  }
}
