# One clock in Messaging and Notifications

OpenStay has one now: the clock the application is wired with (the machine's time moved by `CLOCK_OFFSET_DAYS`
days), which every other part of OpenStay already takes its time from. Messaging and Notifications still read the
machine's time in a few places: where a time is not given, they fall back to it.

Change the structure, not the behaviour: in Messaging and Notifications, every time they decide or record comes from
that clock, passed in from where the application is wired, and nothing in them reads the machine's time any more. A
time a method needs is a parameter its caller always gives, never a default. Nothing a client of the API sees
changes, and the tests that hold today's behaviour still pass.
