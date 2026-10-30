# 15. Notices survive a crash

The machine the application runs on can lose power at any moment. People must still be told what they are owed.

- When the server is killed abruptly, at any moment, and started again on the same database, every archiving that was recorded gives each account the note was shared with exactly one notification for it. None is lost and none is doubled, however many times the server restarts afterwards. An archiving that was not recorded gives no notification.
- For drills, when the environment variable `FAULT_DRILL` is `after-archive`, the server dies abruptly, as if the power were cut, right after the first archiving it records is stored and before it does anything else about it. Started again without the variable, it does what it still owes.
- The API does not change.
