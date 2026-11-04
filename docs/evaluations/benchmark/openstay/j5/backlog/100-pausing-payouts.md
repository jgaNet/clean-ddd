# 100. Pausing payouts

During an incident (the provider sending money to the wrong accounts, a fraud under way), an administrator must be able to stop every payout at once, and start again later without losing or doubling any.

- **Payouts, as they are.** A host is paid what is due on each paid booking once its check-in has begun (request 33), through a payout to their enabled account (`POST /payouts` `{ account, amount, reference }` at the provider, request 26), per booking or once a week on their weekday (request 47); a failed payout is owed again (request 34). The work runs at least every `JOBS_INTERVAL_SECONDS` seconds (request 30, 60 when that is not set).
- **Pausing.** An administrator (an account whose email is in `ADMIN_EMAILS`, a comma-separated list, request 37) pauses every payout, with a reason of 1 to 500 characters. From the moment the pause is answered, no server sends any payout to the provider: not a booking's, not a weekly one, not one replacing a failed one. Pausing while paused is refused.
- **Only payouts.** Payments, refunds and webhooks go on. A payout sent before the pause goes on too: its `payout.paid` or `payout.failed` is handled as before, and a failed one waits like the others.
- **Holding.** The pause holds until an administrator resumes: across a server killed and started again, and on every server on the same database. A server started while payouts are paused starts paused.
- **Resuming.** An administrator resumes. Resuming when not paused is refused. Payouts then follow their schedules as before: what is due per booking is paid at the next run of the work, and a weekly host on their next weekday (today, if today is it). Nothing is lost: everything that came due during the pause is paid.
- **Once.** Each booking is still paid out once: never twice, even when a server is killed between asking the provider and recording it, or when two servers resume at once (request 33).
- **Seen.** An administrator reads whether payouts are paused, since when and why. While paused, every booking owed a payout counts in the dashboard's `heldPayouts` (request 99).
- **The audit log.** Each pause and each resume is an entry of the audit log (request 67), `{ id, at, adminId, action, subjectId, note }`: `action` `payouts-paused`, with the reason as `note`, or `payouts-resumed`, with `note` `null`; `subjectId` `payouts` for both. It is read at `GET /v1/admin/audit?subjectId=payouts`, oldest first.
- **Who.** These routes answer `403` to anyone but an administrator.

The API works as request 1 says; the provider's payouts are request 26's.

## The API

| Request | Answer |
| --- | --- |
| `POST /v1/admin/payouts/pause` `{ reason }` | |
| `POST /v1/admin/payouts/resume` | |
| `GET /v1/admin/payouts/status` | `200 { paused, since, reason }`; `since` and `reason` `null` when not paused |
