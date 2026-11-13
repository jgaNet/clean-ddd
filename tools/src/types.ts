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

/** The wire a migrated application answers on (ADR 36): the contract's grammar alone, or the legacy's routes beside it. */
export type MigrationApi = 'native' | 'compat';

/** A compatibility route: one legacy route, served by the transport, bound to one command or query of the inventory. */
export interface CompatibilityRoute {
  method: string;
  path: string;
  /** The public name of the command or query it stands for, as the inventory spells it. */
  operation: string;
  /** The file that serves it, repository-relative, under the transport. */
  file: string;
  /** When it goes: a date (`YYYY-MM-DD`), which the check holds, or the condition in words. */
  retires: string;
}

/** The binding's `migration`: the wire and the compatibility routes; absent when nothing was migrated. */
export interface Migration {
  api: MigrationApi;
  routes: CompatibilityRoute[];
}

/**
 * A guarantee of the floor (ADR 40): what no profile may drop, with the rules that hold it. A guarantee
 * no rule holds yet, or one held by review, says its gap; one held by something that is not a rule
 * says what (`modes`: the two modes, which the gate runs).
 */
export interface FloorGuarantee {
  guarantee: string;
  rules: string[];
  gap?: string;
  heldBy?: string;
}

/**
 * An architecture profile (ADR 40): a way of holding the contract, never a second wording of it. It
 * holds rules, waives others with a reason, and holds some only where a mechanical trigger fires; the
 * rules it holds by review alone are its gaps. `holds: 'all'` is every rule the contract has that the
 * profile neither waives nor holds conditionally, so a rule added later is held until the profile says
 * otherwise.
 */
export interface Profile {
  id: string;
  name: string;
  why: string;
  /** The profile a context is held to when its binding names none. Exactly one profile is. */
  default: boolean;
  holds: 'all' | string[];
  /** Rule id → why this profile does not hold it. */
  waives: Record<string, string>;
  /** Rule id → the trigger (one of TRIGGERS) where this profile holds it. */
  conditional: Record<string, string>;
  /** The rules it holds by review alone: named, never presented as guarantees. */
  gaps: string[];
  /** The HTTP grammar it answers on: a section of the contract with `verbs` (`http`, the contract's). */
  grammar: string;
  /** The kinds of thing its features are made of: `all` of `checklists`, or a list of their kinds. */
  checklists: 'all' | string[];
  /**
   * What it does with each mechanism of Full no rule mandates (RFC 0002, H2), by id; empty: every
   * mechanism, as written (Full).
   */
  mechanisms: Record<string, ProfileMechanism>;
}

/**
 * A mechanism of Full that no rule mandates (the command bus, the operations, an aggregate for
 * everything), as a profile classifies it: kept; not used, with the trigger that brings it in by an
 * ADR where the engine can see one; or replaced by a shape of the profile's own (`uses`).
 */
export interface ProfileMechanism {
  stance: 'kept' | 'not-used' | 'uses';
  why: string;
  /** For `not-used`: the trigger (one of TRIGGERS) where it comes in, by an ADR. */
  until?: string;
}

/**
 * How a binding holds a profile other than the default (ADR 40): what a new thing of each kind is
 * made of under it (only the kinds that differ from the binding's own checklists), the files that
 * show each of its mechanisms, and what `create --profile <id>` copies in place of the binding's
 * own `create` (the keys it names; the others are the binding's).
 */
export interface ProfileBinding {
  checklists: Checklist[];
  shows: Record<string, string[]>;
  create?: Partial<CreateSpec>;
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
  /**
   * The commands that put right what a check would only refuse, run by the gate's `--fix` before it judges: a formatter
   * that writes (ADR 31: an agent should spend no turn on bookkeeping; J5b's request 90 escalated on formatting alone).
   */
  fixes: string[];
  /**
   * When present, the gate asks every relationship between two contexts that a change crosses for a test
   * of its own, changed with it, named for the pair (`Messaging → Moderation`): the files whose name ends in
   * `suffix`. Absent: the gate asks nothing. With `run` (a command, `{files}` the tests, from the language's
   * directory), a test that adds a case is also run at the base and must fail there (ADR 34).
   */
  relationshipTests?: { suffix: string; run?: string };
  /** What `create --language <id>` makes of this language's directory; absent when the binding says nothing about it yet. */
  create?: CreateSpec;
  layers: string[];
  rules: Rule[];
  concepts: Concept[];
  tests: TestRow[];
  vocabulary: VocabularyRow[];
  verbs: Verb[];
  checklists: Checklist[];
  modes: Record<ModeName, Mode>;
  /** The wires a migrated application may answer on, from the contract: each with what it means (ADR 36). */
  migrationApis: Record<string, string>;
  /** This application's choice, from the binding; absent when it was not migrated from anything. */
  migration?: Migration;
  /** The guarantees no profile may drop (ADR 40); empty when the contract declares no profiles. */
  floor: FloorGuarantee[];
  /** The profiles the contract declares (ADR 40); empty when it declares none, and then it is held as written. */
  profiles: Profile[];
  /** The binding's profile per context, as it names them; a context it does not name is held to the default. */
  contextProfiles: Record<string, string>;
  /** The HTTP grammars the contract holds: each top-level section with `verbs` (`http`, the contract's own). */
  grammars: string[];
  /** The verbs of each grammar but the contract's own `http` (whose verbs are `verbs`), by grammar. */
  grammarVerbs: Record<string, Verb[]>;
  /** The profile a context the binding does not name is held to, when the binding says one (`default_profile`). */
  bindingProfile?: string;
  /** The profiles other than the default this binding holds, and how (`profiles_held`); empty: the default alone. */
  profilesHeld: Record<string, ProfileBinding>;
  sources: { architecture: string; concepts: string; binding: string };
}

/**
 * What `create` copies and writes for one language (ADR 10): the files copied as they are, or under
 * another name (a composition root the reference keeps beside its own; ADR 27) (paths
 * repository-relative, like every path a loaded contract carries), the folder the integration
 * events go in, the manifest rewritten with the application's name, the dependencies to keep,
 * whether the language's tool wants an inventory committed, and the commands the generated
 * guide shows first.
 */
export interface CreateSpec {
  /** Each file or folder copied, and where it lands: the same path, unless the binding renames it. */
  copy: { from: string; to: string }[];
  contracts: string;
  manifest: string;
  /** A workspace manifest's members, when the manifest is one (Rust). */
  members: string[];
  dependencies: string[];
  devDependencies: string[];
  scripts: string[];
  inventory: boolean;
  install: string;
  test: string;
}

export class ContractError extends Error {
  constructor(
    message: string,
    readonly code: 'unsupported-schema-version' | 'malformed',
  ) {
    super(message);
  }
}
