# Persistence

Everything the application knows must survive a restart: accounts, notes with their pins, tags, shares, archive state and reminders, notifications, plans, and the operations a client follows.

- When the environment variable `DATABASE_PATH` names a file, the application stores everything in SQLite, in that file. It creates the file and its tables when they do not exist.
- When `DATABASE_PATH` is unset, the application keeps everything in memory, as it does today.
- Use Node's built-in `node:sqlite` module, so that no dependency is added.
- A token issued before a restart may stop working; a person signs in again. Everything else behaves as before the restart.
- The API does not change.

## The API

No route changes. The server is started the way it is started today, with `PORT` and `DATABASE_PATH` in its environment.
