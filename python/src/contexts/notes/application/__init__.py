"""The use cases of the Notes context: one command and its handler per change (``commands/``),
one query handler per read (``queries/``), the reactions to the context's own facts
(``events/``), and the port for the one decision the domain cannot make from its own state
(``suggestions.py``). A handler orchestrates: it loads, asks the aggregate, saves and publishes;
every rule it enforces is the aggregate's or a domain service's."""
