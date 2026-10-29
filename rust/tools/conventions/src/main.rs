//! `cargo run -p conventions`: the Rust conventions check. Runs in CI from `rust/`.
//!
//! The contract (`conventions/architecture.yaml`) says which layer may depend on which; the Rust
//! binding (`conventions/rust.yaml`) says where this language keeps its trees. Here every layer
//! is a crate, so the dependency table *is* the `[dependencies]` of each crate and the compiler
//! holds the boundary. What this check adds is the proof that the graph is the table:
//!
//! 1. The binding is this language's and the contract knows it: `language` is `rust`, `rust`
//!    is in `languages`, `root` is the directory this tool runs from.
//! 2. The tree matches the contract: every directory under the contexts tree is a declared
//!    context holding only layer crates and its wiring crate; the two trees beside the contexts
//!    hold only layers (ARCH-CONTEXT-DECLARED, ARCH-TREES).
//! 3. The crate graph is the table: every workspace dependency of a layer crate is a unit its
//!    row allows — `own.<Layer>`, `architecture.<Layer>`, `kernel.<Layer>`, `others.<Layer>`,
//!    the wiring, the bootstrap — a dev-dependency may add what the layer's `specs` row allows,
//!    and a library the binding lists is seen only where `libraries` is allowed (ARCH-INWARD).
//!    The bootstrap may depend on anything, but its tests — the end-to-end tests — on the
//!    bootstrap and the libraries only: no layer crate in its `[dev-dependencies]` (ARCH-E2E).
//! 4. Every file the binding names exists (ARCH-MAP-IS-REAL). The rendered documents and the
//!    links are checked by the TypeScript tooling, which reads every binding.
//! 5. The committed inventory (`docs/inventory/rust.json`) is what the tree renders now
//!    (ARCH-ONE-APPLICATION): `cargo run -p conventions -- inventory` prints it, `--write`
//!    writes it, and the TypeScript check holds every language's inventory equal. A stale one is
//!    refused with one line per difference, in the words every language's check prints.
//! 6. A command has exactly one handler (ARCH-ONE-HANDLER): the Module lists it once, with one
//!    handler, and every command a route or a policy builds is one the Module lists; read from
//!    the same wiring, routes and policies the inventory is.
//!
//! Layer names are the contract's (`Domain`); a crate directory is the same word in lowercase
//! (`domain`), which is Rust's convention for a path.

// A tool talks on the console: the workspace denies it to everything but the logger and the tools.
#![allow(clippy::print_stdout, clippy::print_stderr)]

mod inventory;
#[cfg(test)]
mod shapes;

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use serde_yaml::Value as Yaml;

const CONTRACT: &str = "conventions/architecture.yaml";
const BINDING: &str = "conventions/rust.yaml";
const LANGUAGE: &str = "rust";

fn main() -> ExitCode {
    let language_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("the directory of this tool's workspace");
    let Some(repository_root) = repository_root(&language_root) else {
        eprintln!("✗ {CONTRACT} not found at or above {}", language_root.display());
        return ExitCode::FAILURE;
    };
    let contract = yaml(&repository_root.join(CONTRACT));
    let binding = yaml(&repository_root.join(BINDING));

    let arguments: Vec<String> = std::env::args().skip(1).collect();
    match arguments.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        [] => check(&contract, &binding, &repository_root, &language_root),
        ["inventory"] => {
            print!("{}", inventory::render(&inventory::inspect(&binding, &language_root)));
            ExitCode::SUCCESS
        }
        ["inventory", "--write"] => {
            let path = repository_root.join(inventory::INVENTORY_FILE);
            if let Some(dir) = path.parent() {
                fs::create_dir_all(dir).unwrap_or_else(|error| panic!("cannot create {}: {error}", dir.display()));
            }
            fs::write(&path, inventory::render(&inventory::inspect(&binding, &language_root)))
                .unwrap_or_else(|error| panic!("cannot write {}: {error}", path.display()));
            println!("✓ wrote {}", inventory::INVENTORY_FILE);
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("usage: cargo run -p conventions [-- inventory [--write]]");
            ExitCode::FAILURE
        }
    }
}

