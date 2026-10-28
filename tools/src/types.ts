/**
 * The typed shape of the architecture contract: what conventions/architecture.yaml and
 * conventions/concepts.yaml say for every language, and what one language's binding
 * (conventions/<language>.yaml) adds — its trees, its canonical files, its tools — once the two
 * are loaded into one. TypeScript types and validates; the data stays in the YAML files, so that
 * tooling in another language can read the same contract.
 *
 * Every path in a loaded contract is relative to the repository root, whichever file it came
 * from: a binding writes its paths relative to its own directory and the loader prefixes them.
 */

export const SUPPORTED_SCHEMA_VERSION = 1;

/** How a rule is held: by the import linter, by the conventions check, by the compiler, by a spec, by people, by the evaluations. */
export type Enforcement = 'linter' | 'check' | 'types' | 'tests' | 'review' | 'evaluations';

export interface Rule {
  id: string;
  name: string;
  /** The rule, in one sentence a reviewer or an agent can apply. */
  statement: string;
  why: string;
  remediation: string;
  enforcement: Enforcement;
  /** What explains the rule in every language: ADRs and conventions, as repository-relative paths. */
  references: string[];
  /** The files that show the rule in this language, as repository-relative paths. */
  examples: string[];
  /** A dependency rule comes from the layers table and carries what the layer may import. */
  dependency?: { layer: string; mayImport: string[] };
}

export interface Concept {
  id: string;
  /** Markdown allowed (bold for the concepts the README emphasises). */
  name: string;
  layer: 'domain' | 'application' | 'infrastructure' | 'presentation';
  /** The files that show it in this language; empty when the language does not show it yet. */
  canonical: string[];
  examples: string[];
  /** The README's "canonical example" cell, Markdown; defaults to links to `canonical`. */
  example?: string;
  /** The README's "notes" cell, Markdown, the same in every language. */
  description: string;
  /** What this language adds to the notes cell, Markdown. */
  notes?: string;
  rules: string[];
  references: string[];
}

export interface TestRow {
  layer: string;
  example: string;
  doubles: string;
}

export interface VocabularyRow {
  word: string;
  meaning: string;
  /** Where this language shows the word, Markdown; empty when it does not yet. */
  see: string;
}

export interface Verb {
  /** What the request does to what the URL names: read, create, act, create-under, replace, replace-part, change-part, remove. */
  intent: string;
  verb: string;
  shape: string;
  when: string;
  /** The routes file that shows it, when the application has one. */
  example?: string;
}

export interface Checklist {
  /** The kind of thing: aggregate, value-object, domain-service, command, query, context. */
  kind: string;
  /** Where it goes, as a path with <Placeholders>. */
  place: string;
  /** The concept in concepts.yaml that shows it. */
  concept: string;
  parts: string[];
}

export type ModeName = 'feature' | 'architecture';

/** A way of working, from the contract: what a change of this kind may and may not touch. */
export interface Mode {
  why: string;
  /** feature: the trees it may not touch at all. */
  protected?: string[];
  /** feature: the exceptions inside them (publishing a contract is a feature's business). */
  allowed?: string[];
  /** architecture: the trees whose change is a decision. */
  decides?: string[];
  /** architecture: where the decision is written. */
  records?: string;
}

export interface Tree {
  alias: string;
  path: string;
}

/** The language a contract is loaded for: its binding's id, its display name, its directory. */
export interface Language {
  id: string;
  name: string;
  /** The language's directory, relative to the repository root; '.' when the language is alone. */
  root: string;
}

export interface ArchitectureContract {
  schemaVersion: number;
  /** Every language the reference is written in, by binding id. */
  languages: string[];
  language: Language;
  contexts: string[];
  contextsTree: Tree;
  architecture: Tree;
  kernel: Tree;
  bootstrap: Tree;
  wiring: string;
  libraries: string[];
  /** What stands behind each enforcement word in this language, for the documents. */
  enforcers: Record<Enforcement, string>;
  /** The commands a change must pass before it is done, in CI's order. */
  checks: string[];
  layers: string[];
  rules: Rule[];
  concepts: Concept[];
  tests: TestRow[];
  vocabulary: VocabularyRow[];
  verbs: Verb[];
  checklists: Checklist[];
  modes: Record<ModeName, Mode>;
  sources: { architecture: string; concepts: string; binding: string };
}

export class ContractError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported-schema-version' | 'malformed',
  ) {
    super(message);
  }
}
