//! `cargo run -p conventions -- inventory`: the inventory of the Rust tree, in the words every
//! language shares (`docs/inventory/<language>.json`): the commands of each context with who may
//! call them, their route, the aggregate they reach and the events it records; the queries; the
//! domain events; the policies, what they react to and what they publish or reach; the links
//! between contexts. Nothing Rust owns is in it — no file, no type name, no idiom — so the
//! TypeScript check can hold every language's inventory equal (ARCH-ONE-APPLICATION).
//!
//! It reads the canonical shapes the guides teach, and nothing looser: a wiring crate that lists
//! its commands, queries and reactions as data (ARCH-MODULES-DATA); an aggregate holding an
//! `AggregateRoot` whose behaviours `record()` their events (DOMAIN-RECORDS-EVENTS), named by
//! the `name()` arm of the event enum; a handler that asks `require_signed_in()` or guards on a
//! role, calls a behaviour directly or through a service, and publishes an integration event of
//! the shared kernel; a presentation crate whose `.route()` names the function that `accept()`s
//! the command or asks `module.query::<…>()`, mounted where the bootstrap `.nest()`s it. A shape
//! this reader does not recognise is a shape the guides do not teach: the remedy is the canonical
//! shape, not a looser reading.
//!
//! A reader never names what it did not resolve. A name is a command only when it resolves to a
//! command type of the context (a type that `impl CommandEvent`, or that a handler's `type Command`
//! names), through a `use … as` renaming of its own file or a `pub use … as` re-export of the
//! context's application crate; a wiring entry is read as a command only when its handler is a type
//! of the context that `impl CommandHandler`. What does not resolve is not counted, and the hole it
//! leaves is caught where it shows: a route lost, a command no handler answers.
//!
//! The same reading holds ARCH-ONE-HANDLER (`check_handlers`): a command the Module lists once,
//! with one handler, and every command a route or a policy builds is one the Module lists.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_yaml::Value as Yaml;

/// Where the inventory is committed, relative to the repository root.
pub const INVENTORY_FILE: &str = "docs/inventory/rust.json";
/// What writes it.
pub const WRITE_COMMAND: &str = "cargo run -p conventions -- inventory --write";
const SCHEMA_VERSION: u64 = 1;
const ONE_HANDLER_RULE: &str = "ARCH-ONE-HANDLER";

const SIGNED_IN: &str = "a signed-in account";
const ADMINISTRATOR: &str = "an administrator";
const ANYONE: &str = "anyone";

