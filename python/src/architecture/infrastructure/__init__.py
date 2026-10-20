"""The Infrastructure of the building blocks: the in-memory pieces every context's local wiring
and the composition root build on. A Map used as a database, a process-local event bus, a unit
of work over the stores, a logger on the console. Each implements a port of the Application
layer, and a real adapter (a database, a broker) implements the same port instead."""
