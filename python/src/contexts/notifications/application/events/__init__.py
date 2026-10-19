"""The anti-corruption layer: one handler per consumed contract. Each knows the published
contract of another context and nothing else of it, restates the fact in the Notifications
vocabulary (a recipient, a title, channels) and hands it to the local use case. If a contract
changes, its handler is the only file to touch here."""