// The inventory, in the canonical key order; `serde_json::to_string_pretty` renders the canonical bytes.

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    schema_version: u64,
    language: String,
    contexts: Vec<Context>,
    links: Vec<Link>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Context {
    id: String,
    commands: Vec<Command>,
    queries: Vec<Query>,
    events: Vec<String>,
    policies: Vec<Policy>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Command {
    name: String,
    actor: String,
    /// `VERB /path`, every path parameter spelled `{param}`; absent when no route carries the command.
    #[serde(skip_serializing_if = "Option::is_none")]
    route: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    aggregate: Option<String>,
    events: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Query {
    name: String,
    actor: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    route: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Policy {
    on: String,
    kind: String,
    publishes: Vec<String>,
    events: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Link {
    mechanism: String,
    upstream: String,
    downstream: String,
    contracts: Vec<String>,
}

/// Canonical JSON: two-space indentation, the keys in the order above, a trailing newline.
pub fn render(inventory: &Inventory) -> String {
    let json = serde_json::to_string_pretty(inventory).expect("the inventory is plain data");
    format!("{json}\n")
}

/// The committed inventory is what the tree renders now (ARCH-ONE-APPLICATION). When it is not, the
/// line that says so comes first, then one line per difference (`changes`), so a stale inventory is
/// a list of named differences, not a file to diff by hand.
pub fn check(repository_root: &Path, tree: &Inventory, problems: &mut Vec<String>) {
    let rendered = render(tree);
    match fs::read_to_string(repository_root.join(INVENTORY_FILE)) {
        Ok(committed) if committed == rendered => {}
        Ok(committed) => {
            problems.push(format!(
                "ARCH-ONE-APPLICATION: {INVENTORY_FILE} differs from what the Rust tree says; run `{WRITE_COMMAND}`"
            ));
            if let Ok(committed) = serde_json::from_str::<Inventory>(&committed) {
                problems
                    .extend(changes(&committed, tree).into_iter().map(|line| format!("ARCH-ONE-APPLICATION: {line}")));
            }
        }
        Err(_) => problems.push(format!("ARCH-ONE-APPLICATION: {INVENTORY_FILE} is missing; run `{WRITE_COMMAND}`")),
    }
}

/// What changed between the committed inventory and the one the tree renders now, one line per
/// difference, in the words every language's check prints: what the committed inventory has and the
/// tree no longer says, what the tree says and the committed one does not, and what both say with
/// other fields, before → after. Contexts in the committed order, then the new ones; inside a
/// context the commands, the queries, the domain events, the policies; then the links.
pub fn changes(committed: &Inventory, tree: &Inventory) -> Vec<String> {
    let mut lines = Vec::new();
    for context in &committed.contexts {
        let id = context.id.as_str();
        let Some(twin) = tree.contexts.iter().find(|candidate| candidate.id == context.id) else {
            lines.push(format!("{id}: the committed inventory has the context, the tree no longer says it"));
            continue;
        };
        compare(
            &mut lines,
            id,
            "command",
            &context.commands,
            &twin.commands,
            |command| command.name.clone(),
            |command| {
                vec![
                    ("actor", quoted(Some(&command.actor))),
                    ("route", quoted(command.route.as_deref())),
                    ("aggregate", quoted(command.aggregate.as_deref())),
                    ("events", list(&command.events)),
                ]
            },
        );
        compare(
            &mut lines,
            id,
            "query",
            &context.queries,
            &twin.queries,
            |query| query.name.clone(),
            |query| vec![("actor", quoted(Some(&query.actor))), ("route", quoted(query.route.as_deref()))],
        );
        compare(&mut lines, id, "domain event", &context.events, &twin.events, String::clone, |_| Vec::new());
        // A policy is known by what it reacts to; by its kind as well when two of one side share an `on`.
        let shared = |policies: &[Policy]| -> BTreeSet<String> {
            let ons: Vec<&String> = policies.iter().map(|policy| &policy.on).collect();
            ons.iter().filter(|on| ons.iter().filter(|other| other == on).count() > 1).map(|on| (*on).clone()).collect()
        };
        let shared: BTreeSet<String> = shared(&context.policies).union(&shared(&twin.policies)).cloned().collect();
        let policy_key = |policy: &Policy| {
            if shared.contains(&policy.on) {
                format!("on {} ({})", policy.on, policy.kind)
            } else {
                format!("on {}", policy.on)
            }
        };
        compare(&mut lines, id, "policy", &context.policies, &twin.policies, policy_key, |policy| {
            vec![
                ("kind", quoted(Some(&policy.kind))),
                ("publishes", list(&policy.publishes)),
                ("events", list(&policy.events)),
            ]
        });
    }
    for context in tree.contexts.iter().filter(|context| !committed.contexts.iter().any(|other| other.id == context.id))
    {
        lines.push(format!("{}: the tree says the context, the committed inventory does not", context.id));
    }
    let link_key = |link: &Link| format!("{} → {} ({})", link.upstream, link.downstream, link.mechanism);
    compare(&mut lines, "context map", "link", &committed.links, &tree.links, link_key, |link| {
        vec![("contracts", list(&link.contracts))]
    });
    lines
}

/// One kind of a scope, compared by key: lost, changed field by field (before → after), gained.
fn compare<T>(
    lines: &mut Vec<String>,
    scope: &str,
    kind: &str,
    before: &[T],
    after: &[T],
    key: impl Fn(&T) -> String,
    fields: impl Fn(&T) -> Vec<(&'static str, String)>,
) {
    for item in before {
        let Some(twin) = after.iter().find(|candidate| key(candidate) == key(item)) else {
            lines.push(format!(
                "{scope}: the committed inventory has the {kind} {}, the tree no longer says it",
                key(item)
            ));
            continue;
        };
        let changed: Vec<String> = fields(item)
            .into_iter()
            .zip(fields(twin))
            .filter(|((_, was), (_, is))| was != is)
            .map(|((name, was), (_, is))| format!("{name} {was} → {is}"))
            .collect();
        if !changed.is_empty() {
            lines.push(format!("{scope}: the {kind} {} differs: {}", key(item), changed.join("; ")));
        }
    }
    for item in after.iter().filter(|item| !before.iter().any(|other| key(other) == key(item))) {
        lines.push(format!("{scope}: the tree says the {kind} {}, the committed inventory does not", key(item)));
    }
}

/// A string as the lines spell it: quoted, or `none` when absent.
fn quoted(value: Option<&str>) -> String {
    value.map_or_else(|| "none".to_string(), |value| format!("\"{value}\""))
}

/// A list as the lines spell it: `[A, B]`, `[]` when empty.
fn list(values: &[String]) -> String {
    format!("[{}]", values.join(", "))
}

// ---------------------------------------------------------------------------------------------
// Reading the tree

/// One source file, its tests stripped: a test builds aggregates and publishes at will.
struct SourceFile {
    path: String,
    text: String,
}

fn read_sources(dir: &Path, into: &mut Vec<SourceFile>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut paths: Vec<_> = entries.flatten().map(|entry| entry.path()).collect();
    paths.sort();
    for path in paths {
        if path.is_dir() {
            if path.file_name().is_some_and(|name| name != "target") {
                read_sources(&path, into);
            }
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            let text = fs::read_to_string(&path).unwrap_or_default();
            let text = text.split("#[cfg(test)]").next().unwrap_or_default().to_string();
            into.push(SourceFile { path: path.to_string_lossy().replace('\\', "/"), text });
        }
    }
}

fn is_ident(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// The identifier at `at`, after any whitespace, and where it ends.
fn ident_at(text: &str, at: usize) -> Option<(&str, usize)> {
    let start = at + text[at..].len() - text[at..].trim_start().len();
    let end = start + text[start..].find(|c: char| !is_ident(c)).unwrap_or(text.len() - start);
    (end > start).then(|| (&text[start..end], end))
}

/// A `::`-joined path at `at` (`NoteEvent::Shared`), as its segments, and where it ends.
fn path_at(text: &str, at: usize) -> Option<(Vec<&str>, usize)> {
    let (first, mut end) = ident_at(text, at)?;
    let mut segments = vec![first];
    while let Some(rest) = text[end..].strip_prefix("::") {
        match ident_at(rest, 0) {
            Some((segment, length)) if rest.starts_with(segment) => {
                segments.push(segment);
                end += 2 + length;
            }
            _ => break,
        }
    }
    Some((segments, end))
}

/// Every position right after a `needle` that starts on a word boundary.
fn after_each<'a>(text: &'a str, needle: &'a str) -> impl Iterator<Item = usize> + 'a {
    text.match_indices(needle).filter(|(at, _)| !text[..*at].ends_with(is_ident)).map(move |(at, _)| at + needle.len())
}

fn contains_word(text: &str, needle: &str) -> bool {
    text.match_indices(needle)
        .any(|(at, _)| !text[..at].ends_with(is_ident) && !text[at + needle.len()..].starts_with(is_ident))
}

/// The text between a bracket at `open` and its match.
fn balanced(text: &str, open: usize, opening: char, closing: char) -> &str {
    let mut depth = 0;
    for (at, c) in text[open..].char_indices() {
        if c == opening {
            depth += 1;
        } else if c == closing {
            depth -= 1;
            if depth == 0 {
                return &text[open + 1..open + at];
            }
        }
    }
    &text[open + 1..]
}

/// The text between the brackets that follow `key: vec![` in a wiring file.
fn section<'a>(text: &'a str, key: &str) -> &'a str {
    let Some(at) = text.find(&format!("{key}: vec![")) else { return "" };
    let open = at + key.len() + ": vec!".len();
    balanced(text, open, '[', ']')
}

/// The handlers a wiring lists under `commands`, one per `Subscription::command(handler)`, in order,
/// as the paths written there (`ShareNoteCommandHandler::new`), not yet resolved.
fn command_handlers(wiring_text: &str) -> Vec<Vec<&str>> {
    let listed = section(wiring_text, "commands");
    after_each(listed, "Subscription::command(").filter_map(|at| path_at(listed, at)).map(|(path, _)| path).collect()
}

/// The reactions a wiring lists under `key` (`domain_events`, `integration_events`): each
/// `Subscription::reaction(channel, handler)` as the channel's expression and the handler's type.
fn reactions<'a>(wiring_text: &'a str, key: &str) -> Vec<(&'a str, &'a str)> {
    let listed = section(wiring_text, key);
    after_each(listed, "Subscription::reaction(")
        .filter_map(|at| {
            let (channel, handler) = balanced(listed, at - 1, '(', ')').split_once(',')?;
            Some((channel, ident_at(handler, 0)?.0))
        })
        .collect()
}

/// The paths each `publish(…)` of a text is handed, directly (`publish(NoteIntegrationEvent::Shared { … })`)
/// and through a local binding (`let notice = OperationCompleteIntegrationEvent { … }; … publish(Arc::new(notice), …)`).
fn published_paths(text: &str) -> Vec<Vec<&str>> {
    let mut paths = Vec::new();
    for at in after_each(text, "publish(") {
        let at = at + text[at..].len() - text[at..].trim_start().len();
        let at = text[at..].strip_prefix("Arc::new(").map_or(at, |_| at + "Arc::new(".len());
        let Some((segments, _)) = path_at(text, at) else { continue };
        let binding = format!("let {} = ", segments[0]);
        if let Some(at) = text.find(&binding)
            && let Some((bound, _)) = path_at(text, at + binding.len())
        {
            paths.push(bound);
        }
        paths.push(segments);
    }
    paths
}

/// The top-level items that are `}` on their own line: the end of a struct, an impl, a function.
fn item_ends(text: &str) -> impl Iterator<Item = usize> + '_ {
    text.match_indices("\n}\n").map(|(at, _)| at + 1)
}

/// `impl` blocks: `(trait, type, body)`, the trait empty for an inherent impl. Generics are skipped.
fn impl_blocks(text: &str) -> Vec<(String, String, &str)> {
    let mut blocks = Vec::new();
    for (line_at, line) in text.match_indices("\nimpl").map(|(at, _)| (at + 1, &text[at + 1..])) {
        let header = line.split('{').next().unwrap_or_default();
        let header = if header.starts_with("impl<") { balanced_rest(header) } else { &header[4..] };
        let (implemented, type_name) = match header.find(" for ") {
            Some(at) => (header[..at].trim(), &header[at + 5..]),
            None => ("", header.trim_start()),
        };
        let Some((type_name, _)) = ident_at(type_name, 0) else { continue };
        let end = item_ends(text).find(|end| *end > line_at).unwrap_or(text.len());
        blocks.push((implemented.trim().to_string(), type_name.to_string(), &text[line_at..end]));
    }
    blocks
}

/// The header after its generics: `impl<R: X> Foo<R>` → ` Foo<R>`.
fn balanced_rest(header: &str) -> &str {
    let open = header.find('<').unwrap_or(0);
    let generics = balanced(header, open, '<', '>');
    &header[open + generics.len() + 2..]
}

/// The methods of an impl block, by the four-space indentation rustfmt gives them: name and body up to the next one.
fn methods(block: &str) -> Vec<(String, &str)> {
    let mut starts: Vec<(String, usize)> = Vec::new();
    for (at, _) in block.match_indices("\n    ") {
        let line = &block[at + 5..];
        if line.starts_with(' ') {
            continue;
        }
        let mut rest = line;
        loop {
            let before = rest;
            for modifier in ["pub(crate) ", "pub(super) ", "pub ", "async ", "const ", "unsafe "] {
                rest = rest.strip_prefix(modifier).unwrap_or(rest);
            }
            if rest == before {
                break;
            }
        }
        if let Some(signature) = rest.strip_prefix("fn ")
            && let Some((name, _)) = ident_at(signature, 0)
        {
            starts.push((name.to_string(), at));
        }
    }
    starts
        .iter()
        .enumerate()
        .map(|(index, (name, at))| {
            let end = starts.get(index + 1).map_or(block.len(), |(_, next)| *next);
            (name.clone(), &block[*at..end])
        })
        .collect()
}

fn file_declaring<'a>(files: &'a [SourceFile], type_name: &str) -> Option<&'a SourceFile> {
    files.iter().find(|file| {
        after_each(&file.text, "pub struct ")
            .any(|at| ident_at(&file.text, at).is_some_and(|(name, _)| name == type_name))
    })
}

