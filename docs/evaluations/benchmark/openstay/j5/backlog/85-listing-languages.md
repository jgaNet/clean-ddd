# 85. A listing in several languages

A traveller from Berlin reads a place better in German, one from Madrid in Spanish. A host writes their listing in as many languages as they like, and each traveller reads the one closest to theirs.

- **A description.** A listing gains a `description`, of 0 to 5,000 characters, empty until written.
- **Languages.** A language is a tag of two or three letters, optionally a dash and a two-letter region: `en`, `fr`, `de`, `es`, `it`, `en-GB`, `pt-BR`. Case does not matter in what is sent, and tags are answered with the language in lower case and the region in capitals (`EN-gb` is `en-GB`). Anything else is refused.
- **The default language.** A listing's own `title` (request 2) and `description` are in its default language, `en` until the host changes it. Every listing created before this request has `en` as its default language.
- **Translations.** The host writes a listing's title (1 to 100 characters, not only spaces, as request 2 says) and description in a language. Writing in a language again replaces that language's text; writing in the default language replaces the listing's own title and description, and `PUT /v1/listings/{id}` (request 2) changes the default language's title.
- **Changing the default.** The host makes another language the default, one the listing has a text in; any other is refused. The listing's own title and description are then that language's, and the former default's text stays, as a translation in its language.
- **Reading in a language.** A listing (`GET /v1/listings/{id}`) and every search result (requests 3, 12, 14) are answered in the best match for the request's `Accept-Language` header, and say which in `language`:
  - the header's languages are taken by their `q` weight, highest first (1 when not given; `q=0` means not wanted), then in the order written;
  - for each in turn: a text in exactly that tag; else a text in its language alone (`fr` for `fr-CH`); else a text in the same language with another region, the first in alphabetical order of tags (`fr-BE` for `fr` or `fr-CH`);
  - `*`, or no language of the header matched, or no header: the default language.

  For example, a listing in `en` (default), `fr` and `de-CH`, asked with `Accept-Language: it, de;q=0.8, fr;q=0.5`, answers in `de-CH`.
- **Only the text changes.** Search finds the same listings, in the same order, whatever the language.
- **Who.** The listing's host, or a manager of its organisation (request 24). An archived listing changes no more. Anyone who can see the listing reads its translations.

The API works as request 1 says.

## The API

| Request | Answer |
| --- | --- |
| `PUT /v1/listings/{id}/translations/{lang}` `{ title, description }` | |
| `PUT /v1/listings/{id}/default-language` `{ language }` | |
| `GET /v1/listings/{id}/translations` | `200 [ { language, title, description } ]`, every language the listing has a text in, the default included, in alphabetical order of tags |
| `GET /v1/listings/{id}`, `GET /v1/listings?…`, with or without `Accept-Language` | each listing gains `description`, `defaultLanguage` and `language`; `title` and `description` are those of `language` |
