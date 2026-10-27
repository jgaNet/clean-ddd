package main

import (
	"fmt"
	"go/parser"
	"go/token"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
)

// A file of the source tree, classified: which tree it belongs to, which layer, whether it is
// the wiring, a test, an end-to-end test.
type file struct {
	path    string // repository-relative, forward slashes
	tree    string // architecture | kernel | context | bootstrap
	context string
	layer   string // the contract's name (Domain); "" for the wiring or the bootstrap
	wiring  bool
	spec    bool
	e2e     bool
	imports []string
}

// classify says what a repository-relative path is in this language, or false when it is in no
// tree the binding declares (the tools, the module file).
func classify(contract *Contract, repoPath string) (file, bool) {
	f := file{path: repoPath}
	relative, ok := strings.CutPrefix(repoPath, contract.Root+"/")
	if !ok {
		return f, false
	}
	f.spec = strings.HasSuffix(relative, "_test.go")
	switch {
	case under(relative, contract.ContextsTree):
		rest := strings.TrimPrefix(relative, contract.ContextsTree+"/")
		parts := strings.Split(rest, "/")
		f.tree, f.context = "context", parts[0]
		if len(parts) == 2 {
			f.wiring = true
			return f, true
		}
		if len(parts) > 2 {
			f.layer = layerOf(contract, parts[1])
		}
		return f, true
	case under(relative, contract.Architecture):
		f.tree = "architecture"
		f.layer = layerOf(contract, firstDir(strings.TrimPrefix(relative, contract.Architecture+"/")))
		return f, true
	case under(relative, contract.Kernel):
		f.tree = "kernel"
		f.layer = layerOf(contract, firstDir(strings.TrimPrefix(relative, contract.Kernel+"/")))
		return f, true
	case under(relative, contract.Bootstrap):
		f.tree = "bootstrap"
		f.e2e = strings.HasSuffix(relative, "_e2e_test.go")
		return f, true
	}
	return f, false
}

func under(relative, dir string) bool { return strings.HasPrefix(relative, dir+"/") }

// firstDir is the first segment of a path: the directory, or the whole when there is none.
func firstDir(rest string) string {
	if i := strings.Index(rest, "/"); i >= 0 {
		return rest[:i]
	}
	return rest
}

// unit resolves an import path to a word of the contract's vocabulary, relative to the file
// that imports it: own.<Layer>, architecture.<Layer>, kernel.<Layer>, others.<Layer>,
// own.wiring, others.wiring, bootstrap, libraries, tools, stdlib (neutral), or module (unknown
// path inside the module).
func unit(contract *Contract, imported string, from file) string {
	if isLibrary(contract, imported) {
		return "libraries"
	}
	relative, inside := strings.CutPrefix(imported, contract.ModulePath+"/")
	if !inside {
		if imported == contract.ModulePath {
			return "module"
		}
		if !strings.Contains(firstDir(imported+"/"), ".") {
			return "stdlib"
		}
		return "external"
	}
	switch {
	case under(relative, contract.ContextsTree):
		parts := strings.Split(strings.TrimPrefix(relative, contract.ContextsTree+"/"), "/")
		whose := "others"
		if from.tree == "context" && from.context == parts[0] {
			whose = "own"
		}
		if len(parts) == 1 {
			return whose + ".wiring"
		}
		if layer := layerOf(contract, parts[1]); layer != "" {
			return whose + "." + layer
		}
		return "module"
	case under(relative, contract.Architecture):
		if layer := layerOf(contract, firstDir(strings.TrimPrefix(relative, contract.Architecture+"/"))); layer != "" {
			if from.tree == "architecture" {
				return "own." + layer
			}
			return "architecture." + layer
		}
	case under(relative, contract.Kernel):
		if layer := layerOf(contract, firstDir(strings.TrimPrefix(relative, contract.Kernel+"/"))); layer != "" {
			if from.tree == "kernel" {
				return "own." + layer
			}
			return "kernel." + layer
		}
	case relative == contract.Bootstrap || under(relative, contract.Bootstrap):
		return "bootstrap"
	case strings.HasPrefix(relative, "tools"):
		return "tools"
	}
	return "module"
}

func isLibrary(contract *Contract, imported string) bool {
	for _, library := range contract.Libraries {
		if imported == library || strings.HasPrefix(imported, library+"/") {
			return true
		}
	}
	return false
}

// refuse is the rule a file breaks by importing a path, or "" when its row allows it.
func refuse(contract *Contract, f file, imported string) string {
	u := unit(contract, imported, f)
	switch u {
	case "stdlib", "external":
		return ""
	case "tools":
		return fmt.Sprintf("ARCH-INWARD: %s imports %s: the tools are nobody's dependency", f.path, imported)
	case "module":
		return fmt.Sprintf("ARCH-CONTEXT-DECLARED: %s imports %s, which is in no tree the binding declares", f.path, imported)
	}
	id, allowed := rowFor(contract, f)
	if f.tree == "bootstrap" && !f.e2e {
		return "" // the composition root may import everything
	}
	// The building blocks import nothing outside themselves; the kernel no context (ARCH-TREES).
	if f.tree == "architecture" && (strings.HasPrefix(u, "kernel.") || strings.HasPrefix(u, "others.") || u == "bootstrap") {
		return fmt.Sprintf("ARCH-TREES: %s imports %s: the building blocks import nothing outside themselves", f.path, imported)
	}
	if f.tree == "kernel" && (strings.HasPrefix(u, "others.") || u == "bootstrap") {
		return fmt.Sprintf("ARCH-TREES: %s imports %s: the shared kernel imports no context", f.path, imported)
	}
	for _, word := range allowed {
		if word == u || matchesWildcard(word, u) {
			return ""
		}
	}
	return fmt.Sprintf("%s: %s imports %s (%s), which its row does not allow", id, f.path, imported, u)
}

