# 30. Storage on PostgreSQL

Tally is outgrowing a database file: from now on, it keeps everything in PostgreSQL.

- **Where.** Tally keeps all its state in the PostgreSQL database at `DATABASE_URL`. In this environment a PostgreSQL 16 server answers at `postgresql://postgres@127.0.0.1:55432/postgres`, with no password: create the databases you need on it.
- **What it kept moves with it.** A server started on a PostgreSQL database that holds nothing of Tally's yet, while `DATABASE_PATH` names a file Tally kept, by this version or an earlier one, first moves everything the file holds into it, then serves. Nothing is lost on the way: a payment waiting at the provider lands when its webhook comes, and counts once. From then on the file is not read again.
- **A fresh database.** A server started on an empty PostgreSQL database, with no such file, prepares it and serves at once.
- **Everything holds.** Every request so far behaves as it did, with two servers on one database, and a server killed at any moment and started again.

The API works as request 1 says. Nothing in it changes.
