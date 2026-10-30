# Contexts

One folder per bounded context, each with the four layers (`Domain`, `Application`, `Infrastructure`, `Presentation`)
and its wiring file `module.local.ts`.

`Tracker`: what any asynchronous application needs and none competes on: a client follows a command's
`202 { operationId }` here. The contexts that are your business go beside it.
