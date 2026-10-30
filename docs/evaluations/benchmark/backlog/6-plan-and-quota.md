# 6. A plan and a ten-note quota

The product has two plans: Free, which keeps at most 10 notes, and Unlimited.

- Everyone is on Free until they switch. A signed-in person switches their own plan, to Unlimited and back to Free, whenever they like; there is no payment yet. A plan that is neither is refused.
- Every note a person owns counts toward the quota, archived ones included. On Free, writing an eleventh note is refused.
- Back on Free with more than 10 notes, a person keeps all of them; writing a new one is refused until they are under the quota again — which, since archived notes count, does not happen yet.
- A signed-in person reads their plan and its limit.

## The API

| Request | Answer |
| --- | --- |
| `GET /plans/me` | 200 `{ plan: 'free', noteLimit: 10 }` or `{ plan: 'unlimited', noteLimit: null }`; 403 anonymous |
| `PUT /plans/me` `{ plan }` | 202; `plan` is `'free'` or `'unlimited'` |
| `POST /notes` | refused (an `ERROR` outcome) when the quota is reached |
