/* eslint-disable  @typescript-eslint/no-explicit-any */
export interface Mapper<T, K extends Record<any, any>> {
  toDTO(entity: T): K;
  toDomain(json: K): T;
}
