# 16. Changes that arrive at the same moment

Several people, or several tabs, change the same note at the same moment.

- Every change the application reports as done is kept. Twenty shares of one note with twenty different accounts, sent at once, leave the note shared with every account whose share succeeded. An edit of a note's text and a share of it, sent at once, are both kept when both succeed.
- A change may be refused because the note changed under it at that moment. It then changes nothing, and its outcome is `ERROR`. A refusal is better than a lost change, and fewer refusals are better than more.
- The application may run as several processes on the same database file, behind one address, so that a person may reach any of them at each request. What one process records, the others answer at once, and changes sent to different processes at the same moment are kept as above. A token one process issued need not work with another; a person signs in to each.
- The API does not change.