/// The check: the four proofs above, every command with one handler, and the inventory current.
fn check(contract: &Yaml, binding: &Yaml, repository_root: &Path, language_root: &Path) -> ExitCode {
    let mut problems: Vec<String> = Vec::new();
    check_binding(contract, binding, repository_root, language_root, &mut problems);
    let layers = keys(&contract["layers"]);
    check_tree(binding, &layers, language_root, &mut problems);
    let crates = check_graph(contract, binding, &layers, language_root, &mut problems);
    check_files(binding, language_root, &mut problems);
    inventory::check_handlers(binding, language_root, &mut problems);
    inventory::check(repository_root, &inventory::inspect(binding, language_root), &mut problems);

    if problems.is_empty() {
        println!(
            "✓ contract v{}, Rust binding: {} crates are the table, {} contexts match the tree, every file the binding names exists; every command has one handler; the inventory is current.",
            contract["schemaVersion"].as_u64().unwrap_or(0),
            crates,
            strings(&binding["contexts"]).len()
        );
        ExitCode::SUCCESS
    } else {
        for problem in &problems {
            eprintln!("✗ {problem}");
        }
        ExitCode::FAILURE
    }
}

/// The nearest directory at or above `from` holding the contract.
fn repository_root(from: &Path) -> Option<PathBuf> {
    from.ancestors().find(|dir| dir.join(CONTRACT).is_file()).map(Path::to_path_buf)
}

fn yaml(path: &Path) -> Yaml {
    let text = fs::read_to_string(path).unwrap_or_else(|error| panic!("cannot read {}: {error}", path.display()));
    serde_yaml::from_str(&text).unwrap_or_else(|error| panic!("{} is not YAML: {error}", path.display()))
}

fn text(value: &Yaml) -> String {
    value.as_str().unwrap_or_default().to_string()
}

fn strings(value: &Yaml) -> Vec<String> {
    value.as_sequence().map(|items| items.iter().map(text).collect()).unwrap_or_default()
}

fn keys(value: &Yaml) -> Vec<String> {
    value.as_mapping().map(|map| map.keys().map(text).collect()).unwrap_or_default()
}

fn entries(value: &Yaml) -> Vec<(String, &Yaml)> {
    value.as_mapping().map(|map| map.iter().map(|(key, value)| (text(key), value)).collect()).unwrap_or_default()
}

// 1. The binding is this language's

fn check_binding(
    contract: &Yaml,
    binding: &Yaml,
    repository_root: &Path,
    language_root: &Path,
    problems: &mut Vec<String>,
) {
    if text(&binding["language"]) != LANGUAGE {
        problems.push(format!("{BINDING}: \"language\" is {:?}, not {LANGUAGE}", text(&binding["language"])));
    }
    if !strings(&contract["languages"]).iter().any(|language| language == LANGUAGE) {
        problems.push(format!("{CONTRACT}: \"languages\" does not list {LANGUAGE}, so the map does not know it"));
    }
    let root = repository_root.join(text(&binding["root"]));
    if root.canonicalize().ok().as_deref() != Some(language_root) {
        problems.push(format!(
            "{BINDING}: \"root\" says {}, but this tooling runs from {}",
            text(&binding["root"]),
            language_root.display()
        ));
    }
}

// 2. The tree matches the contract

fn directories(dir: &Path) -> Vec<String> {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|entry| entry.path().is_dir())
                .map(|entry| entry.file_name().to_string_lossy().to_string())
                .filter(|name| name != "target")
                .collect()
        })
        .unwrap_or_default()
}

fn check_tree(binding: &Yaml, layers: &[String], language_root: &Path, problems: &mut Vec<String>) {
    let lower: Vec<String> = layers.iter().map(|layer| layer.to_lowercase()).collect();
    let wiring = text(&binding["wiring"]);
    let contexts = strings(&binding["contexts"]);
    let contexts_path = text(&binding["contexts_tree"]["path"]);
    let contexts_dir = language_root.join(&contexts_path);

    for found in directories(&contexts_dir) {
        if !contexts.iter().any(|context| context.to_lowercase() == found) {
            problems.push(format!(
                "ARCH-CONTEXT-DECLARED: {contexts_path}/{found} is not declared in {BINDING}, so no row of the table applies to it"
            ));
        }
    }
    for context in &contexts {
        let dir = contexts_dir.join(context.to_lowercase());
        if !dir.is_dir() {
            problems
                .push(format!("ARCH-CONTEXT-DECLARED: {BINDING} declares the context {context}, which does not exist"));
            continue;
        }
        let parts = directories(&dir);
        for part in &parts {
            if part != &wiring && !lower.contains(part) {
                problems.push(format!(
                    "ARCH-CONTEXT-DECLARED: {contexts_path}/{}/{part} is neither a layer ({}) nor the wiring crate {wiring}",
                    context.to_lowercase(),
                    lower.join(", ")
                ));
            }
        }
        // The wiring binds the handlers: a context that has an Application layer has a wiring crate.
        if parts.iter().any(|part| part == "application") && !parts.iter().any(|part| part == &wiring) {
            problems.push(format!(
                "ARCH-CONTEXT-DECLARED: {contexts_path}/{} has an application layer and no {wiring} crate",
                context.to_lowercase()
            ));
        }
    }
    for tree in ["architecture", "kernel"] {
        let path = text(&binding[tree]["path"]);
        let dir = language_root.join(&path);
        if !dir.is_dir() {
            problems.push(format!("ARCH-TREES: {path} does not exist"));
            continue;
        }
        for found in directories(&dir) {
            if !lower.contains(&found) {
                problems
                    .push(format!("ARCH-TREES: {path}/{found} is not a layer: the tree holds layers and nothing else"));
            }
        }
    }
}