/// The renamings the `use … as …;` statements of a text make, `alias → name` (`use …::ShareNote as
/// Share;` gives `Share → ShareNote`), grouped imports included; with `public`, only the `pub use`
/// re-exports. A statement starts a line.
fn use_aliases(text: &str, public: bool) -> BTreeMap<String, String> {
    let mut aliases = BTreeMap::new();
    let mut at = 0;
    for line in text.split_inclusive('\n') {
        let start = at;
        at += line.len();
        let trimmed = line.trim_start();
        let rest = if public {
            trimmed.strip_prefix("pub use ")
        } else {
            ["use ", "pub use ", "pub(crate) use "].iter().find_map(|prefix| trimmed.strip_prefix(prefix))
        };
        let Some(rest) = rest else { continue };
        let from = start + line.len() - rest.len();
        let statement = text[from..].split(';').next().unwrap_or_default();
        for (at, _) in statement.match_indices(" as ") {
            let before = statement[..at].trim_end();
            let name = &before[before.rfind(|c: char| !is_ident(c)).map_or(0, |at| at + 1)..];
            if let Some((alias, _)) = ident_at(statement, at + " as ".len())
                && !name.is_empty()
                && alias != "_"
            {
                aliases.insert(alias.to_string(), name.to_string());
            }
        }
    }
    aliases
}

/// The public name of a message: its intent or its fact, without the suffix of its kind (API-ONE-SURFACE).
fn public_name(name: &str) -> &str {
    ["CommandEvent", "IntegrationEvent", "QueryHandler", "CommandHandler", "EventHandler", "Handler", "Event"]
        .iter()
        .find_map(|suffix| name.strip_suffix(suffix))
        .unwrap_or(name)
}

/// A route as every language spells it: the verb, the path, each parameter as `{param}`.
fn canonical_route(verb: &str, path: &str) -> String {
    let mut out = String::new();
    let mut rest = path;
    while let Some(open) = rest.find('{') {
        out.push_str(&rest[..open]);
        out.push_str("{param}");
        rest = rest[open..].split_once('}').map_or("", |(_, after)| after);
    }
    out.push_str(rest);
    let path = out.trim_end_matches('/');
    format!("{} {}", verb.to_uppercase(), if path.is_empty() { "/" } else { path })
}

/// Who may call: `require_signed_in()` says a signed-in account (an administrator may see more,
/// the handler says so itself); a `guard()` that admits the administrator role alone says an
/// administrator; a guard on any other role says a signed-in account; nothing says anyone.
fn actor_of(text: &str) -> &'static str {
    if text.contains("require_signed_in(") {
        SIGNED_IN
    } else if text.contains("fn guard(") && text.contains("Role::Admin") && !text.contains("Role::User") {
        ADMINISTRATOR
    } else if text.contains("fn guard(") && text.contains("Role::") {
        SIGNED_IN
    } else {
        ANYONE
    }
}

/// The `const NAME: &'static str = "…";` constants of a text, by name.
fn constants(text: &str) -> BTreeMap<String, String> {
    after_each(text, "const ")
        .filter_map(|at| {
            let (name, end) = ident_at(text, at)?;
            let rest = text[end..].strip_prefix(": &'static str = \"")?;
            Some((name.to_string(), rest.split('"').next()?.to_string()))
        })
        .collect()
}

/// The `name()` arms of an event enum: `(Enum, Variant) → "Name"`, a literal or `Self::CONST`.
fn event_arms(text: &str, into: &mut BTreeMap<(String, String), String>) {
    let consts = constants(text);
    for line in text.lines() {
        let Some((pattern, name)) = line.split_once("=>") else { continue };
        let Some(pattern) = pattern.trim().strip_suffix("{ .. }") else { continue };
        let Some((enum_name, variant)) = pattern.trim().split_once("::") else { continue };
        let name = name.trim().trim_end_matches(',');
        let resolved = if let Some(literal) = name.strip_prefix('"') {
            literal.trim_end_matches('"').to_string()
        } else if let Some(constant) = name.strip_prefix("Self::").and_then(|key| consts.get(key)) {
            constant.clone()
        } else {
            continue;
        };
        into.insert((enum_name.to_string(), variant.to_string()), public_name(&resolved).to_string());
    }
}

/// The integration events of the shared kernel: by `(Type, Variant)` (the variant empty for a
/// struct event), and by `(Type, CONST)` as a wiring names them.
struct IntegrationEvents {
    by_variant: BTreeMap<(String, String), String>,
    by_constant: BTreeMap<(String, String), String>,
}

fn integration_events(files: &[SourceFile]) -> IntegrationEvents {
    let mut found = IntegrationEvents { by_variant: BTreeMap::new(), by_constant: BTreeMap::new() };
    for file in files {
        event_arms(&file.text, &mut found.by_variant);
        for (implemented, type_name, body) in impl_blocks(&file.text) {
            if implemented.is_empty() {
                for (constant, value) in constants(body) {
                    found.by_constant.insert((type_name.clone(), constant), public_name(&value).to_string());
                }
            } else if implemented == "Event"
                && body.contains("Self::NAME")
                && let Some(value) = found.by_constant.get(&(type_name.clone(), "NAME".to_string()))
            {
                found.by_variant.insert((type_name.clone(), String::new()), value.clone());
            }
        }
    }
    found
}

impl IntegrationEvents {
    /// The public name of the integration event a path names (`AccountIntegrationEvent::Created`,
    /// `OperationCompleteIntegrationEvent`), or nothing when the path is not one.
    fn named_by(&self, segments: &[&str]) -> Option<String> {
        let type_name = (*segments.first()?).to_string();
        let variant = segments.get(1).copied().unwrap_or_default().to_string();
        self.by_variant.get(&(type_name, variant)).cloned()
    }

    /// The channel a wiring subscribes on: a literal, or a constant of a contract (`AccountIntegrationEvent::CREATED`).
    fn channel(&self, expression: &str) -> String {
        let expression = expression.trim();
        if let Some(literal) = expression.strip_prefix('"') {
            return public_name(literal.trim_end_matches('"')).to_string();
        }
        let (segments, _) = path_at(expression, 0).unwrap_or_default();
        match segments.as_slice() {
            [type_name, constant] => self.by_constant.get(&((*type_name).to_string(), (*constant).to_string())),
            _ => None,
        }
        .cloned()
        .unwrap_or_else(|| public_name(expression).to_string())
    }

    /// What a text publishes: the integration event each `publish(…)` is handed, directly
    /// (`publish(NoteIntegrationEvent::Shared { … })`) or through a local binding
    /// (`let notice = OperationCompleteIntegrationEvent { … }; … publish(Arc::new(notice), …)`).
    fn published_by(&self, text: &str) -> Vec<String> {
        let mut names = Vec::new();
        for name in published_paths(text).iter().filter_map(|segments| self.named_by(segments)) {
            if !names.contains(&name) {
                names.push(name);
            }
        }
        names
    }
}

/// An aggregate and its behaviours: the public methods that record an event, and what they record.
struct Aggregate {
    name: String,
    behaviours: Vec<(String, Vec<String>)>,
}

