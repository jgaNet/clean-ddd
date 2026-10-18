"""The Domain layer of the Notes context: the ``Note`` aggregate and everything around it. It
imports the building blocks' Domain, the shared kernel's Domain, and nothing else (ARCH-DOMAIN):
no logging, no HTTP, no persistence and no other context, which the import linter holds."""
