/**
 * Checks that the conventions and the code agree. Runs in CI as `yarn check:conventions`
 * (`clean-ddd check`), for the language whose tree this tooling reads; `--write` regenerates.
 *
 * 1. The architecture contract is sound: schema version understood, unique rule ids, every
 *    reference and canonical file exists, every concept names rules that exist, and no binding
 *    carries a rule of its own (ARCH-MAP-IS-REAL, ARCH-ONE-CONTRACT). Every language's binding is
 *    checked, not only this one's: the root README's map is rendered from all of them. The profiles
 *    are held there too (ADR 40): every rule held, waived with a reason or held on a trigger the engine
 *    can see, in every profile; no floor rule waived; a rule held by review listed as a gap; each
 *    context of a binding held to a profile the contract declares (profiles.ts).
 * 2. The tree matches it: every directory under the contexts tree is a declared context with its
 *    wiring file and nothing but layers; the two trees beside the contexts hold only layers
 *    (ARCH-CONTEXT-DECLARED).
 * 3. The documents show what the contract renders, between their markers (`--write` regenerates):
 *    this language's README, the repository's CLAUDE.md, and — when the repository holds more than
 *    this language — the root README's map across languages.
 * 4. Every relative link in the documentation resolves.
 * 5. No `eslint-disable` anywhere in src/, except `no-console` in the console logger.
 * 6. Every feature plan under conventions/plans is legal against the contract, so the examples
 *    cannot rot.
 * 7. The import rules generated from the contract behave: a table of probes says which imports each
 *    layer must refuse and which it must allow, and ESLint is asked about each.
 * 8. The domain map, when the repository has one, is sound against every binding and true to the
 *    code both ways: every relationship it declares is carried, every link the code carries is
 *    declared (CTX-MAP-DECLARED); the root README's strategic view is rendered from it.
 * 9. The event storm the documents show is the one read from the code: docs/event-storm.md between
 *    its markers and the docs/event-storm.svg board, when the repository has them.
 * 10. One handler per command: each context's wiring lists every command once, with one handler, and
 *    answers every command a route or a policy builds (ARCH-ONE-HANDLER).
 * 11. One application: this language's inventory under docs/inventory is what its tree says, and every
 *    other language's committed inventory says the same (ARCH-ONE-APPLICATION).
 * 12. Every expected storm under conventions/storms is legal against the contract and the map, and the
 *    code carries the ones marked done and not yet the others.
 * 13. A migrated application answers on the wire its binding says (ADR 36): every compatibility route
 *    stands for a command or a query the inventory lists, and nothing outside the transport waits for an
 *    operation (ARCH-COMPAT-ROUTE).
 * 14. The published language (ADR 44), when the repository has one, is sound against the domain map, and
 *    every inventory carries the last version of each event it declares, field for field: this
 *    language's, read from the tree, and every other language's committed one (CTX-PUBLISHED-LANGUAGE).
 * 15. The API as data (ADR 45), when the language's directory has an `api/` (a created application does):
 *    its fragments compose — each parses, is a fragment, and names no resource none defines
 *    (API-ONE-SURFACE).
 * 16. The rule register (ADR 46), when the repository has one, is sound against the domain map and the
 *    decisions and storms its origins name, and, in the TypeScript tree, every refusal a context's Domain or
 *    Application can return is named by a rule of that context, and every rule has its exception and a spec
 *    of its context that names it (DOMAIN-RULE-NAMED). A tree with no register holds nothing here.
 *
 * A client of the contract API, like the CLI; it parses no YAML itself. One root: the
 * repository's, where the contract and the shared documents live; the language's directory is
 * what its binding says, and every path the contract carries is relative to the root.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, posix, resolve } from 'path';

import {
  DOMAIN_MARKER,
  END_MARKER,
  RULES_MARKER,
  checkDomainAgainstLinks,
  inspectContextLinks,
  loadDomainMap,
  loadStrategicConcepts,
  renderDomain,
  validateDomainMap,
  SECTION_MARKER,
  canImportAll,
  generateProbes,
  explainPlan,
  loadFeaturePlan,
  validatePlan,
  loadArchitectureContract,
  renderConceptLayer,
  renderConceptMatrix,
  renderDependencyTable,
  renderLanguages,
  renderRulesList,
  renderRulesTable,
  renderTests,
  renderVocabulary,
  repositoryRoot,
  DEFAULT_LANGUAGE,
  defaultLanguage,
  validateContract,
  STORM_MARKER,
  inspectEventStorm,
  oneHandlerProblems,
  renderEventStorm,
  renderEventStormSvg,
  INVENTORY_DIR,
  compareInventories,
  inventoryChanges,
  inspectInventory,
  loadInventories,
  serializeInventory,
  STORMS_DIR,
  checkExpectedStorm,
  loadExpectedStorm,
  validateExpectedStorm,
  checkMigrationAgainstInventory,
  waitsOutsideTransport,
  profileOf,
  loadPublishedLanguage,
  validatePublishedLanguage,
  checkInventoryAgainstPublishedLanguage,
  loadRuleRegister,
  validateRuleRegister,
  inspectRuleEvidence,
  checkRuleRegister,
  RULE_NAMED,
  API_DIR,
  applicationApiProblems,
} from './index';
import type { ArchitectureContract, ContextLink, Inventory, Mechanism } from './index';

export interface CheckReport {
  /** Empty when the conventions and the code agree. */
  problems: string[];
  /** One line saying what was held to what, for the terminal. */
  summary: string;
}

