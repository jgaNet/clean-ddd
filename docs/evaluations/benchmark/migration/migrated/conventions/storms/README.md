# Storms

An expected storm is what an event-storming session decided a feature adds, written in the words the
inventory uses — commands, queries, domain events, policies, the links between contexts — before the
code. The conventions check holds every storm here to the code: done and carried, or not yet.

The [`storm` skill](../../.claude/skills/storm/SKILL.md) facilitates the session and writes the file;
`clean-ddd storm validate <file>` holds it to the contract and the context map, and
`clean-ddd storm --expect <file>` says what the code still owes it.
