package main

import (
	"fmt"
	"go/ast"
	"path"
)

const clockRule = "DOMAIN-ONE-CLOCK"

// systemClockFile is the one file of the tree that reads the machine's time: the building
// blocks' system clock, in their Infrastructure layer.
const systemClockFile = "system_clock.go"

// machineTime is what reads the machine's time in package time: Now, and Since and Until,
// which read it to compare.
var machineTime = map[string]bool{"Now": true, "Since": true, "Until": true}

// checkOneClock holds the tree to DOMAIN-ONE-CLOCK (ADR 42): an application has one now, the
// clock its wiring passes, and nothing but the building blocks' system clock reads the
// machine's time. A file of the tree (the tests aside) that names time.Now, time.Since or
// time.Until — called, or handed on as a function, which would be a second system clock — is
// refused, naming the file and the line. A time parsed or built from a value (time.Parse,
// time.Date, time.Unix) is not a read of the machine and is allowed everywhere.
func checkOneClock(root string, contract *Contract) []string {
	tree, err := readTree(root, contract)
	if err != nil {
		return []string{fmt.Sprintf("%s: the tree could not be read: %s", clockRule, err.Error())}
	}
	var problems []string
	for _, s := range tree.files {
		if s.file.tree == "architecture" && s.file.layer == "Infrastructure" && path.Base(s.file.path) == systemClockFile {
			continue
		}
		timePackage := ""
		for local, imported := range s.imports {
			if imported == "time" {
				timePackage = local
			}
		}
		if timePackage == "" {
			continue
		}
		ast.Inspect(s.syntax, func(n ast.Node) bool {
			selector, ok := n.(*ast.SelectorExpr)
			if !ok || !machineTime[selector.Sel.Name] {
				return true
			}
			if pkg, ok := selector.X.(*ast.Ident); ok && pkg.Name == timePackage && pkg.Obj == nil {
				problems = append(problems, fmt.Sprintf(
					"%s: %s:%d reads the machine's time (time.%s); take an application.Clock in the constructor, pass it from the wiring (infrastructure.SystemClock), and hand clock() to the domain as a parameter — `yarn --cwd .. architecture rule %s`",
					clockRule, s.file.path, s.positions.Position(selector.Pos()).Line, selector.Sel.Name, clockRule))
			}
			return true
		})
	}
	return problems
}