// rowFor is the row of the table a file is held to: its layer's, plus the specs row for a
// test, the wiring row, the e2e row.
func rowFor(contract *Contract, f file) (string, []string) {
	switch {
	case f.e2e:
		return contract.E2E.id, contract.E2E.mayImport
	case f.wiring:
		return contract.Wiring_.id, contract.Wiring_.mayImport
	case f.tree == "bootstrap":
		return "ARCH-E2E", nil
	}
	layer, ok := contract.Layers[f.layer]
	if !ok {
		return "ARCH-CONTEXT-DECLARED", nil
	}
	allowed := append([]string(nil), layer.mayImport...)
	if f.spec {
		if specs, ok := contract.Layers[f.layer+".specs"]; ok {
			allowed = append(allowed, specs.mayImport...)
		}
	}
	return layer.id, allowed
}

// own.* in the wiring row means every layer and the wiring of the same tree.
func matchesWildcard(word, u string) bool {
	prefix, ok := strings.CutSuffix(word, ".*")
	return ok && strings.HasPrefix(u, prefix+".")
}

func describe(contract *Contract, imported string, from file) string {
	return unit(contract, imported, from)
}

// sourceFiles reads every Go file of the language's trees with its imports, never building it.
func sourceFiles(root string, contract *Contract) ([]file, error) {
	var files []file
	base := filepath.Join(root, filepath.FromSlash(contract.Root))
	err := filepath.WalkDir(base, func(p string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") {
			return nil
		}
		relative, _ := filepath.Rel(root, p)
		f, known := classify(contract, filepath.ToSlash(relative))
		if !known {
			return nil
		}
		parsed, err := parser.ParseFile(token.NewFileSet(), p, nil, parser.ImportsOnly)
		if err != nil {
			return fmt.Errorf("%s: %w", relative, err)
		}
		for _, spec := range parsed.Imports {
			value, _ := strconv.Unquote(spec.Path.Value)
			f.imports = append(f.imports, value)
		}
		files = append(files, f)
		return nil
	})
	return files, err
}

// checkTree proves the trees have the shape the contract describes.
func checkTree(root string, contract *Contract) []string {
	var problems []string
	base := filepath.Join(root, filepath.FromSlash(contract.Root))
	contexts := filepath.Join(base, filepath.FromSlash(contract.ContextsTree))
	entries, err := os.ReadDir(contexts)
	if err != nil {
		return []string{"ARCH-CONTEXT-DECLARED: " + err.Error()}
	}
	declared := map[string]bool{}
	for _, context := range contract.Contexts {
		declared[strings.ToLower(context)] = true
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			problems = append(problems, fmt.Sprintf("ARCH-CONTEXT-DECLARED: %s/%s is not a context directory", contract.ContextsTree, entry.Name()))
			continue
		}
		if !declared[entry.Name()] {
			problems = append(problems, fmt.Sprintf("ARCH-CONTEXT-DECLARED: %s/%s is not declared in %s", contract.ContextsTree, entry.Name(), bindingFile))
			continue
		}
		inside, _ := os.ReadDir(filepath.Join(contexts, entry.Name()))
		for _, item := range inside {
			switch {
			case item.IsDir() && layerOf(contract, item.Name()) != "":
			case !item.IsDir() && strings.HasSuffix(item.Name(), ".go"):
				// the wiring file, and its test
			default:
				problems = append(problems, fmt.Sprintf("ARCH-CONTEXT-DECLARED: %s/%s/%s is neither a layer nor the wiring", contract.ContextsTree, entry.Name(), item.Name()))
			}
		}
	}
	for _, context := range contract.Contexts {
		if _, err := os.Stat(filepath.Join(contexts, strings.ToLower(context))); err != nil {
			problems = append(problems, fmt.Sprintf("ARCH-CONTEXT-DECLARED: context %s is declared but %s/%s does not exist", context, contract.ContextsTree, strings.ToLower(context)))
		}
	}
	for _, treePath := range []string{contract.Architecture, contract.Kernel} {
		inside, err := os.ReadDir(filepath.Join(base, filepath.FromSlash(treePath)))
		if err != nil {
			problems = append(problems, "ARCH-TREES: "+err.Error())
			continue
		}
		for _, item := range inside {
			if !item.IsDir() || layerOf(contract, item.Name()) == "" {
				problems = append(problems, fmt.Sprintf("ARCH-TREES: %s/%s is not a layer", treePath, item.Name()))
			}
		}
	}
	return problems
}

// checkNamedFiles proves every file the binding names exists (ARCH-MAP-IS-REAL).
func checkNamedFiles(root string, contract *Contract) []string {
	var problems []string
	for _, named := range contract.NamedFiles {
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(named))); err != nil {
			problems = append(problems, fmt.Sprintf("ARCH-MAP-IS-REAL: %s names %s, which does not exist", bindingFile, named))
		}
	}
	_ = path.Join
	return problems
}
