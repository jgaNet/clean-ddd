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

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use serde::Serialize;
use serde_yaml::Value as Yaml;

/// Where the inventory is committed, relative to the repository root.
pub const INVENTORY_FILE: &str = "docs/inventory/rust.json";
/// What writes it.
pub const WRITE_COMMAND: &str = "cargo run -p conventions -- inventory --write";
const SCHEMA_VERSION: u64 = 1;

const SIGNED_IN: &str = "a signed-in account";
const ADMINISTRATOR: &str = "an administrator";
const ANYONE: &str = "anyone";

// The inventory, in the canonical key order; `serde_json::to_string_pretty` renders the canonical bytes.

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    schema_version: u64,
    language: String,
    contexts: Vec<Context>,
    links: Vec<Link>,
}

#[derive(Debug, Serialize)]
pub struct Context {
    id: String,
    commands: Vec<Command>,
    queries: Vec<Query>,
    events: Vec<String>,
    policies: Vec<Policy>,
}

#[derive(Debug, Serialize)]
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

#[derive(Debug, Serialize)]
pub struct Query {
    name: String,
    actor: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    route: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Policy {
    on: String,
    kind: String,
    publishes: Vec<String>,
    events: Vec<String>,
}

#[derive(Debug, Serialize)]
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

/// The committed inventory is what the tree renders now (ARCH-ONE-APPLICATION).
pub fn check(repository_root: &Path, rendered: &str, problems: &mut Vec<String>) {
    match fs::read_to_string(repository_root.join(INVENTORY_FILE)) {
        Ok(committed) if committed == rendered => {}
        Ok(_) => problems.push(format!(
            "ARCH-ONE-APPLICATION: {INVENTORY_FILE} differs from what the Rust tree says; run `{WRITE_COMMAND}`"
        )),
        Err(_) => problems.push(format!("ARCH-ONE-APPLICATION: {INVENTORY_FILE} is missing; run `{WRITE_COMMAND}`")),
    }
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
        for at in after_each(text, "publish(") {
            let at = at + text[at..].len() - text[at..].trim_start().len();
            let at = text[at..].strip_prefix("Arc::new(").map_or(at, |_| at + "Arc::new(".len());
            let Some((segments, _)) = path_at(text, at) else { continue };
            let name = self.named_by(&segments).or_else(|| {
                let binding = format!("let {} = ", segments.first()?);
                let (segments, _) = path_at(text, text.find(&binding)? + binding.len())?;
                self.named_by(&segments)
            });
            if let Some(name) = name
                && !names.contains(&name)
            {
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
}

impl<'a> ContextReader<'a> {
    fn new(files: &'a [SourceFile], arms: &BTreeMap<(String, String), String>, mount: &str) -> Self {
        let aggregates = aggregates(files, arms);
        let mut reader =
            Self { files, aggregates, services: Vec::new(), routes: BTreeMap::new(), command_names: BTreeMap::new() };
        reader.services = reader.find_services();
        reader.routes = reader.find_routes(mount);
        reader.command_names = reader.find_command_names();
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
        let bodies: BTreeMap<String, &str> = presentation
            .iter()
            .flat_map(|file| {
                after_each(&file.text, "async fn ").filter_map(|at| {
                    let (name, _) = ident_at(&file.text, at)?;
                    let end = item_ends(&file.text).find(|end| *end > at).unwrap_or(file.text.len());
                    Some((name.to_string(), &file.text[at..end]))
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
                        let Some(body) = bodies.get(function) else { continue };
                        let route = canonical_route(verb, &format!("{mount}{path}"));
                        for message in messages_built(body) {
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

    /// The command a handler handles (`type Command = X;`) or the query (`type Query = X;`).
    fn message_of<'b>(&self, handler: &'b str, kind: &str) -> Option<&'b str> {
        let key = format!("type {kind} = ");
        ident_at(handler, handler.find(&key)? + key.len()).map(|(name, _)| name)
    }

    fn command(&self, handler_name: &str) -> Command {
        let handler = file_declaring(self.files, handler_name);
        let text = handler.map(|file| file.text.as_str()).unwrap_or_default();
        let message = self.message_of(text, "Command").unwrap_or(handler_name);
        let name = self.command_names.get(message).cloned().unwrap_or_else(|| public_name(handler_name).to_string());
        let (behaviours, events) = self.analyse(text);
        let aggregate = behaviours.first().map(|(aggregate, _)| aggregate.clone()).or_else(|| {
            self.aggregates.iter().find(|each| contains_word(text, &each.name)).map(|each| each.name.clone())
        });
        Command { name, actor: actor_of(text).to_string(), route: self.routes.get(message).cloned(), aggregate, events }
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

/// The commands and queries a controller function builds: `accept(&context, X { … })`,
/// `module.command::<X>()`, `module.query::<X>()`.
fn messages_built(body: &str) -> Vec<String> {
    let mut built = Vec::new();
    for at in after_each(body, "accept(") {
        let arguments = balanced(body, at - 1, '(', ')');
        if let Some(rest) = arguments.split_once(',').map(|(_, rest)| rest)
            && let Some((segments, _)) = path_at(rest, 0)
            && let Some(first) = segments.first()
        {
            built.push((*first).to_string());
        }
    }
    for key in ["command::<", "query::<"] {
        for at in after_each(body, key) {
            if let Some((name, _)) = ident_at(body, at) {
                built.push(name.to_string());
            }
        }
    }
    built
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

/// The inventory read from the Rust tree the binding describes.
pub fn inspect(binding: &Yaml, language_root: &Path) -> Inventory {
    let text = |value: &Yaml| value.as_str().unwrap_or_default().to_string();
    let contexts_dir = language_root.join(text(&binding["contexts_tree"]["path"]));
    let wiring = text(&binding["wiring"]);
    let declared: Vec<String> =
        binding["contexts"].as_sequence().map(|items| items.iter().map(text).collect()).unwrap_or_default();

    let mut kernel = Vec::new();
    read_sources(&language_root.join(text(&binding["kernel"]["path"])), &mut kernel);
    let integration = integration_events(&kernel);
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

    let mut contexts = Vec::new();
    let mut published_by: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    let mut consumed_by: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for (context, files) in &sources {
        let mut arms = BTreeMap::new();
        for file in files.iter().filter(|file| file.text.contains("impl DomainEvent for")) {
            event_arms(&file.text, &mut arms);
        }
        let reader = ContextReader::new(files, &arms, mounts.get(context).map_or("", String::as_str));
        let wiring_text = files
            .iter()
            .find(|file| file.path.contains(&format!("/{wiring}/")))
            .map(|file| file.text.as_str())
            .unwrap_or_default();

        let mut commands: Vec<Command> = after_each(section(wiring_text, "commands"), "Subscription::command(")
            .filter_map(|at| ident_at(section(wiring_text, "commands"), at))
            .map(|(handler, _)| reader.command(handler))
            .collect();
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
            let listed = section(wiring_text, key);
            for at in after_each(listed, "Subscription::reaction(") {
                let arguments = balanced(listed, at - 1, '(', ')');
                let Some((channel, handler)) = arguments.split_once(',') else { continue };
                let Some((handler, _)) = ident_at(handler, 0) else { continue };
                let text = file_declaring(files, handler).map(|file| file.text.as_str()).unwrap_or_default();
                policies.push(reader.policy(integration.channel(channel), kind, text, &integration));
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
            policies.push(reader.policy("every operation".into(), "every-operation", &file.text, &integration));
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
    for (context, files) in &sources {
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

    Inventory { schema_version: SCHEMA_VERSION, language: text(&binding["language"]), contexts, links }
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
}
