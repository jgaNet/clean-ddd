# The reading, harmonized

Two readers each graded four trees ([t1–t4](t1-t4.md), [t5–t8](t5-t8.md)) against [the rubric](../../../benchmark/control/reading.md). The rubric was written before either of them read anything. On three items, the readers read the rubric differently. One reading is applied below to all eight trees.

- **N3, two readings, both reported.**
  - *Per behaviour:* "cannot be edited" and "cannot be pinned" each need one decision. A tree fails when one decision is written twice, such as a reminder's due check written in two contexts.
  - *Per rule as worded:* "an archived note cannot be edited or pinned" is one rule, so two separate checks fail.
- **N4, the rubric's wording:** "without throwing through the request". A refusal thrown inside a command and caught before any response passes. One that reaches the transport fails. So t1 passes, as t5 and t7 do; the second reader's reading was this one already.
- **N6, one criterion for every tree:** a part's rule file importing another part's internals fails. An adapter or the wiring importing another part's published port does not. So t1 fails, as t7 does: t1's notes rule file imports types from the file that holds the notifications store and routes. The first reader had passed t1.

| Tree | Run | N1 | N2 | N3 per behaviour (per rule) | N4 | N5 | N6 | N7 | Passed (strict N3) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| t3 | A pilot | ✓ | ✓ | ✓ (✗) | ✓ | ✓ | ✓ | ✓ | 7 (6) |
| t8 | A run 2 | ✓ | ✓ | ✗ (✗) | ✓ | ✓ | ✓ | ✓ | 6 (6) |
| t6 | A run 3 | ✓ | ✓ | ✓ (✗) | ✗ | ✓ | ✓ | ✓ | 6 (5) |
| t4 | D run 1 | ✓ | ✓ | ✓ (✓) | ✓ | ✓ | ✓ | ✓ | 7 (7) |
| t2 | D run 2 | ✓ | ✓ | ✗ (✗) | ✓ | ✓ | ✓ | ✓ | 6 (6) |
| t7 | P run 1 | ✓ | ✓ | ✓ (✗) | ✓ | ✓ | ✗ | ✓ | 6 (5) |
| t1 | P run 2 | ✓ | ✓ | ✓ (✗) | ✓ | ✓ | ✗ | ✓ | 6 (5) |
| t5 | P run 3 | ✓ | ✓ | ✓ (✗) | ✓ | ✓ | ✓ | ✓ | 7 (6) |

**Ranges by arm.**

| Arm | Passed, per behaviour | Passed, per rule |
| --- | --- | --- |
| A | 6–7 | 5–6 |
| D | 6–7 | 6–7 |
| P | 6–7 | 5–6 |

The ranges overlap under both readings: no difference is shown. The failures differ in kind:
- The layered trees duplicate a rule across two contexts (A run 2, D run 2).
- The plain trees couple notes and notifications through internal types (P runs 1 and 2).

**The change probes**, as files to edit for each probe:

| Probe | The three P trees | The A and D trees |
| --- | --- | --- |
| 1. Titles up to 200 characters | 2 | 3 to 4 |
| 2. Case-insensitive tags | 2 | 3 to 6 |
| 3. A due reminder also emailed | 5 | 10 to 12 |

On this proxy, the plain trees' changes were the more local. A layered change is spread across more, smaller files, and needs more reading to find them: about 580–700 lines for probe 3, against about 280–330.
