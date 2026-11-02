# 29. Webhooks, as they come

The provider's webhooks arrive late, twice, or in another order than things happened. Money must still move once.

- **Twice.** A webhook delivered twice, with the same event `id`, changes things once. So does one delivered again after OpenStay crashed while handling it.
- **Out of order.** What a payment, a refund or a payout became is decided by what the provider said last happened to it, not by the order the webhooks came in: a `payment.succeeded` is never undone by a `payment.requires_action` that arrives after it. A failure that arrives after a success for the same payment changes nothing.
- **Unknown.** A valid webhook about something OpenStay does not know (a payment of another platform) is answered `2xx` and changes nothing.
- **Forged.** A webhook with no signature, a wrong one, or one more than five minutes old is answered `400` and changes nothing (request 26).

The API works as request 1 says. Nothing new is answered: the payments read as requests 27 and 28 say.
