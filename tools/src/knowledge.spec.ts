import { answerKnowledge, renderKnowledge, runKnowledge } from './index';
import type { KnowledgeAnswer, KnowledgeEdge, KnowledgeEntry } from './index';
import { repositoryRoot } from './load';

/**
 * `clean-ddd knowledge <name>` (RFC 0006, K3), on the reference: a command, a rule, an integration event and an
 * unknown name. Every edge says whether it was read from the code (derived) or written under conventions/ (declared).
 */

const root = repositoryRoot();
const entry = (answer: KnowledgeAnswer, kind: KnowledgeEntry['kind']) => {
  const found = answer.entries.find(each => each.kind === kind);
  if (!found) throw new Error(`no ${kind} in the answer for ${answer.name}`);
  return found;
};
const targets = (edges: KnowledgeEdge[], relation: string) =>
  edges.filter(edge => edge.relation === relation).map(edge => edge.target);
const everyEdge = (edges: KnowledgeEdge[]): KnowledgeEdge[] =>
  edges.flatMap(edge => [edge, ...everyEdge(edge.edges ?? [])]);

describe('knowledge, on the reference', () => {
  const shareNote = answerKnowledge(root, 'ShareNote');
  const alreadyShared = answerKnowledge(root, 'NoteAlreadyShared');
  const noteShared = answerKnowledge(root, 'NoteShared');

  it('answers a command: its context, actor, route, aggregate, events, policies, files, rules, tests and contracts', () => {
    const command = entry(shareNote, 'command');
    expect(command.context).toBe('Notes');
    expect(targets(command.edges, 'actor')).toEqual(['a signed-in account']);
    expect(targets(command.edges, 'route')).toEqual(['POST /notes/:id/share']);
    expect(targets(command.edges, 'reaches')).toEqual(['Note']);
    expect(targets(command.edges, 'records')).toEqual(['NoteShared']);
    expect(targets(command.edges, 'reacted-to-by')).toEqual(['NoteSharedHandler']);
    expect(targets(command.edges, 'file')).toEqual(
      expect.arrayContaining([
        'typescript/src/Contexts/Notes/Application/Commands/ShareNote/ShareNoteCommandHandler.ts',
        'typescript/src/Contexts/Notes/Domain/Note/Note.ts',
        'typescript/src/Contexts/Notes/Presentation/API/REST/Routes/note.routes.ts',
        'typescript/src/Contexts/Notes/module.local.ts',
      ]),
    );
    expect(targets(command.edges, 'can-refuse-with')).toEqual(
      expect.arrayContaining([
        'NoteNotFound',
        'NotNoteOwner',
        'NoteArchived',
        'CannotShareWithSelf',
        'NoteAlreadyShared',
        'RecipientNotFound',
      ]),
    );
    expect(targets(command.edges, 'tested-by')).toContain(
      'typescript/src/Contexts/Notes/Presentation/API/REST/Routes/note.routes.e2e.spec.ts',
    );
    expect(targets(command.edges, 'cited-by')).toContain('conventions/storms/share-a-note.yaml');
    expect(targets(command.edges, 'crosses')).toEqual(['Notes → Notifications', 'Security → Notes']);
  });

  it('gives each rule a command can refuse with its statement and origin, declared, and its tests, derived', () => {
    const refusal = entry(shareNote, 'command').edges.find(edge => edge.target === 'NoteAlreadyShared')!;
    expect(refusal.provenance).toBe('derived');
    const facts = refusal.edges ?? [];
    expect(facts.find(edge => edge.relation === 'statement')).toMatchObject({
      provenance: 'declared',
      source: 'conventions/rules.yaml',
    });
    expect(facts.find(edge => edge.relation === 'origin')).toMatchObject({
      target: 'the storm share-a-note',
      provenance: 'declared',
    });
    expect(facts.filter(edge => edge.relation === 'tested-by').every(edge => edge.provenance === 'derived')).toBe(true);
  });

  it('answers a rule: its statement and origin, the exception that returns it, who returns it, the tests that name it', () => {
    const rule = entry(alreadyShared, 'rule');
    expect(rule.context).toBe('Notes');
    expect(targets(rule.edges, 'statement')).toEqual(['A note is shared with an account once.']);
    expect(targets(rule.edges, 'returned-by')).toEqual(['ShareNote']);
    expect(targets(rule.edges, 'file')).toEqual(
      expect.arrayContaining(['typescript/src/Contexts/Notes/Domain/Note/NoteExceptions.ts']),
    );
    expect(targets(rule.edges, 'tested-by')).toContain('typescript/src/Contexts/Notes/Domain/Note/Note.spec.ts');
  });

  it('answers an integration event: who publishes and consumes it, its declared payload, the relationship it crosses', () => {
    expect(noteShared.entries.map(each => each.kind).sort()).toEqual(['domain-event', 'integration-event']);
    const event = entry(noteShared, 'integration-event');
    expect(targets(event.edges, 'published-by')).toEqual(['Notes.NoteSharedHandler']);
    expect(targets(event.edges, 'consumed-by')).toEqual(['Notifications.NoteSharedIntegrationEventHandler']);
    expect(event.edges.find(edge => edge.relation === 'payload')).toMatchObject({
      provenance: 'declared',
      source: 'conventions/integration-events.yaml',
    });
    const crossing = event.edges.find(edge => edge.relation === 'crosses')!;
    expect(crossing.target).toBe('Notes → Notifications');
    expect(crossing.edges?.[0]).toMatchObject({
      relation: 'relationship',
      provenance: 'declared',
      source: 'conventions/domain.yaml',
    });
  });

  it('tags every edge derived or declared, with where it was read, repository-relative; citations are derived', () => {
    for (const answer of [shareNote, alreadyShared, noteShared]) {
      const edges = everyEdge(answer.entries.flatMap(each => each.edges));
      expect(edges.length).toBeGreaterThan(5);
      for (const edge of edges) {
        expect(['derived', 'declared']).toContain(edge.provenance);
        expect(edge.source).not.toBe('');
        expect(edge.source.startsWith('/')).toBe(false);
        if (edge.citation) expect(edge.provenance).toBe('derived');
      }
    }
    expect(shareNote.unread).toEqual([]);
  });

  it('answers an unknown name with the nearest known names, and nothing invented', () => {
    const answer = answerKnowledge(root, 'ShareNotes');
    expect(answer.entries).toEqual([]);
    expect(answer.nearest).toContain('ShareNote');
    expect(renderKnowledge(answer)).toContain('Nothing in this tree is called ShareNotes');
    let written = '';
    expect(runKnowledge(['ShareNotes', '--json', '--root', root], root, text => (written += text))).toBe(1);
    expect(JSON.parse(written).nearest).toContain('ShareNote');
  });

  it('renders Markdown with the provenance of each edge', () => {
    const text = renderKnowledge(shareNote);
    expect(text).toContain('# ShareNote — command of Notes');
    expect(text).toContain('_declared: conventions/rules.yaml_');
    expect(text).toContain('## Contracts it crosses');
  });
});