/// The aggregates of a context: a struct holding an `AggregateRoot`, in the domain crate. A
/// behaviour's events are what it `record()`s, and what the behaviours it delegates to record
/// (`authenticate()` is `authenticate_at(now)` with the default).
fn aggregates(files: &[SourceFile], arms: &BTreeMap<(String, String), String>) -> Vec<Aggregate> {
    let mut found = Vec::new();
    for file in files.iter().filter(|file| file.text.contains("AggregateRoot<")) {
        let Some((name, _)) = after_each(&file.text, "pub struct ").find_map(|at| ident_at(&file.text, at)) else {
            continue;
        };
        let methods: BTreeMap<String, &str> = impl_blocks(&file.text)
            .into_iter()
            .filter(|(implemented, type_name, _)| implemented.is_empty() && type_name == name)
            .flat_map(|(_, _, body)| methods(body))
            .collect();
        let mut behaviours = Vec::new();
        for method in methods.keys().filter(|method| *method != "from_snapshot") {
            let mut events = Vec::new();
            events_of(method, &methods, arms, &mut Vec::new(), &mut events);
            if !events.is_empty() {
                behaviours.push((method.clone(), events));
            }
        }
        found.push(Aggregate { name: name.to_string(), behaviours });
    }
    found
}

fn events_of(
    method: &str,
    methods: &BTreeMap<String, &str>,
    arms: &BTreeMap<(String, String), String>,
    visited: &mut Vec<String>,
    into: &mut Vec<String>,
) {
    if visited.iter().any(|seen| seen == method) {
        return;
    }
    visited.push(method.to_string());
    let Some(body) = methods.get(method) else { return };
    for at in after_each(body, "record(") {
        if let Some((segments, _)) = path_at(body, at)
            && let [enum_name, variant] = segments.as_slice()
            && let Some(name) = arms.get(&((*enum_name).to_string(), (*variant).to_string()))
            && !into.contains(name)
        {
            into.push(name.clone());
        }
    }
    for at in after_each(body, "self.") {
        if let Some((callee, end)) = ident_at(body, at)
            && body[end..].starts_with('(')
            && methods.contains_key(callee)
        {
            events_of(callee, methods, arms, visited, into);
        }
    }
}

/// A method of a domain or application service that reaches a behaviour.
struct ServiceMethod {
    service: String,
    method: String,
    behaviours: Vec<(String, String)>,
}

/// What one context's code says, sticky by sticky.
struct ContextReader<'a> {
    files: &'a [SourceFile],
    aggregates: Vec<Aggregate>,
    services: Vec<ServiceMethod>,
    /// The route of each command or query, by the type the controller builds.
    routes: BTreeMap<String, String>,
    /// The `NAME` of each command, by its type.
    command_names: BTreeMap<String, String>,
    /// The handlers of the context: each type that `impl CommandHandler`, the command type its
    /// `type Command` names, and the text of the file that holds the impl.
    handlers: BTreeMap<String, (String, &'a str)>,
    /// The renamings the application crate re-exports (`pub use share_note::ShareNote as ShareRequest;`).
    re_exports: BTreeMap<String, String>,
}

impl<'a> ContextReader<'a> {
    fn new(files: &'a [SourceFile], arms: &BTreeMap<(String, String), String>, mount: &str) -> Self {
        let aggregates = aggregates(files, arms);
        let mut reader = Self {
            files,
            aggregates,
            services: Vec::new(),
            routes: BTreeMap::new(),
            command_names: BTreeMap::new(),
            handlers: BTreeMap::new(),
            re_exports: BTreeMap::new(),
        };
        reader.services = reader.find_services();
        reader.command_names = reader.find_command_names();
        reader.handlers = reader.find_handlers();
        reader.re_exports = files
            .iter()
            .filter(|file| file.path.contains("/application/"))
            .flat_map(|file| use_aliases(&file.text, true))
            .collect();
        reader.routes = reader.find_routes(mount);
        reader
    }

    /// Behaviours reached from a text: an aggregate's method called on an instance (`note.edit(`)
    /// or on the type (`Note::create(`), as `(Aggregate, behaviour)`.
    fn behaviours_of(&self, text: &str) -> Vec<(String, String)> {
        let mut found = Vec::new();
        for aggregate in &self.aggregates {
            for (behaviour, _) in &aggregate.behaviours {
                let on_instance =
                    text.match_indices(&format!(".{behaviour}(")).any(|(at, _)| text[..at].ends_with(is_ident));
                let on_type = text.contains(&format!("{}::{behaviour}(", aggregate.name));
                if on_instance || on_type {
                    found.push((aggregate.name.clone(), behaviour.clone()));
                }
            }
        }
        found
    }

    /// Services: any other type whose methods reach a behaviour (a domain service, an application
    /// service); not an aggregate, not a handler.
    fn find_services(&self) -> Vec<ServiceMethod> {
        let mut found = Vec::new();
        for file in self.files {
            let text = &file.text;
            if text.contains("AggregateRoot<")
                || ["CommandHandler for", "QueryHandler for", "EventHandler for"]
                    .iter()
                    .any(|shape| text.contains(shape))
            {
                continue;
            }
            for (implemented, type_name, body) in impl_blocks(text) {
                if !implemented.is_empty() {
                    continue;
                }
                for (method, body) in methods(body) {
                    let behaviours = self.behaviours_of(body);
                    if !behaviours.is_empty() {
                        found.push(ServiceMethod { service: type_name.clone(), method, behaviours });
                    }
                }
            }
        }
        found
    }

    /// The services a text goes through: the service is named, and its method is called.
    fn through(&self, text: &str) -> Vec<&ServiceMethod> {
        self.services
            .iter()
            .filter(|candidate| text.contains(&candidate.service) && text.contains(&format!(".{}(", candidate.method)))
            .collect()
    }

    /// The behaviours a text reaches, directly or through a service, and the events they record.
    fn analyse(&self, text: &str) -> (Vec<(String, String)>, Vec<String>) {
        let mut behaviours = self.behaviours_of(text);
        for service in self.through(text) {
            for behaviour in &service.behaviours {
                if !behaviours.contains(behaviour) {
                    behaviours.push(behaviour.clone());
                }
            }
        }
        let mut events: Vec<String> = Vec::new();
        for (aggregate, behaviour) in &behaviours {
            let recorded = self
                .aggregates
                .iter()
                .find(|each| &each.name == aggregate)
                .and_then(|each| each.behaviours.iter().find(|(name, _)| name == behaviour))
                .map(|(_, events)| events.clone())
                .unwrap_or_default();
            for event in recorded {
                if !events.contains(&event) {
                    events.push(event);
                }
            }
        }
        events.sort();
        (behaviours, events)
    }

    /// Routes: each `.route("/path", verb(function)…)` of the presentation crate, and the command the
    /// function `accept()`s or the query it asks the module for. The first route listed wins.
    fn find_routes(&self, mount: &str) -> BTreeMap<String, String> {
        let mut routes = BTreeMap::new();
        let presentation: Vec<&SourceFile> =
            self.files.iter().filter(|file| file.path.contains("/presentation/")).collect();
        let bodies: BTreeMap<String, (&str, &str)> = presentation
            .iter()
            .flat_map(|file| {
                after_each(&file.text, "async fn ").filter_map(|at| {
                    let (name, _) = ident_at(&file.text, at)?;
                    let end = item_ends(&file.text).find(|end| *end > at).unwrap_or(file.text.len());
                    Some((name.to_string(), (&file.text[at..end], file.text.as_str())))
                })
            })
            .collect();
        for file in &presentation {
            for at in file.text.match_indices(".route(").map(|(at, _)| at + ".route".len()) {
                let call = balanced(&file.text, at, '(', ')');
                let Some(path) = call.trim().strip_prefix('"').and_then(|rest| rest.split('"').next()) else {
                    continue;
                };
                let chain = &call[call.find(',').map_or(call.len(), |at| at + 1)..];
                for verb in ["get", "post", "put", "patch", "delete"] {
                    for at in after_each(chain, &format!("{verb}(")) {
                        let Some((function, _)) = ident_at(chain, at) else { continue };
                        let Some((body, file)) = bodies.get(function) else { continue };
                        let route = canonical_route(verb, &format!("{mount}{path}"));
                        for message in
                            self.commands_built(body, &use_aliases(file, false)).into_iter().chain(queries_asked(body))
                        {
                            routes.entry(message).or_insert_with(|| route.clone());
                        }
                    }
                }
            }
        }
        routes
    }

