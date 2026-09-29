/**
 * Where a title suggestion came from, kept with the suggestion so that an accepted one can be
 * traced back: which source, which version of it, when. An LLM adapter would put the model and
 * the prompt version here; the rule-based adapter puts its rule.
 */
export interface SuggestionProvenance {
  source: string;
  version: string;
  at: Date;
}

/** What the source proposes. Whether the note accepts it is the aggregate's decision (NoteTitle's rules). */
export interface TitleSuggestion {
  title: string;
  provenance: SuggestionProvenance;
}

/**
 * The port for a decision the domain cannot make from its own state: what a note should be
 * called, given its content. Its answer is not reproducible from the business state alone (a
 * model, a heuristic, a person may all stand behind it), so it enters the domain as a value
 * the aggregate validates and may refuse. Named for what it decides, not for the technology.
 * See docs/adr/0007-non-determinism-enters-the-domain-as-a-value.md.
 */
export interface INoteTitleSuggestions {
  suggest(input: { content: string }): Promise<TitleSuggestion>;
}
