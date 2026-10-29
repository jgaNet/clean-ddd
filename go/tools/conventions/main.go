// Command conventions is the Go conventions check and import linter: `go run ./tools/conventions`
// from go/, in CI. The contract (conventions/architecture.yaml) says which layer may import
// which; the Go binding (conventions/go.yaml) says where this language keeps its trees. Go's
// compiler holds no boundary between packages of one module, so this tool is both the linter
// and the check, generated from the data the way typescript/eslint.config.js is:
//
//  1. The binding is this language's and the contract knows it (language, languages, root).
//  2. The tree matches the contract: every directory under the contexts tree is a declared
//     context holding only layer packages and its wiring file; the two trees beside the
//     contexts hold only layers (ARCH-CONTEXT-DECLARED, ARCH-TREES).
//  3. Every import of every file is a unit its row of the table allows — own.<Layer>,
//     architecture.<Layer>, kernel.<Layer>, others.<Layer>, the wiring, the bootstrap, the
//     libraries — read with go/parser, never built. A test file (_test.go) adds what its
//     layer's specs row allows; an end-to-end test (bootstrap/*_e2e_test.go) is held to the
//     e2e_specs row; the wiring file to the wiring_file row; a library the binding lists is
//     seen only where `libraries` is allowed (ARCH-INWARD). The standard library is neutral
//     except where the binding names a package of it as a library (net/http, database/sql).
//     A Go import path is always absolute, so ARCH-RELATIVE has nothing to refuse here.
//  4. Every file the binding names exists (ARCH-MAP-IS-REAL). The rendered documents and
//     the links are checked by the TypeScript tooling, which reads every binding.
//  5. The committed inventory (docs/inventory/go.json) is what the tree says the application
//     is — the commands of each context with who may call them, their route, the aggregate
//     they reach and the events it records; the queries; the domain events; the policies and
//     what they publish or reach; the links between contexts — read from the canonical shapes
//     with go/ast (inventory.go), so that the TypeScript check can hold the four inventories
//     equal (ARCH-ONE-APPLICATION). A stale one is refused by a line saying so, then a line
//     per difference, named in the words every language's tool prints.
//  6. Every command has exactly one handler: the Module lists it once, with one handler, and
//     every command a route or a policy builds is one the Module lists; a fact may have any
//     number of subscribers (ARCH-ONE-HANDLER), read from the same wiring the inventory is.
//
// `can-import <file> <import-path> …` answers whether an import would be allowed, naming the
// rule that refuses it. `inventory` prints the inventory as canonical JSON; `inventory --write`
// writes it to docs/inventory/go.json. Every refusal names its rule id first, so a reader or
// `yarn architecture rule <id>` can look it up.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func main() {
	root, err := repositoryRoot()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	contract, err := loadContract(root)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}

	if len(os.Args) > 1 && os.Args[1] == "can-import" {
		os.Exit(canImport(root, contract, os.Args[2:]))
	}
	if len(os.Args) > 1 && os.Args[1] == "inventory" {
		os.Exit(inventoryCommand(root, contract, os.Args[2:]))
	}

	problems := check(root, contract)
	if len(problems) > 0 {
		for _, problem := range problems {
			fmt.Println("✗ " + problem)
		}
		fmt.Printf("\n%d problem(s). `clean-ddd rule <ID>` (`yarn architecture rule <ID>` in the reference) explains a rule.\n", len(problems))
		os.Exit(1)
	}
	fmt.Println(summary(root, contract))
}

// repositoryRoot is the nearest directory at or above the working directory holding the contract.
func repositoryRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, contractFile)); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("%s not found at or above the working directory", contractFile)
		}
		dir = parent
	}
}

func check(root string, contract *Contract) []string {
	var problems []string
	problems = append(problems, checkTree(root, contract)...)
	files, err := sourceFiles(root, contract)
	if err != nil {
		return append(problems, "ARCH-MAP-IS-REAL: "+err.Error())
	}
	for _, file := range files {
		for _, imported := range file.imports {
			if refusal := refuse(contract, file, imported); refusal != "" {
				problems = append(problems, refusal)
			}
		}
	}
	problems = append(problems, checkNamedFiles(root, contract)...)
	problems = append(problems, checkOneHandler(root, contract)...)
	return withInventory(problems, checkInventory(root, contract))
}

// withInventory is the problems sorted, with a stale inventory's lines kept together and in
// their order — the line saying it is stale, then each difference — where the first one sorts.
func withInventory(problems, inventory []string) []string {
	sort.Strings(problems)
	if len(inventory) == 0 {
		return problems
	}
	at := sort.SearchStrings(problems, inventory[0])
	found := append([]string{}, problems[:at]...)
	found = append(found, inventory...)
	return append(found, problems[at:]...)
}

func summary(root string, contract *Contract) string {
	files, _ := sourceFiles(root, contract)
	imports := 0
	for _, file := range files {
		imports += len(file.imports)
	}
	return fmt.Sprintf("✓ contract v%d, Go binding: %d files and %d imports are the table, %d contexts match the tree, every file the binding names exists, every command has one handler; the inventory is current.",
		contract.SchemaVersion, len(files), imports, len(contract.Contexts))
}

func canImport(root string, contract *Contract, args []string) int {
	if len(args) == 0 || len(args)%2 != 0 {
		fmt.Fprintln(os.Stderr, "usage: conventions can-import <file> <import-path> [<file> <import-path> …]")
		return 2
	}
	exit := 0
	for i := 0; i < len(args); i += 2 {
		path, imported := args[i], args[i+1]
		absolute, err := filepath.Abs(path)
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			return 2
		}
		relative, err := filepath.Rel(root, absolute)
		if err != nil || strings.HasPrefix(relative, "..") {
			fmt.Printf("✗ %s is not under the repository\n", path)
			exit = 1
			continue
		}
		file, known := classify(contract, filepath.ToSlash(relative))
		if !known {
			fmt.Printf("✗ %s is not in a tree the binding declares\n", relative)
			exit = 1
			continue
		}
		if refusal := refuse(contract, file, imported); refusal != "" {
			fmt.Println("✗ " + refusal)
			exit = 1
			continue
		}
		fmt.Printf("✓ %s may import %s (%s)\n", relative, imported, describe(contract, imported, file))
	}
	return exit
}
