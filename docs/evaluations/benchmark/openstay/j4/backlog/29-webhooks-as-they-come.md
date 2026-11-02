# 29. Webhooks, as they come

The provider's webhooks arrive late, twice, or in another order than things happened. Money must still move once.

- **Twice.** A webhook delivered twice, with the same event `id`, changes things once. So does one delivered again after OpenStay crashed while handling it.
- **Out of order.** A payment only moves forward: `requires_payment`, then `requires_action`, then `succeeded` or `failed`; `succeeded` is final. A refund and a payout move from `pending` to `succeeded` (`paid`) or `failed`, and a success is final. So a `payment.succeeded` is never undone by a `payment.requires_action` that arrives after it, and a failure that arrives after a success for the same payment changes nothing, whatever the order the webhooks came in.
- **Unknown.** A valid webhook about something OpenStay does not know (a payment of another platform) is answered `2xx` and changes nothing.
- **Forged.** A webhook with no signature, a wrong one, or one more than five minutes old is answered `400` and changes nothing (request 26).

The API works as request 1 says. Nothing new is answered: the payments read as requests 27 and 28 say.
