/**
 * The API a kit's requests give, as data: each request's fragment (`api/<n>-<id>.yaml` in the kit),
 * composed up to request n, and a response held to the composition. Every shape carries the request
 * that set it, so a problem names the request a tree departed from, not only the line of a test
 * (docs/evaluations/benchmark/kit-standard.md).
 *
 * The composer is the tooling's (`tools/src/api.ts`, `clean-ddd/api` in the package; ADR 45), the one a
 * created application's end-to-end client holds its answers with: the flow reads it from the source in a
 * checkout, and from the installed package elsewhere. This file gives it the names the flow has always
 * used (`compose`, `validate`, …); the fragment's format is documented there.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../../tools/src/api.ts', import.meta.url));
const api = await import(existsSync(source) ? source : 'clean-ddd/api');

/** The requests a comment names. */
export const requestsOf = api.requestsOf;
/** The fragments of a kit, in the backlog's order, up to request `upto` (every one when undefined). */
export const loadFragments = api.loadKitFragments;
/** The API up to request `upto`; throws on a fragment that says something composition cannot do. */
export const compose = api.composeApi;
/** The schema a route answered `status` is held to: its own for that status, its class's, or the default. */
export const schemaFor = api.apiSchemaFor;
/** What a response breaks of the composed API: one problem per shape, naming the requests that set it. */
export const validate = api.validateAnswer;
/** For the grader: the composition up to `upto` written to `file` when the kit has `api/`, its path returned. */
export const writeComposed = api.writeComposedApi;
