import { INoteTitleSuggestions, TitleSuggestion } from '@Contexts/Notes/Application/Suggestions/INoteTitleSuggestions';

/**
 * The local adapter of INoteTitleSuggestions: the first line of the content, as it is. It is a
 * heuristic standing where a model would stand; an LLM adapter implements the same port and
 * nothing else changes. On purpose it does not trim its proposal to NoteTitle's rules: a blank
 * first line or a very long one is proposed as such, and the aggregate refuses it, which is
 * the point of ADR 7 and what the e2e case shows.
 */
export class FirstLineTitleSuggestions implements INoteTitleSuggestions {
  static readonly VERSION = 'first-line/1';

  async suggest({ content }: { content: string }): Promise<TitleSuggestion> {
    const [firstLine = ''] = content.split('\n');
    return {
      title: firstLine.trim(),
      provenance: { source: 'heuristic', version: FirstLineTitleSuggestions.VERSION, at: new Date() },
    };
  }
}