    fn find_command_names(&self) -> BTreeMap<String, String> {
        let mut names = BTreeMap::new();
        for file in self.files {
            for (implemented, type_name, body) in impl_blocks(&file.text) {
                if implemented == "CommandEvent"
                    && let Some(name) = constants(body).get("NAME")
                {
                    names.insert(type_name, public_name(name).to_string());
                }
            }
        }
        names
    }

    /// The command handlers: every `impl CommandHandler for X` and the `type Command = Y;` it declares.
    fn find_handlers(&self) -> BTreeMap<String, (String, &'a str)> {
        let mut handlers = BTreeMap::new();
        for file in self.files {
            for (implemented, type_name, body) in impl_blocks(&file.text) {
                let key = "type Command = ";
                if implemented == "CommandHandler"
                    && let Some(at) = body.find(key)
                    && let Some((command, _)) = ident_at(body, at + key.len())
                {
                    handlers.insert(type_name, (command.to_string(), file.text.as_str()));
                }
            }
        }
        handlers
    }

    /// A name as written, through the renamings of its file (`aliases`) and the application crate's
    /// re-exports, to the name it stands for.
    fn follow(&self, name: &str, aliases: &BTreeMap<String, String>) -> String {
        let mut name = aliases.get(name).cloned().unwrap_or_else(|| name.to_string());
        for _ in 0..4 {
            match self.re_exports.get(&name) {
                Some(next) if *next != name => name = next.clone(),
                _ => break,
            }
        }
        name
    }

    /// The command type a name resolves to: a type that `impl CommandEvent`, or that a handler's
    /// `type Command` names. A name that resolves to neither (a helper, an alias not followed) is no
    /// command: the reader never names what it did not resolve.
    fn command_type(&self, name: &str, aliases: &BTreeMap<String, String>) -> Option<String> {
        let resolved = self.follow(name, aliases);
        (self.command_names.contains_key(&resolved) || self.handlers.values().any(|(command, _)| *command == resolved))
            .then_some(resolved)
    }

    /// The commands a controller builds, as command types: `accept(&context, X { … })`,
    /// `module.command::<X>()`; of a path (`commands::ShareNote { … }`, `ShareNote::new(…)`), the
    /// segment that resolves.
    fn commands_built(&self, body: &str, aliases: &BTreeMap<String, String>) -> Vec<String> {
        commands_written(body)
            .iter()
            .filter_map(|segments| segments.iter().rev().find_map(|segment| self.command_type(segment, aliases)))
            .collect()
    }

    /// The public name of a command type (`CreateNote`, `ValidateAccount`): its `NAME`, or the type's own.
    fn command_name(&self, command_type: &str) -> String {
        self.command_names.get(command_type).cloned().unwrap_or_else(|| public_name(command_type).to_string())
    }

    /// The handler type a wiring entry names, when it is one: of the path written there, the segment
    /// that is a type of the context that `impl CommandHandler`, through the wiring's renamings; with
    /// the command type it answers and the text of its file.
    fn handler(&self, path: &[&str], aliases: &BTreeMap<String, String>) -> Option<(String, &(String, &'a str))> {
        path.iter().rev().find_map(|segment| {
            let resolved = self.follow(segment, aliases);
            let handler = self.handlers.get(&resolved)?;
            Some((resolved, handler))
        })
    }

    /// The commands of this context a text dispatches: each `publish(…)` handed a command type.
    fn commands_dispatched(&self, text: &str) -> Vec<String> {
        let aliases = use_aliases(text, false);
        let mut names = Vec::new();
        for segments in published_paths(text) {
            if let Some(command_type) = segments.iter().rev().find_map(|segment| self.command_type(segment, &aliases)) {
                let name = self.command_name(&command_type);
                if !names.contains(&name) {
                    names.push(name);
                }
            }
        }
        names
    }

    /// The command a wiring entry lists, when its handler resolves to a handler type of the context;
    /// an entry that does not (a factory function, a name not followed) is not read as a command.
    fn command(&self, path: &[&str], aliases: &BTreeMap<String, String>) -> Option<Command> {
        let (_, (message, text)) = self.handler(path, aliases)?;
        let name = self.command_name(message);
        let (behaviours, events) = self.analyse(text);
        let aggregate = behaviours.first().map(|(aggregate, _)| aggregate.clone()).or_else(|| {
            self.aggregates.iter().find(|each| contains_word(text, &each.name)).map(|each| each.name.clone())
        });
        Some(Command {
            name,
            actor: actor_of(text).to_string(),
            route: self.routes.get(message).cloned(),
            aggregate,
            events,
        })
    }

    /// The query a handler answers (`type Query = X;`).
    fn message_of<'b>(&self, handler: &'b str, kind: &str) -> Option<&'b str> {
        let key = format!("type {kind} = ");
        ident_at(handler, handler.find(&key)? + key.len()).map(|(name, _)| name)
    }

    fn query(&self, handler_name: &str) -> Query {
        let handler = file_declaring(self.files, handler_name);
        let text = handler.map(|file| file.text.as_str()).unwrap_or_default();
        let message = self.message_of(text, "Query").unwrap_or(handler_name);
        Query {
            name: public_name(handler_name).to_string(),
            actor: actor_of(text).to_string(),
            route: self.routes.get(message).cloned(),
        }
    }

    fn policy(&self, on: String, kind: &str, text: &str, integration: &IntegrationEvents) -> Policy {
        let (_, events) = self.analyse(text);
        let mut publishes = integration.published_by(text);
        publishes.sort();
        Policy { on, kind: kind.to_string(), publishes, events }
    }
}

/// What a controller writes where a command goes, as paths not yet resolved: the second argument of
/// `accept(&context, …)`, the type of `module.command::<…>()`.
fn commands_written(body: &str) -> Vec<Vec<&str>> {
    let mut written = Vec::new();
    for at in after_each(body, "accept(") {
        let arguments = balanced(body, at - 1, '(', ')');
        if let Some(rest) = arguments.split_once(',').map(|(_, rest)| rest)
            && let Some((segments, _)) = path_at(rest, 0)
        {
            written.push(segments);
        }
    }
    for at in after_each(body, "command::<") {
        if let Some((segments, _)) = path_at(body, at) {
            written.push(segments);
        }
    }
    written
}

/// The queries a controller function asks the module for: `module.query::<X>()`.
fn queries_asked(body: &str) -> Vec<String> {
    after_each(body, "query::<").filter_map(|at| ident_at(body, at)).map(|(name, _)| name.to_string()).collect()
}

/// ARCH-ONE-HANDLER, for one context, read from the shapes the inventory reads: a command the
/// Module's `commands` list with other than one handler (a `Subscription::command(handler)` carries
/// one, so that is the same command listed twice); a command a controller builds that no listed
/// handler answers; a command a subscribed policy dispatches that none answers. The messages are
/// the four languages'.
fn one_handler_problems(context: &str, wiring_text: &str, reader: &ContextReader) -> Vec<String> {
    let aliases = use_aliases(wiring_text, false);
    let mut handlers_of: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for path in command_handlers(wiring_text) {
        if let Some((handler, (command, _))) = reader.handler(&path, &aliases) {
            handlers_of.entry(reader.command_name(command)).or_default().push(handler);
        }
    }
    let mut problems: Vec<String> = handlers_of
        .iter()
        .filter(|(_, handlers)| handlers.len() != 1)
        .map(|(command, handlers)| {
            format!(
                "{ONE_HANDLER_RULE}: {context}: command {command} has {} handlers ({}); a command has exactly one",
                handlers.len(),
                handlers.join(", ")
            )
        })
        .collect();
    let built: BTreeSet<String> = reader
        .files
        .iter()
        .filter(|file| file.path.contains("/presentation/"))
        .flat_map(|file| reader.commands_built(&file.text, &use_aliases(&file.text, false)))
        .map(|command_type| reader.command_name(&command_type))
        .collect();
    for command in built.iter().filter(|command| !handlers_of.contains_key(*command)) {
        problems.push(format!(
            "{ONE_HANDLER_RULE}: {context}: command {command} is built by a route and no handler in the Module answers it"
        ));
    }
    for key in ["domain_events", "integration_events"] {
        for (_, policy) in reactions(wiring_text, key) {
            let text = file_declaring(reader.files, policy).map(|file| file.text.as_str()).unwrap_or_default();
            for command in reader.commands_dispatched(text) {
                if !handlers_of.contains_key(&command) {
                    problems.push(format!(
                        "{ONE_HANDLER_RULE}: {context}: command {command} is dispatched by {policy} and no handler in the Module answers it"
                    ));
                }
            }
        }
    }
    problems
}

