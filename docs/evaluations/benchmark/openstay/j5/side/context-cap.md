# The limited context: what the rehearsal found (2026-11-04)

**The setting.** The agent's CLI reads `CLAUDE_CODE_AUTO_COMPACT_WINDOW`: the context size at which a conversation is compacted.

**The rehearsal.** The smallest model was given `CLAUDE_CODE_AUTO_COMPACT_WINDOW=30000` and only the Read tool. It was asked to read three documents of about 18 KB each, read the first one again, then answer one question. It cost $0.018. The context of each turn was read from its transcript:

| Turn | Context (tokens) |
| --- | --- |
| first | 41,932 |
| after the first read | 50,159 |
| after the second | 57,191 |
| after the third | 65,647 |
| *compacted* | |
| after the compaction | 51,843 |

**What it shows.**
- **The agent's fixed context is about 42,000 tokens before it reads anything:** its instructions and its tools. A whole context of 30,000 tokens cannot be held.
- **The setting does act.** The conversation was compacted once about 24,000 tokens had been read above the fixed context. The transcript records each compaction (`compact_boundary`) and each turn's context, so the cap can be checked afterwards.

**What can be held instead:** about 30,000 tokens of work above the agent's fixed context, enforced by compaction and checked in each transcript. Whether that is the experiment the maintainer decided is the maintainer's call.

**Decided by the maintainer on 2026-11-04:** the experiment runs with about 30,000 tokens of work above the agent's fixed context (`CLAUDE_CODE_AUTO_COMPACT_WINDOW` set to the fixed context plus 30,000). Each transcript's compactions and contexts are checked, and the record says it is 30,000 tokens of work, not 30,000 in all.
