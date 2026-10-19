"""The Notifications context: something to tell one account, and the story of how it was
delivered. It reacts to what the other contexts publish (an account created or validated, a
note shared, an operation complete) through anti-corruption handlers, and reaches the
recipient over the websocket or by email."""
