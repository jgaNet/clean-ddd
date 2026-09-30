/**
 * The typed shape of the architecture contract: what conventions/architecture.yaml and
 * conventions/concepts.yaml say, once loaded. TypeScript types and validates; the data stays in
 * the YAML files, so that tooling in another language can read the same contract.
 */

export const SUPPORTED_SCHEMA_VERSION = 1;

/** How a rule is held: by the linter, by the conventions check, by the compiler, by a spec, by people, by the evaluations. */
export type Enforcement = 'eslint' | 'check' | 'types' | 'tests' | 'review' | 'evaluations';

export interface Rule {
  id: string;
  name: string;
  /** The rule, in one sentence a reviewer or an agent can apply. */
  statement: string;
  why: string;
  remediation: string;
  enforcement: Enforcement;
  /** ADRs and canonical files, as repository-relative paths. */
  references: string[];
  /** A dependency rule comes from the layers table and carries what the layer may import. */
  dependency?: { layer: string; mayImport: string[] };
}

export interface Concept {
  id: string;
  /** Markdown allowed (bold for the concepts the README emphasises). */
  name: string;
  layer: 'domain' | 'application' | 'infrastructure' | 'presentation';
  canonical: string[];
  examples: string[];
  /** The README's "canonical example" cell, Markdown; defaults to links to `canonical`. */
  example?: string;
  /** The README's "notes" cell, Markdown. */
  description: string;
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
  see: string;
}

export interface Verb {
  /** What the request does to what the URL names: read, create, act, create-under, replace, replace-part, change-part, remove. */
  intent: string;
  verb: string;
  shape: string;
  when: string;
  example: string;
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

export interface Tree {
  alias: string;
  path: string;
}

export interface ArchitectureContract {
  schemaVersion: number;
  contexts: string[];
  architecture: Tree;
  kernel: Tree;
  wiring: string;
  libraries: string[];
  layers: string[];
  rules: Rule[];
  concepts: Concept[];
  tests: TestRow[];
  vocabulary: VocabularyRow[];
  verbs: Verb[];
  checklists: Checklist[];
  sources: { architecture: string; concepts: string };
}

export class ContractError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported-schema-version' | 'malformed',
  ) {
    super(message);
  }
}