export async function checkConventions(
  root: string = repositoryRoot(),
  write: boolean = false,
  language: string = defaultLanguage(root),
): Promise<CheckReport> {
  const problems: string[] = [];
  const problem = (message: string) => problems.push(message);

  // 1. The contract is sound, for this language and for every other the map shows

  const contract = loadArchitectureContract(root, language);
  problems.push(...validateContract(contract, root));
  /**
   * The steps that walk a tree — its layout, the silenced linter, the import probes, the links,
   * the storm, the inventory — are written for the TypeScript tree (ADR 11); for another language
   * they are its own tool's, and this check holds the contract and the documents.
   */
  const readsTree = contract.language.id === DEFAULT_LANGUAGE;
  const others: ArchitectureContract[] = [];
  for (const language of contract.languages.filter(language => language !== contract.language.id)) {
    try {
      const other = loadArchitectureContract(root, language);
      problems.push(...validateContract(other, root));
      others.push(other);
    } catch (error) {
      problem(`conventions/${language}.yaml: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const contracts = [contract, ...others];
  /** The directory of this language's documents, relative to the repository root. */
  const at = contract.language.root;
  /** More than one language, or one that is not the repository itself: the root has documents of its own. */
  const multi = at !== '.';

  // 8. The domain map, when there is one: sound against every binding, and true to the code both ways

  const domainMap = loadDomainMap(root);
  // The links between contexts: read from the TypeScript tree, or, for another language, from the
  // inventory its own tool keeps current — the same links, in the same words (ARCH-ONE-APPLICATION).
  const committedInventoryFile = posix.join(INVENTORY_DIR, `${contract.language.id}.json`);
  const committedInventory = (): Inventory | undefined =>
    existsSync(join(root, committedInventoryFile))
      ? (JSON.parse(readFileSync(join(root, committedInventoryFile), 'utf8')) as Inventory)
      : undefined;
  const inventoryLinks = (): ContextLink[] | undefined =>
    committedInventory()?.links.map(link => ({
      ...link,
      mechanism: link.mechanism as Mechanism,
      evidence: [committedInventoryFile],
    }));
  const links: ContextLink[] = domainMap
    ? readsTree
      ? inspectContextLinks(contract, root)
      : (inventoryLinks() ?? [])
    : [];
  const linksKnown = readsTree || (domainMap !== undefined && inventoryLinks() !== undefined);
  if (domainMap) {
    problems.push(...validateDomainMap(domainMap, contracts, root));
    if (linksKnown) problems.push(...checkDomainAgainstLinks(domainMap, links, contract.language.name));
  }

  if (readsTree) {
    // 2. The tree matches the contract

    const layers = contract.layers;
    const contextsDir = join(root, contract.contextsTree.path);
    for (const entry of readdirSync(contextsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !contract.contexts.includes(entry.name)) {
        problem(
          `ARCH-CONTEXT-DECLARED: ${contract.contextsTree.path}/${entry.name} is not declared in ${contract.sources.binding}, so no import rule applies to it`,
        );
      }
    }
    for (const context of contract.contexts) {
      const dir = join(contextsDir, context);
      if (!existsSync(dir)) {
        problem(
          `ARCH-CONTEXT-DECLARED: ${contract.sources.binding} declares the context ${context}, which does not exist`,
        );
        continue;
      }
      if (!existsSync(join(dir, contract.wiring)))
        problem(`ARCH-CONTEXT-DECLARED: ${contract.contextsTree.path}/${context} has no ${contract.wiring}`);
      for (const entry of readdirSync(dir)) {
        if (entry !== contract.wiring && !layers.includes(entry)) {
          problem(
            `ARCH-CONTEXT-DECLARED: ${contract.contextsTree.path}/${context}/${entry} is neither a layer (${layers.join(', ')}) nor ${contract.wiring}`,
          );
        }
      }
    }
    for (const tree of [contract.architecture, contract.kernel]) {
      if (!existsSync(join(root, tree.path))) {
        problem(`ARCH-TREES: ${tree.path} (${tree.alias}) does not exist`);
        continue;
      }
      for (const entry of readdirSync(join(root, tree.path))) {
        if (!layers.includes(entry))
          problem(`ARCH-TREES: ${tree.path}/${entry} is not a layer: ${tree.alias} holds layers and nothing else`);
      }
    }
  }

  // 3. The documents show what the contract renders

  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function renderInto(file: string, blocks: [string, string][]): void {
    let text = readFileSync(join(root, file), 'utf8');
    for (const [open, rendered] of blocks) {
      // A block may be empty (a marker just written, its end right under it); `\n?` allows that.
      const pattern = new RegExp(`${escape(open)}\\n([\\s\\S]*?)\\n?${escape(END_MARKER)}`);
      const match = text.match(pattern);
      if (!match) {
        problem(`${file} has no generated block for "${open}"`);
        continue;
      }
      if (match[1] !== rendered) {
        if (write) text = text.replace(pattern, `${open}\n${rendered}\n${END_MARKER}`);
        else
          problem(
            `${file}: the block "${open}" differs from what the contract renders; run the conventions check with --write`,
          );
      }
    }
    if (write) writeFileSync(join(root, file), text);
  }

  const strategicView = multi && domainMap ? renderDomain(domainMap, links, loadStrategicConcepts(root)) : undefined;
  for (const { file, blocks } of renderedDocuments(contracts, strategicView)) renderInto(file, blocks);

  // 9. The event storm the documents show is the one read from the code

  const stormDocument = 'docs/event-storm.md';
  const stormBoard = 'docs/event-storm.svg';
  const storm = readsTree && existsSync(join(root, stormDocument)) ? inspectEventStorm(contract, root) : undefined;
  if (storm) {
    renderInto(stormDocument, [[STORM_MARKER, renderEventStorm(storm)]]);
    const board = renderEventStormSvg(storm);
    const current = existsSync(join(root, stormBoard)) ? readFileSync(join(root, stormBoard), 'utf8') : '';
    if (current !== board) {
      if (write) writeFileSync(join(root, stormBoard), board);
      else problem(`${stormBoard} differs from the board the code renders; run the conventions check with --write`);
    }
  }

  // 10. One handler per command: the wiring lists each command once, and answers every command a route or a policy builds

  if (readsTree) {
    for (const wrong of oneHandlerProblems(storm ?? inspectEventStorm(contract, root))) problem(wrong);
  }

  // 11. One application: this language's inventory is current, and every committed inventory says the same

  const inventories = multi && readsTree ? loadInventories(root) : new Map();
  if (multi && readsTree) {
    const inventory = inspectInventory(contract, root);
    const inventoryFile = posix.join(INVENTORY_DIR, `${contract.language.id}.json`);
    const rendered = serializeInventory(inventory);
    const committed = existsSync(join(root, inventoryFile)) ? readFileSync(join(root, inventoryFile), 'utf8') : '';
    if (committed !== rendered) {
      if (write) {
        mkdirSync(join(root, INVENTORY_DIR), { recursive: true });
        writeFileSync(join(root, inventoryFile), rendered);
      } else {
        problem(
          `ARCH-ONE-APPLICATION: ${inventoryFile} differs from what the ${contract.language.name} tree says; run the conventions check with --write`,
        );
        const before = JSON.parse(committed || '{"contexts":[],"links":[]}') as Inventory;
        for (const change of inventoryChanges(before, inventory)) problem(`ARCH-ONE-APPLICATION: ${change}`);
      }
    }
    for (const [language, other] of inventories) {
      if (language === contract.language.id) continue;
      for (const difference of compareInventories(inventory, other)) problem(`ARCH-ONE-APPLICATION: ${difference}`);
    }
  }

  // 12. Every expected storm is legal, and the code carries it or not as it says

  const stormsDir = join(root, STORMS_DIR);
  if (readsTree && existsSync(stormsDir)) {
    const actualInventory = inspectInventory(contract, root);
    for (const entry of readdirSync(stormsDir).filter(name => name.endsWith('.yaml'))) {
      const file = `${STORMS_DIR}/${entry}`;
      try {
        const expected = loadExpectedStorm(file, root);
        for (const wrong of validateExpectedStorm(expected, contract, actualInventory, root)) problem(wrong);
        for (const wrong of checkExpectedStorm(expected, actualInventory)) problem(wrong);
      } catch (error) {
        problem(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // 13. A migrated application answers on the wire its binding says (ADR 36)

  if (contract.migration) {
    const inventoryForMigration = readsTree ? inspectInventory(contract, root) : committedInventory();
    if (inventoryForMigration) problems.push(...checkMigrationAgainstInventory(contract, inventoryForMigration));
  }
  if (readsTree) problems.push(...waitsOutsideTransport(contract, root));

  // 14. The published language: sound against the map, and carried by every inventory, field for field

  let publishedLanguage;
  try {
    publishedLanguage = loadPublishedLanguage(root);
  } catch (error) {
    problem(`CTX-PUBLISHED-LANGUAGE: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (publishedLanguage) {
    problems.push(
      ...validatePublishedLanguage(
        publishedLanguage,
        domainMap ? domainMap.contexts.map(context => context.id) : contract.contexts,
      ),
    );
    // This language's inventory as its tree says it, or as its own tool committed it; then every other one.
    const held: Inventory[] = [];
    const own = readsTree ? inspectInventory(contract, root) : committedInventory();
    if (own) held.push(own);
    if (readsTree) for (const [language, other] of inventories) if (language !== contract.language.id) held.push(other);
    for (const inventory of held)
      problems.push(...checkInventoryAgainstPublishedLanguage(publishedLanguage, inventory));
  }

  // 16. The rule register: sound against the map and the history, and, in the TypeScript tree, held to its evidence

  let ruleRegister;
  try {
    ruleRegister = loadRuleRegister(root);
  } catch (error) {
    problem(`${RULE_NAMED}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (ruleRegister) {
    problems.push(
      ...validateRuleRegister(
        ruleRegister,
        domainMap ? domainMap.contexts.map(context => context.id) : contract.contexts,
        root,
      ),
    );
    if (readsTree) problems.push(...checkRuleRegister(ruleRegister, inspectRuleEvidence(contract, root)));
  }

  // 4. Every relative link in the documentation resolves

  const linksIn = (text: string) =>
    [...text.matchAll(/\]\(([^)\s]+)\)/g)].map(match => match[1]).filter(link => !/^[a-z]+:/.test(link));
  const walk = (dir: string, ext: string): string[] =>
    existsSync(join(root, dir))
      ? readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry =>
          entry.isDirectory()
            ? entry.name === 'node_modules'
              ? []
              : walk(`${dir}/${entry.name}`, ext)
            : entry.name.endsWith(ext)
              ? [`${dir}/${entry.name}`]
              : [],
        )
      : [];
  // `.claude` is documentation too: a skill or an agent definition that points at a file which
  // is not there sends an agent looking for it.
  const docs = new Set([
    'README.md',
    'CLAUDE.md',
    // The tooling's own README, where the repository holds the tooling (an application `create` made does not).
    ...(existsSync(join(root, 'tools/README.md')) ? ['tools/README.md'] : []),
    ...walk('conventions', '.md'),
    ...walk('docs', '.md'),
    ...walk('.claude', '.md'),
    ...contracts.flatMap(each => [
      posix.join(each.language.root, 'README.md'),
      posix.join(each.language.root, 'CLAUDE.md'),
      ...walk(posix.join(each.language.root, 'src'), '.md'),
    ]),
  ]);
  for (const file of docs) {
    if (!existsSync(join(root, file))) {
      problem(`ARCH-MAP-IS-REAL: ${file} does not exist`);
      continue;
    }
    const base = dirname(join(root, file));
    for (const link of linksIn(readFileSync(join(root, file), 'utf8'))) {
      const [path] = link.split('#');
      if (path && !existsSync(resolve(base, path)))
        problem(`ARCH-MAP-IS-REAL: ${file} links to ${path}, which does not exist`);
    }
  }

  if (readsTree) {
    // 5. No eslint-disable, except the console logger's

    const allowedDisables: Record<string, string> = {
      [posix.join(contract.architecture.path, 'Infrastructure/Logging/ConsoleLogger.ts')]: 'no-console',
    };
    for (const file of walk(posix.join(at, 'src'), '.ts')) {
      for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
        const disable = line.match(/eslint-disable(?:-next-line|-line)?\s*([\w@/-]*)/);
        if (!disable || allowedDisables[file] === disable[1]) continue;
        problem(
          `ARCH-MAP-IS-REAL: ${file} silences ESLint with "${disable[0].trim()}"; fix the cause (a port, a move) instead`,
        );
      }
    }
  }

  // 6. Every feature plan is legal, against the binding it is written for

  const plansDir = join(root, 'conventions/plans');
  // The features whose storm is not done yet: their plans are in progress, whichever of their own
  // parts are written — a slice writes all of its plan and only part of the feature (ADR 29).
  const featuresInProgress = new Set<string>();
  if (existsSync(stormsDir)) {
    for (const entry of readdirSync(stormsDir).filter(name => name.endsWith('.yaml'))) {
      try {
        const storm = loadExpectedStorm(`${STORMS_DIR}/${entry}`, root);
        if (!storm.done) featuresInProgress.add(storm.feature);
      } catch {
        // reported with the storms
      }
    }
  }
  if (existsSync(plansDir)) {
    for (const entry of readdirSync(plansDir).filter(name => name.endsWith('.yaml'))) {
      const file = `conventions/plans/${entry}`;
      try {
        const plan = loadFeaturePlan(file, root);
        const bound = contracts.find(each => each.language.id === (plan.language ?? contract.language.id));
        if (!bound) {
          problem(`${file}: is written for ${plan.language}, which is not one of ${contract.languages.join(', ')}`);
          continue;
        }
        for (const wrong of validatePlan(
          plan,
          bound,
          root,
          featuresInProgress.has(plan.feature) ? 'in-progress' : 'held',
        ))
          problem(`${file}: ${wrong}`);
        explainPlan(plan, bound); // it must expand without throwing
      } catch (error) {
        problem(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // 15. The API as data composes (ADR 45): what the end-to-end client holds every answer to

  const apiAt = join(root, at);
  const hasApi = existsSync(join(apiAt, API_DIR));
  for (const wrong of applicationApiProblems(apiAt))
    problem(`API-ONE-SURFACE: ${at === '.' || !wrong.startsWith(API_DIR) ? wrong : `${at}/${wrong}`}`);

  // 7. The generated import rules refuse and allow what the table says

  const probes = readsTree ? generateProbes(contract) : [];
  if (readsTree) {
    const verdicts = await canImportAll(
      probes.map(probe => [probe.file, probe.specifier] as [string, string]),
      contract,
      root,
    );
    probes.forEach((probe, index) => {
      const verdict = verdicts[index];
      const actual = verdict.allowed ? 'allowed' : 'refused';
      if (actual !== probe.expected) {
        problem(`${probe.rule}: ${probe.file} importing '${probe.specifier}' is ${actual}, expected ${probe.expected}`);
      }
      if (!verdict.allowed && !verdict.rule) {
        problem(`${probe.rule}: the refusal of '${probe.specifier}' from ${probe.file} names no rule id`);
      }
    });
  }

  // Verdict

  return {
    problems,
    summary: `✓ contract v${contract.schemaVersion}, ${contract.language.name} binding: ${contract.rules.length} rules, ${contract.concepts.length} concepts, ${contract.contexts.length} contexts${readsTree ? ' match the tree' : ''}; ${contracts.length} language(s) in the map; the documents are rendered from it; every documentation link resolves; ${readsTree ? `no eslint-disable; ${probes.length} import probes behave and name their rule` : `the tree is held by ${contract.language.name}'s own tool`}${domainMap ? `; the context map is true to the code (${links.length} links)` : ''}${storm ? `; the event storm is read from the code (${storm.contexts.reduce((sum, each) => sum + each.commands.length, 0)} commands, ${storm.contexts.reduce((sum, each) => sum + each.policies.length, 0)} policies)` : ''}${multi ? `; one application in ${inventories.size} inventor${inventories.size === 1 ? 'y' : 'ies'}` : ''}${contract.profiles.length ? `; ${contract.profiles.length} profile(s) held to the floor (${contract.contexts.filter(context => profileOf(contract, context) !== contract.profiles.find(profile => profile.default)?.id).length} context(s) off the default)` : ''}${contract.migration ? `; the wire is ${contract.migration.api} (${contract.migration.routes.length} compatibility route(s))` : ''}${publishedLanguage ? `; ${publishedLanguage.events.length} integration event(s) in the published language` : ''}${ruleRegister ? `; ${ruleRegister.rules.length} rule(s) named${readsTree ? ', each with its refusal and a test' : `, held by review in ${contract.language.name}`}` : ''}${hasApi ? '; api/ composes' : ''}.`,
  };
}

const LAYERS = ['domain', 'application', 'infrastructure', 'presentation'] as const;

/**
 * What the documents show between their markers, rendered from the contracts (step 3 of the check):
 * every language's README, the repository's CLAUDE.md, and, when the repository holds more than the
 * first contract's language, the root README's strategic view (`strategicView`, rendered from the map),
 * its map across languages and its rules. The first contract is the language the check is run for.
 * Pure: the same contracts give the same bytes, which is what holds Full's documents unchanged by the
 * profiles (ADR 40, P5).
 */
export function renderedDocuments(
  contracts: ArchitectureContract[],
  strategicView?: string,
): { file: string; blocks: [string, string][] }[] {
  const [contract] = contracts;
  /** A section with nothing in it yet (a new application has no vocabulary) needs no block. */
  const nonEmpty = (blocks: [string, string, boolean][]): [string, string][] =>
    blocks.filter(([, , has]) => has).map(([marker, rendered]) => [marker, rendered]);
  const documents: { file: string; blocks: [string, string][] }[] = [];

  // Every language's README is rendered from its own contract, with links relative to its
  // directory; a language renders its documents here rather than in its own tooling because the
  // renderer reads data, and a second renderer would be a second thing to drift.
  for (const each of contracts) {
    const layerHas = (layer: (typeof LAYERS)[number]) =>
      each.concepts.some(concept => concept.layer === layer && concept.canonical.length > 0);
    const there = each.language.root;
    documents.push({
      file: posix.join(there, 'README.md'),
      blocks: nonEmpty([
        ...LAYERS.map((layer): [string, string, boolean] => [
          SECTION_MARKER(layer),
          renderConceptLayer(each, layer, there),
          layerHas(layer),
        ]),
        [SECTION_MARKER('tests'), renderTests(each, there), each.tests.length > 0],
        // The words are the contract's; a language whose binding shows none of them yet has no table to render.
        [SECTION_MARKER('vocabulary'), renderVocabulary(each, there), each.vocabulary.some(row => row.see)],
        [RULES_MARKER('rules'), renderRulesTable(each, there), true],
        [RULES_MARKER('dependencies'), renderDependencyTable(each), each.contexts.length > 0],
      ]),
    });
  }
  documents.push({ file: 'CLAUDE.md', blocks: [[RULES_MARKER('rules'), renderRulesList(contract)]] });
  if (contract.language.root !== '.') {
    const title = (layer: string) => `${layer[0].toUpperCase()}${layer.slice(1)} layer`;
    documents.push({
      file: 'README.md',
      blocks: [
        ...(strategicView !== undefined ? [[DOMAIN_MARKER, strategicView] as [string, string]] : []),
        [SECTION_MARKER('languages'), renderLanguages(contracts)],
        [
          SECTION_MARKER('map'),
          LAYERS.map(layer => `#### ${title(layer)}\n\n${renderConceptMatrix(contracts, layer)}`).join('\n\n'),
        ],
        [RULES_MARKER('rules'), renderRulesTable(contract, '.', false)],
      ],
    });
  }
  return documents;
}
