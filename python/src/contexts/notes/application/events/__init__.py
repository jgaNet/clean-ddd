"""The reactions of the Notes context to its own facts: one handler per domain event something
reacts to. A domain event needs no handler: the aggregate records the fact because it happened,
and a handler is added the day something reacts."""