/// Where each context's routes are mounted, from the composition root: `.nest("/notes", note_routes(…))`
/// mounts under the prefix, `.merge(auth_routes(…))` at the root.
fn mounts(bootstrap: &[SourceFile], contexts: &[(String, Vec<SourceFile>)]) -> BTreeMap<String, String> {
    let mut mounts = BTreeMap::new();
    let declares = |function: &str| {
        contexts
            .iter()
            .find(|(_, files)| files.iter().any(|file| file.text.contains(&format!("pub fn {function}("))))
            .map(|(context, _)| context.clone())
    };
    for file in bootstrap {
        for at in after_each(&file.text, ".nest(") {
            let call = balanced(&file.text, at - 1, '(', ')');
            let Some(prefix) = call.trim().strip_prefix('"').and_then(|rest| rest.split('"').next()) else { continue };
            let Some(rest) = call.split_once(',').map(|(_, rest)| rest) else { continue };
            if let Some((function, _)) = ident_at(rest, 0)
                && let Some(context) = declares(function)
            {
                mounts.insert(context, if prefix == "/" { String::new() } else { prefix.to_string() });
            }
        }
        for at in after_each(&file.text, ".merge(") {
            if let Some((function, _)) = ident_at(&file.text, at)
                && let Some(context) = declares(function)
            {
                mounts.insert(context, String::new());
            }
        }
    }
    mounts
}

/// The Rust tree the binding describes, read once: the shared kernel's contracts, each declared
/// context's sources, and where the bootstrap mounts each context's routes.
struct Tree {
    language: String,
    wiring: String,
    integration: IntegrationEvents,
    sources: Vec<(String, Vec<SourceFile>)>,
    mounts: BTreeMap<String, String>,
}

impl Tree {
    fn read(binding: &Yaml, language_root: &Path) -> Self {
        let text = |value: &Yaml| value.as_str().unwrap_or_default().to_string();
        let contexts_dir = language_root.join(text(&binding["contexts_tree"]["path"]));
        let declared: Vec<String> =
            binding["contexts"].as_sequence().map(|items| items.iter().map(text).collect()).unwrap_or_default();

        let mut kernel = Vec::new();
        read_sources(&language_root.join(text(&binding["kernel"]["path"])), &mut kernel);
        let mut bootstrap = Vec::new();
        read_sources(&language_root.join(text(&binding["bootstrap"]["path"])), &mut bootstrap);
        let sources: Vec<(String, Vec<SourceFile>)> = declared
            .iter()
            .map(|context| {
                let mut files = Vec::new();
                read_sources(&contexts_dir.join(context.to_lowercase()), &mut files);
                (context.clone(), files)
            })
            .collect();
        let mounts = mounts(&bootstrap, &sources);
        Self {
            language: text(&binding["language"]),
            wiring: text(&binding["wiring"]),
            integration: integration_events(&kernel),
            sources,
            mounts,
        }
    }

    /// A context's reader, and the `name()` arms of its domain events.
    fn reader_of<'a>(
        &self,
        context: &str,
        files: &'a [SourceFile],
    ) -> (ContextReader<'a>, BTreeMap<(String, String), String>) {
        let mut arms = BTreeMap::new();
        for file in files.iter().filter(|file| file.text.contains("impl DomainEvent for")) {
            event_arms(&file.text, &mut arms);
        }
        let reader = ContextReader::new(files, &arms, self.mounts.get(context).map_or("", String::as_str));
        (reader, arms)
    }

    /// A context's wiring file, its tests stripped.
    fn wiring_of<'a>(&self, files: &'a [SourceFile]) -> &'a str {
        files
            .iter()
            .find(|file| file.path.contains(&format!("/{}/", self.wiring)))
            .map(|file| file.text.as_str())
            .unwrap_or_default()
    }
}

/// Every command has exactly one handler, context by context (ARCH-ONE-HANDLER), read from the
/// tree the inventory is read from; the problems are added to `problems`, each naming the rule.
pub fn check_handlers(binding: &Yaml, language_root: &Path, problems: &mut Vec<String>) {
    let tree = Tree::read(binding, language_root);
    let mut sources: Vec<&(String, Vec<SourceFile>)> = tree.sources.iter().collect();
    sources.sort_by(|a, b| a.0.cmp(&b.0));
    for (context, files) in sources {
        let (reader, _) = tree.reader_of(context, files);
        problems.extend(one_handler_problems(context, tree.wiring_of(files), &reader));
    }
}

