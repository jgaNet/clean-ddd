# 40. Storage on PostgreSQL

OpenStay is outgrowing a database file. It moves to PostgreSQL.

- **Where.** OpenStay keeps all its state in the PostgreSQL database at `DATABASE_URL`. `DATABASE_PATH` is no longer read. In this environment a PostgreSQL 16 server answers at `postgresql://postgres@127.0.0.1:55432/postgres`, with no password: create the databases you need on it.
- **Everything holds.** Every request so far behaves as it did: two servers on one database, a server killed at any moment and started again, a payment, a refund or a notice sent once.
- **A fresh database.** A server started on an empty database prepares it, and serves at once.
- **Out of scope.** Moving the data of an existing database file is not asked: OpenStay starts on PostgreSQL empty.

The API works as request 1 says. Nothing in it changes.
