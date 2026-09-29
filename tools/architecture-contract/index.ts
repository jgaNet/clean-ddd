/**
 * The architecture contract API: load the YAML into a typed contract, validate it, query it.
 * The CLI (`yarn architecture`), the conventions check and any future tool are clients of this
 * module; none of them parses YAML itself.
 */
export * from './types';
export * from './load';
export * from './query';
export * from './render';