/// The inventory read from the Rust tree the binding describes.
pub fn inspect(binding: &Yaml, language_root: &Path) -> Inventory {
    let tree = Tree::read(binding, language_root);
    let integration = &tree.integration;
    let sources = &tree.sources;

    let mut contexts = Vec::new();
    let mut published_by: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut consumed_by: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (context, files) in sources {
        let (reader, arms) = tree.reader_of(context, files);
        let wiring_text = tree.wiring_of(files);

        let aliases = use_aliases(wiring_text, false);
        let mut commands: Vec<Command> =
            command_handlers(wiring_text).iter().filter_map(|path| reader.command(path, &aliases)).collect();
        commands.sort_by(|a, b| a.name.cmp(&b.name));

        let mut queries: Vec<Query> = after_each(section(wiring_text, "queries"), "query(")
            .filter_map(|at| ident_at(section(wiring_text, "queries"), at))
            .map(|(handler, _)| reader.query(handler))
            .collect();
        queries.sort_by(|a, b| a.name.cmp(&b.name));

        let mut events: Vec<String> = arms.values().cloned().collect::<BTreeSet<_>>().into_iter().collect();
        events.sort();

        let mut policies = Vec::new();
        let mut handlers: Vec<String> = Vec::new();
        for (key, kind) in [("domain_events", "domain-event"), ("integration_events", "integration-event")] {
            for (channel, handler) in reactions(wiring_text, key) {
                let text = file_declaring(files, handler).map(|file| file.text.as_str()).unwrap_or_default();
                policies.push(reader.policy(integration.channel(channel), kind, text, integration));
                handlers.push(handler.to_string());
            }
        }
        // A publisher that is not a subscribed handler reacts to every operation: the Tracker's decorated bus.
        for file in files {
            let Some((name, _)) = after_each(&file.text, "pub struct ").find_map(|at| ident_at(&file.text, at)) else {
                continue;
            };
            if handlers.iter().any(|handler| handler == name)
                || file.text.contains("CommandHandler for")
                || integration.published_by(&file.text).is_empty()
            {
                continue;
            }
            policies.push(reader.policy("every operation".into(), "every-operation", &file.text, integration));
        }
        policies.sort_by(|a, b| a.kind.cmp(&b.kind).then_with(|| a.on.cmp(&b.on)));

        for policy in &policies {
            for name in &policy.publishes {
                published_by.entry(name.clone()).or_default().insert(context.clone());
            }
            if policy.kind == "integration-event" {
                consumed_by.entry(policy.on.clone()).or_default().insert(context.clone());
            }
        }
        contexts.push(Context { id: context.clone(), commands, queries, events, policies });
    }
    // Every language's bindings list the contexts in their own order; the inventory lists them by id.
    contexts.sort_by(|a, b| a.id.cmp(&b.id));

    // The links the code carries: an integration event from each context that publishes it to each
    // that subscribes; a crate of one context depending on another context's crate, on the port the
    // depending file implements (an owned port, answered by an adapter over the other's read model).
    let mut links: BTreeMap<(String, String, String), Vec<String>> = BTreeMap::new();
    for (name, publishers) in &published_by {
        for upstream in publishers {
            for downstream in consumed_by.get(name).into_iter().flatten() {
                if upstream != downstream {
                    links
                        .entry((upstream.clone(), downstream.clone(), "integration-event".into()))
                        .or_default()
                        .push(name.clone());
                }
            }
        }
    }
    for (context, files) in sources {
        let ports: BTreeSet<&str> = files
            .iter()
            .filter(|file| file.path.contains("/ports/"))
            .flat_map(|file| after_each(&file.text, "pub trait ").filter_map(|at| ident_at(&file.text, at)))
            .map(|(name, _)| name)
            .collect();
        for file in files {
            for (other, _) in sources.iter().filter(|(other, _)| other != context) {
                if !file.text.contains(&format!("use {}_", other.to_lowercase())) {
                    continue;
                }
                let port = impl_blocks(&file.text)
                    .into_iter()
                    .map(|(implemented, _, _)| implemented)
                    .find(|implemented| ports.contains(implemented.as_str()))
                    .unwrap_or_default();
                let contracts = links.entry((other.clone(), context.clone(), "owned-port".into())).or_default();
                if !port.is_empty() && !contracts.contains(&port) {
                    contracts.push(port);
                }
            }
        }
    }
    let mut links: Vec<Link> = links
        .into_iter()
        .map(|((upstream, downstream, mechanism), mut contracts)| {
            contracts.sort();
            Link { mechanism, upstream, downstream, contracts }
        })
        .collect();
    links.sort_by_key(|link| format!("{}→{}:{}", link.upstream, link.downstream, link.mechanism));

    Inventory { schema_version: SCHEMA_VERSION, language: tree.language.clone(), contexts, links }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_route_is_spelled_the_way_every_language_spells_it() {
        assert_eq!(canonical_route("post", "/notes/{id}/share"), "POST /notes/{param}/share");
        assert_eq!(canonical_route("get", "/notes/"), "GET /notes");
        assert_eq!(
            canonical_route("get", "/notifications/account/{recipient_id}"),
            "GET /notifications/account/{param}"
        );
        assert_eq!(canonical_route("get", "/"), "GET /");
    }

    #[test]
    fn a_public_name_drops_the_suffix_of_its_kind() {
        assert_eq!(public_name("NoteSharedIntegrationEvent"), "NoteShared");
        assert_eq!(public_name("GetMyNotesQueryHandler"), "GetMyNotes");
        assert_eq!(public_name("ShareNote"), "ShareNote");
    }

    #[test]
    fn a_behaviour_inherits_the_events_of_the_method_it_delegates_to() {
        let text = "\
pub struct Account {\n    root: AggregateRoot<AccountEvent>,\n}\n
impl Account {
    pub fn authenticate(&mut self) -> DomainResult {
        self.authenticate_at(SystemTime::now())
    }

    pub fn authenticate_at(&mut self, now: SystemTime) -> DomainResult {
        self.root.record(AccountEvent::Authenticated { account_id: id, at: now });
        Ok(())
    }

    pub fn from_snapshot(snapshot: AccountSnapshot) -> Account {
        Account { root: AggregateRoot::new(Id::new(snapshot.id), snapshot.version) }
    }
}
";
        let arms = BTreeMap::from([(("AccountEvent".into(), "Authenticated".into()), "AccountAuthenticated".into())]);
        let files = vec![SourceFile { path: "account/mod.rs".into(), text: text.into() }];
        let found = aggregates(&files, &arms);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "Account");
        let names: Vec<&str> = found[0].behaviours.iter().map(|(name, _)| name.as_str()).collect();
        assert_eq!(names, ["authenticate", "authenticate_at"]);
        assert_eq!(found[0].behaviours[0].1, ["AccountAuthenticated"]);
    }

    #[test]
    fn a_wiring_channel_is_a_literal_or_a_constant_of_a_contract() {
        let kernel = vec![SourceFile {
            path: "integration_events/account_integration_events.rs".into(),
            text: "\
pub enum AccountIntegrationEvent {
    Created { account_id: String },
}

impl AccountIntegrationEvent {
    pub const CREATED: &'static str = \"AccountCreatedIntegrationEvent\";
}

impl Event for AccountIntegrationEvent {
    fn name(&self) -> &'static str {
        match self {
            AccountIntegrationEvent::Created { .. } => Self::CREATED,
        }
    }
}
"
            .into(),
        }];
        let integration = integration_events(&kernel);
        assert_eq!(integration.channel("\"NoteShared\""), "NoteShared");
        assert_eq!(integration.channel("AccountIntegrationEvent::CREATED"), "AccountCreated");
        assert_eq!(
            integration.published_by("context.publish(AccountIntegrationEvent::Created { account_id }).await;"),
            ["AccountCreated"]
        );
        assert!(integration.published_by("let AccountIntegrationEvent::Created { .. } = event;").is_empty());
    }

    /// A context of two commands, `CreateNote` answered by its handler and `PinNote` by nobody, and a
    /// controller and a policy that build one of them.
    fn one_handler_files(controller: &str, policy: &str) -> Vec<SourceFile> {
        let command = |name: &str| {
            format!(
                "pub struct {name} {{\n    pub note_id: String,\n}}\n\nimpl CommandEvent for {name} {{\n    const NAME: &'static str = \"{name}\";\n    type Output = ();\n}}\n"
            )
        };
        let handler = |name: &str, command: &str| {
            format!(
                "pub struct {name}<R> {{\n    repository: Arc<R>,\n}}\n\nimpl<R: NoteRepository> CommandHandler for {name}<R> {{\n    type Command = {command};\n}}\n"
            )
        };
        vec![
            SourceFile {
                path: "notes/application/src/commands/create_note.rs".into(),
                text: command("CreateNote") + &handler("CreateNoteCommandHandler", "CreateNote"),
            },
            SourceFile { path: "notes/application/src/commands/pin_note.rs".into(), text: command("PinNote") },
            SourceFile {
                path: "notes/application/src/commands/other.rs".into(),
                text: handler("OtherHandler", "CreateNote"),
            },
            SourceFile { path: "notes/presentation/src/lib.rs".into(), text: controller.into() },
            SourceFile { path: "notes/application/src/events/note_created_handler.rs".into(), text: policy.into() },
        ]
    }

    fn one_handler_problems_of(wiring: &str, controller: &str, policy: &str) -> Vec<String> {
        let files = one_handler_files(controller, policy);
        let reader = ContextReader::new(&files, &BTreeMap::new(), "");
        one_handler_problems("Notes", wiring, &reader)
    }

    const CREATES_A_NOTE: &str = "\
async fn create_note(Extension(context): Extension<ExecutionContext>, Json(body): Json<CreateNoteBody>) -> Response {
    accept(&context, CreateNote { note_id: body.note_id }).into_response()
}
";
    const LOGS_A_CREATED_NOTE: &str = "\
pub struct NoteCreatedHandler;

impl EventHandler for NoteCreatedHandler {
    type Event = NoteEvent;

