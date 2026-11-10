package main

import (
	"fmt"
	"go/ast"
	"go/token"
)

const callerRule = "API-CALLER-AT-TRANSPORT"

// checkCallerAtTransport holds a context's routes to API-CALLER-AT-TRANSPORT (ADR 39, H4): a
// command whose outcome is read later is published, and answered 202, only through
// presentation.Accept, which refuses a caller who is not signed in with 401 before anything is
// published. A Presentation file of a context that publishes on the bus by itself (a call to a
// method named Publish or PublishWithID: ctx.Publish, ctx.EventBus().Publish) or answers 202 by
// itself (http.StatusAccepted, the literal 202) would skip that refusal, and is refused here,
// naming the file and the line. The building blocks' Accept is the one place both are written.
func checkCallerAtTransport(root string, contract *Contract) []string {
	tree, err := readTree(root, contract)
	if err != nil {
		return []string{fmt.Sprintf("%s: the routes could not be read from the tree: %s", callerRule, err.Error())}
	}
	var problems []string
	for _, s := range tree.files {
		if s.file.tree != "context" || s.file.layer != "Presentation" {
			continue
		}
		refuse := func(node ast.Node, what string) {
			problems = append(problems, fmt.Sprintf(
				"%s: %s:%d %s by itself; a route answers a command through presentation.Accept(w, r, module, command), which refuses a caller who is not signed in with 401 first",
				callerRule, s.file.path, s.positions.Position(node.Pos()).Line, what))
		}
		ast.Inspect(s.syntax, func(n ast.Node) bool {
			switch node := n.(type) {
			case *ast.CallExpr:
				if selector, ok := node.Fun.(*ast.SelectorExpr); ok && (selector.Sel.Name == "Publish" || selector.Sel.Name == "PublishWithID") {
					refuse(node, "publishes on the bus")
				}
			case *ast.SelectorExpr:
				if node.Sel.Name == "StatusAccepted" {
					refuse(node, "answers 202")
				}
			case *ast.BasicLit:
				if node.Kind == token.INT && node.Value == "202" {
					refuse(node, "answers 202")
				}
			}
			return true
		})
	}
	return problems
}