// 3. The crate graph is the table

#[derive(Debug, Clone, PartialEq)]
enum Tree {
    Architecture,
    Kernel,
    Context(String),
    Bootstrap,
}

#[derive(Debug, Clone, PartialEq)]
enum Part {
    Layer(String),
    Wiring,
    Whole,
}

#[derive(Debug)]
struct Crate {
    dir: PathBuf,
    /// Relative to the language root, with `/`.
    rel: String,
    tree: Tree,
    part: Part,
}

fn find_manifests(dir: &Path, into: &mut Vec<PathBuf>) {
    for name in directories(dir) {
        let child = dir.join(name);
        if child.join("Cargo.toml").is_file() {
            into.push(child.clone());
        }
        find_manifests(&child, into);
    }
}

fn relative(language_root: &Path, dir: &Path) -> String {
    dir.strip_prefix(language_root).unwrap_or(dir).to_string_lossy().replace('\\', "/")
}

/// Which tree and which part of it a crate directory is, from the binding's paths.
fn classify(rel: &str, binding: &Yaml, layers: &[String]) -> Result<(Tree, Part), String> {
    let layer_of = |dir: &str| -> Result<Part, String> {
        if dir == text(&binding["wiring"]) {
            return Ok(Part::Wiring);
        }
        layers
            .iter()
            .find(|layer| layer.to_lowercase() == dir)
            .map(|layer| Part::Layer(layer.clone()))
            .ok_or_else(|| format!("{rel} is not a layer crate: {dir} is none of {}", layers.join(", ")))
    };
    let under = |tree: &str| -> Option<String> {
        let path = text(&binding[tree]["path"]);
        rel.strip_prefix(&format!("{path}/")).map(str::to_string)
    };
    if rel == text(&binding["bootstrap"]["path"]) {
        return Ok((Tree::Bootstrap, Part::Whole));
    }
    if let Some(rest) = under("architecture") {
        return Ok((Tree::Architecture, layer_of(&rest)?));
    }
    if let Some(rest) = under("kernel") {
        return Ok((Tree::Kernel, layer_of(&rest)?));
    }
    if let Some(rest) = under("contexts_tree") {
        let (context, part) = rest.split_once('/').ok_or_else(|| format!("{rel} is a crate where only contexts go"))?;
        return Ok((Tree::Context(context.to_string()), layer_of(part)?));
    }
    Err(format!("{rel} is a crate outside every tree the binding names"))
}

/// The unit a dependency is, seen from the crate that depends on it.
fn unit_of(from: &Crate, to: &Crate) -> String {
    let same_tree = from.tree == to.tree;
    let part = match &to.part {
        Part::Layer(layer) => layer.clone(),
        Part::Wiring => "wiring".to_string(),
        Part::Whole => return "bootstrap".to_string(),
    };
    let prefix = match (&to.tree, same_tree) {
        (_, true) => "own",
        (Tree::Architecture, false) => "architecture",
        (Tree::Kernel, false) => "kernel",
        (Tree::Context(_), false) => "others",
        (Tree::Bootstrap, false) => return "bootstrap".to_string(),
    };
    format!("{prefix}.{part}")
}

