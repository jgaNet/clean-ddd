import { Presenter } from '@Architecture/Presentation/Presenter';

/** The two ways this application answers: JSON for API clients, HTML fragments for the HTMX front end. */
export type Format = 'json' | 'htmx';

export const formatOf = (req: { headers: { [header: string]: unknown } }): Format =>
  req.headers['hx-request'] ? 'htmx' : 'json';

/**
 * One presenter per format for a given view model. JSON is mandatory (every use case has an
 * API); HTMX is optional and falls back to JSON. A plain object: the controller owns its
 * presenters, nothing registers or looks them up by name.
 */
export type ByFormat<T> = { json: Presenter<T, unknown>; htmx?: Presenter<T, unknown> };

export const present = <T>(presenters: ByFormat<T>, format: Format, data: T): unknown =>
  (presenters[format] ?? presenters.json).present(data);