    async fn execute(&self, event: NoteEvent, context: &ExecutionContext) -> DomainResult {
        Ok(())
    }
}
";
    const ONE_HANDLER_EACH: &str = "\
        commands: vec![
            Subscription::command(CreateNoteCommandHandler::new(repository.clone())),
        ],
        domain_events: vec![
            Subscription::reaction(\"NoteCreated\", NoteCreatedHandler),
        ],
";

    #[test]
    fn the_tree_as_it_is_lists_every_command_once_and_answers_every_command_built() {
        let language_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().expect("the workspace");
        // The binding is at the repository's root: above this directory here, this directory in an
        // application `clean-ddd create` made.
        let repository = crate::repository_root(&language_root).expect("the repository root");
        let binding = fs::read_to_string(repository.join(crate::BINDING)).expect("the binding");
        let binding: Yaml = serde_yaml::from_str(&binding).expect("the binding is YAML");
        let mut problems = Vec::new();
        check_handlers(&binding, &language_root, &mut problems);
        assert_eq!(problems, Vec::<String>::new());
    }

    #[test]
    fn a_wiring_that_lists_the_same_command_twice_is_refused_naming_the_rule_and_the_command() {
        let wiring = "\
        commands: vec![
            Subscription::command(CreateNoteCommandHandler::new(repository.clone())),
            Subscription::command(OtherHandler::new(repository)),
        ],
";
        assert_eq!(
            one_handler_problems_of(wiring, CREATES_A_NOTE, LOGS_A_CREATED_NOTE),
            [
                "ARCH-ONE-HANDLER: Notes: command CreateNote has 2 handlers (CreateNoteCommandHandler, OtherHandler); a command has exactly one"
            ]
        );
    }

    #[test]
    fn a_command_a_controller_builds_that_no_handler_answers_is_refused() {
        let controller = "\
async fn pin_note(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    accept(&context, PinNote { note_id: id }).into_response()
}
";
        assert_eq!(
            one_handler_problems_of(ONE_HANDLER_EACH, controller, LOGS_A_CREATED_NOTE),
            ["ARCH-ONE-HANDLER: Notes: command PinNote is built by a route and no handler in the Module answers it"]
        );
        assert_eq!(
            one_handler_problems_of(ONE_HANDLER_EACH, CREATES_A_NOTE, LOGS_A_CREATED_NOTE),
            Vec::<String>::new()
        );
    }

    #[test]
    fn a_name_is_a_command_only_when_it_resolves_to_a_command_type_of_the_context() {
        // A renaming in the controller's file is followed: the route builds CreateNote, which is answered.
        let renamed = "\
use notes_application::commands::create_note::{CreateNote as Create, other};

async fn create_note(Extension(context): Extension<ExecutionContext>, Json(body): Json<CreateNoteBody>) -> Response {
    accept(&context, Create { note_id: body.note_id }).into_response()
}
";
        assert_eq!(one_handler_problems_of(ONE_HANDLER_EACH, renamed, LOGS_A_CREATED_NOTE), Vec::<String>::new());
        // A helper, or a renaming the reader does not follow, is no command: nothing is named.
        let helper = "\
async fn pin_note(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    accept(&context, pin(id)).into_response()
}
";
        assert_eq!(one_handler_problems_of(ONE_HANDLER_EACH, helper, LOGS_A_CREATED_NOTE), Vec::<String>::new());
        // A wiring entry whose handler is a factory function is not read as a command: CreateNote is unanswered.
        let factory = "\
        commands: vec![
            Subscription::command(create_note_handler(repository.clone())),
        ],
";
        assert_eq!(
            one_handler_problems_of(factory, CREATES_A_NOTE, LOGS_A_CREATED_NOTE),
            ["ARCH-ONE-HANDLER: Notes: command CreateNote is built by a route and no handler in the Module answers it"]
        );
    }

    #[test]
    fn a_renaming_is_read_from_use_statements_and_a_re_export_only_from_pub_use() {
        let text = "\
use notes_application::commands::share_note::ShareNote as Share;
pub use share_note::{ShareNote as ShareRequest, ShareNoteCommandHandler};
use std::io::Write as _;
// we use this as that;
";
        let all = use_aliases(text, false);
        assert_eq!(all.get("Share").map(String::as_str), Some("ShareNote"));
        assert_eq!(all.get("ShareRequest").map(String::as_str), Some("ShareNote"));
        assert_eq!(all.len(), 2);
        let public = use_aliases(text, true);
        assert_eq!(public.keys().collect::<Vec<_>>(), ["ShareRequest"]);
    }

    fn inventory(json: &str) -> Inventory {
        serde_json::from_str(json).expect("a hand-built inventory")
    }

    #[test]
    fn a_stale_inventory_names_each_difference_in_the_words_every_language_prints() {
        let committed = inventory(
            r#"{
  "schemaVersion": 1, "language": "rust",
  "contexts": [
    { "id": "Notes",
      "commands": [
        { "name": "ArchiveNote", "actor": "a signed-in account", "route": "POST /notes/{param}/archive", "aggregate": "Note", "events": ["NoteArchived"] },
        { "name": "ShareNote", "actor": "a signed-in account", "route": "POST /notes/{param}/share", "aggregate": "Note", "events": ["NoteShared"] }
      ],
      "queries": [{ "name": "GetNote", "actor": "a signed-in account", "route": "GET /notes/{param}" }],
      "events": ["NoteArchived", "NoteShared"],
      "policies": [{ "on": "NoteShared", "kind": "domain-event", "publishes": ["NoteShared"], "events": [] }] },
    { "id": "Security", "commands": [], "queries": [], "events": [], "policies": [] }
  ],
  "links": [{ "mechanism": "integration-event", "upstream": "Notes", "downstream": "Notifications", "contracts": ["NoteShared"] }]
}"#,
        );
        let tree = inventory(
            r#"{
  "schemaVersion": 1, "language": "rust",
  "contexts": [
    { "id": "Notes",
      "commands": [
        { "name": "PinNote", "actor": "a signed-in account", "route": "POST /notes/{param}/pin", "aggregate": "Note", "events": ["NotePinned"] },
        { "name": "ShareNote", "actor": "anyone", "aggregate": "Note", "events": ["NoteShared"] }
      ],
      "queries": [{ "name": "GetNote", "actor": "a signed-in account", "route": "GET /notes/{param}" }],
      "events": ["NoteShared"],
      "policies": [{ "on": "NoteShared", "kind": "domain-event", "publishes": [], "events": [] }] },
    { "id": "Tracker", "commands": [], "queries": [], "events": [], "policies": [] }
  ],
  "links": [{ "mechanism": "integration-event", "upstream": "Notes", "downstream": "Notifications", "contracts": ["NoteArchived", "NoteShared"] }]
}"#,
        );
        assert_eq!(
            changes(&committed, &tree),
            [
                "Notes: the committed inventory has the command ArchiveNote, the tree no longer says it",
                "Notes: the command ShareNote differs: actor \"a signed-in account\" → \"anyone\"; route \"POST /notes/{param}/share\" → none",
                "Notes: the tree says the command PinNote, the committed inventory does not",
                "Notes: the committed inventory has the domain event NoteArchived, the tree no longer says it",
                "Notes: the policy on NoteShared differs: publishes [NoteShared] → []",
                "Security: the committed inventory has the context, the tree no longer says it",
                "Tracker: the tree says the context, the committed inventory does not",
                "context map: the link Notes → Notifications (integration-event) differs: contracts [NoteShared] → [NoteArchived, NoteShared]",
            ]
        );
        assert_eq!(changes(&committed, &committed), Vec::<String>::new());
    }

    #[test]
    fn two_policies_on_one_fact_are_told_apart_by_their_kind() {
        let side = |kind: &str| {
            inventory(&format!(
                r#"{{ "schemaVersion": 1, "language": "rust", "links": [], "contexts": [{{ "id": "Notes", "commands": [], "queries": [], "events": [],
  "policies": [{{ "on": "NoteShared", "kind": "domain-event", "publishes": [], "events": [] }},
               {{ "on": "NoteShared", "kind": "{kind}", "publishes": [], "events": [] }}] }}] }}"#
            ))
        };
        assert_eq!(
            changes(&side("integration-event"), &side("every-operation")),
            [
                "Notes: the committed inventory has the policy on NoteShared (integration-event), the tree no longer says it",
                "Notes: the tree says the policy on NoteShared (every-operation), the committed inventory does not",
            ]
        );
    }

    #[test]
    fn a_command_a_policy_dispatches_that_no_handler_answers_is_refused() {
        let policy = "\
pub struct NoteCreatedHandler;

impl EventHandler for NoteCreatedHandler {
    type Event = NoteEvent;

    async fn execute(&self, event: NoteEvent, context: &ExecutionContext) -> DomainResult {
        let NoteEvent::Created { note_id, .. } = event else { return Ok(()) };
        context.publish(PinNote { note_id }).await;
        Ok(())
    }
}
";
        assert_eq!(
            one_handler_problems_of(ONE_HANDLER_EACH, CREATES_A_NOTE, policy),
            [
                "ARCH-ONE-HANDLER: Notes: command PinNote is dispatched by NoteCreatedHandler and no handler in the Module answers it"
            ]
        );
    }
}