fn expand(allowed: &[String], layers: &[String]) -> BTreeSet<String> {
    let mut units = BTreeSet::new();
    for unit in allowed {
        if unit == "own.*" {
            units.extend(layers.iter().map(|layer| format!("own.{layer}")));
            units.insert("own.wiring".to_string());
        } else if let Some(prefix) = unit.strip_suffix(".*") {
            units.extend(layers.iter().map(|layer| format!("{prefix}.{layer}")));
        } else {
            units.insert(unit.clone());
        }
    }
    units
}

/// The row of the table a crate is held to, and its id; the specs row is added for dev-dependencies.
/// The bootstrap has no row of its own, and its tests have the end-to-end one.
fn row_of(contract: &Yaml, krate: &Crate, dev: bool) -> Option<(String, Vec<String>)> {
    let entry = match (&krate.part, dev) {
        (Part::Layer(layer), _) => &contract["layers"][layer.as_str()],
        (Part::Wiring, _) => &contract["wiring_file"],
        (Part::Whole, true) => &contract["e2e_specs"],
        (Part::Whole, false) => return None,
    };
    let mut allowed = strings(&entry["may_import"]);
    if dev {
        allowed.extend(strings(&entry["specs"]["may_import"]));
    }
    Some((text(&entry["id"]), allowed))
}

fn check_graph(
    contract: &Yaml,
    binding: &Yaml,
    layers: &[String],
    language_root: &Path,
    problems: &mut Vec<String>,
) -> usize {
    let mut manifests = Vec::new();
    find_manifests(&language_root.join("src"), &mut manifests);
    let mut crates: Vec<Crate> = Vec::new();
    for dir in manifests {
        let rel = relative(language_root, &dir);
        match classify(&rel, binding, layers) {
            Ok((tree, part)) => crates.push(Crate { dir, rel, tree, part }),
            Err(problem) => problems.push(format!("ARCH-CONTEXT-DECLARED: {problem}")),
        }
    }
    let libraries = strings(&binding["libraries"]);

    for krate in &crates {
        let manifest: toml::Value = fs::read_to_string(krate.dir.join("Cargo.toml"))
            .ok()
            .and_then(|text| text.parse().ok())
            .unwrap_or_else(|| panic!("{}/Cargo.toml is not TOML", krate.rel));
        for (section, dev) in [("dependencies", false), ("dev-dependencies", true)] {
            let Some((id, allowed)) = row_of(contract, krate, dev) else { continue };
            let allowed = expand(&allowed, layers);
            let Some(deps) = manifest.get(section).and_then(toml::Value::as_table) else { continue };
            for (name, spec) in deps {
                let path = spec.get("path").and_then(toml::Value::as_str);
                match path {
                    Some(path) => {
                        let target = krate.dir.join(path).canonicalize().unwrap_or_default();
                        let Some(to) = crates.iter().find(|candidate| candidate.dir == target) else {
                            problems.push(format!(
                                "{id}: {}/Cargo.toml depends on {name} at {path}, which is no layer of this workspace",
                                krate.rel
                            ));
                            continue;
                        };
                        let unit = unit_of(krate, to);
                        if !allowed.contains(&unit) {
                            problems.push(format!(
                                "{id}: {}/Cargo.toml depends on {name} ({unit}), which its row of the table does not allow; a layer imports only {}",
                                krate.rel,
                                allowed.iter().cloned().collect::<Vec<_>>().join(", ")
                            ));
                        }
                    }
                    None => {
                        if libraries.contains(name) && !allowed.contains("libraries") {
                            problems.push(format!(
                                "{id}: {}/Cargo.toml depends on {name}, an infrastructure library only an adapter may see",
                                krate.rel
                            ));
                        }
                    }
                }
            }
        }
    }
    crates.len()
}

// 4. Every file the binding names exists

fn check_files(binding: &Yaml, language_root: &Path, problems: &mut Vec<String>) {
    let mut named: Vec<(String, String)> = Vec::new();
    for (id, rule) in entries(&binding["rules"]) {
        for file in strings(&rule["references"]) {
            named.push((format!("rule {id}"), file));
        }
    }
    for (id, concept) in entries(&binding["concepts"]) {
        for file in strings(&concept["canonical"]).into_iter().chain(strings(&concept["examples"])) {
            named.push((format!("concept {id}"), file));
        }
    }
    for (intent, file) in entries(&binding["verbs"]) {
        named.push((format!("verb {intent}"), text(file)));
    }
    for (what, file) in named {
        if !language_root.join(&file).exists() {
            problems.push(format!("ARCH-MAP-IS-REAL: {BINDING} {what} names {file}, which does not exist"));
        }
    }
}
