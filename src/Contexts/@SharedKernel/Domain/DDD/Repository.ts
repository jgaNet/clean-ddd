/**
 * Repository: a base class for the write side of persistence, bound to a DataSource.
 *
 * A repository speaks in aggregates (find one, save one). Listing and filtering do not
 * belong here; they are the job of a queries service (see QueriesService).
 *
 * The Notes context declares its repository as a plain interface instead
 * (Contexts/Notes/Domain/Note/Ports/INoteRepository.ts): a port only needs to say what
 * the domain requires, and the infrastructure decides how to store it.
 */

import { DataSource } from '../Services';
export abstract class Repository<T> {
  abstract dataSource: DataSource<T>;
}
