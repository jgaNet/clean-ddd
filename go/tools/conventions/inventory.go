package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// The inventory: what the Go tree says the application is, in words every language shares — the
// commands of each context with who may call them, their route, the aggregate they reach and the
// events it records; the queries; the domain events; the policies, what they react to and what
// they publish or reach; the links between contexts. Nothing Go owns is in it: no file, no
// package, no idiom. `go run ./tools/conventions inventory` prints it as canonical JSON,
// `--write` writes it to docs/inventory/go.json, and the plain check holds the committed file
// to what the tree renders (ARCH-ONE-APPLICATION); the TypeScript check holds the inventories
// of every language equal.
//
// It is read with go/parser and go/ast from the canonical shapes the guides teach, never by
// building the tree: a wiring file that lists its commands, queries and subscriptions as data
// (ARCH-MODULES-DATA); an aggregate (a struct embedding domain.AggregateRoot) whose behaviours
// Record() their events (DOMAIN-RECORDS-EVENTS); a handler that asks kernel.RequireSignedIn()
// or guards with a Guard() on a role, reaches a behaviour directly or through a service, and
// publishes an integration event with ctx.Publish(); a routes file whose mux.HandleFunc()
// patterns build the command or name the query handler they carry. A shape it does not
// recognise is a shape the guides do not teach; the remedy is the canonical shape, not a looser
// reading. The names are the public ones the API and the Tracker use (API-ONE-SURFACE): the
// type name without the suffix of its kind.

const (
	inventoryFile      = "docs/inventory/go.json"
	inventoryRule      = "ARCH-ONE-APPLICATION"
	inventoryWrite     = "go run ./tools/conventions inventory --write"
	inventorySchema    = 1
	actorAdministrator = "an administrator"
	actorSignedIn      = "a signed-in account"
	actorAnyone        = "anyone"
)

// The schema, with the fields in the canonical order every language writes.

type Inventory struct {
	SchemaVersion int                `json:"schemaVersion"`
	Language      string             `json:"language"`
	Contexts      []InventoryContext `json:"contexts"`
	Links         []InventoryLink    `json:"links"`
}

type InventoryContext struct {
	ID       string             `json:"id"`
	Commands []InventoryCommand `json:"commands"`
	Queries  []InventoryQuery   `json:"queries"`
	Events   []string           `json:"events"`
	Policies []InventoryPolicy  `json:"policies"`
}

type InventoryCommand struct {
	Name  string `json:"name"`
	Actor string `json:"actor"`
	// Route is `VERB /path`, every path parameter spelled `{param}`; absent when no route carries the command.
	Route     string   `json:"route,omitempty"`
	Aggregate string   `json:"aggregate,omitempty"`
	Events    []string `json:"events"`
}

type InventoryQuery struct {
	Name  string `json:"name"`
	Actor string `json:"actor"`
	Route string `json:"route,omitempty"`
}

type InventoryPolicy struct {
	On        string   `json:"on"`
	Kind      string   `json:"kind"` // domain-event | integration-event | every-operation
	Publishes []string `json:"publishes"`
	Events    []string `json:"events"`
}

type InventoryLink struct {
	Mechanism  string   `json:"mechanism"`
	Upstream   string   `json:"upstream"`
	Downstream string   `json:"downstream"`
	Contracts  []string `json:"contracts"`
}

// serializeInventory is the canonical JSON: two-space indentation, the keys in the order of the
// structs, nothing escaped, a trailing newline. The same bytes from every language's tool.
func serializeInventory(inventory *Inventory) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(inventory); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

// inventoryCommand is `inventory [--write]`: the JSON on stdout, or written to docs/inventory/go.json.
func inventoryCommand(root string, contract *Contract, args []string) int {
	write := false
	for _, arg := range args {
		if arg != "--write" {
			fmt.Fprintln(os.Stderr, "usage: conventions inventory [--write]")
			return 2
		}
		write = true
	}
	rendered, err := renderInventory(root, contract)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	if !write {
		fmt.Print(string(rendered))
		return 0
	}
	target := filepath.Join(root, filepath.FromSlash(inventoryFile))
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	if err := os.WriteFile(target, rendered, 0o644); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 2
	}
	fmt.Printf("✓ %s written from the Go tree.\n", inventoryFile)
	return 0
}

// checkInventory proves the committed inventory is what the tree renders now (ARCH-ONE-APPLICATION).
func checkInventory(root string, contract *Contract) []string {
	rendered, err := renderInventory(root, contract)
	if err != nil {
		return []string{fmt.Sprintf("%s: the inventory could not be read from the tree: %s", inventoryRule, err.Error())}
	}
	committed, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(inventoryFile)))
	if err != nil {
		return []string{fmt.Sprintf("%s: %s is missing; run `%s` and commit it", inventoryRule, inventoryFile, inventoryWrite)}
	}
	if !bytes.Equal(committed, rendered) {
		return []string{fmt.Sprintf("%s: %s differs from what the Go tree says; run `%s` and commit it (fix the tree that differs from the other languages, never the inventory)",
			inventoryRule, inventoryFile, inventoryWrite)}
	}
	return nil
}

func renderInventory(root string, contract *Contract) ([]byte, error) {
	inventory, err := inspectInventory(root, contract)
	if err != nil {
		return nil, err
	}
	return serializeInventory(inventory)
}

// ---------------------------------------------------------------------------------------------
// The tree, parsed once: every non-test Go file of the declared trees, with its package and
// what each import is called in it.

type source struct {
	file    file
	pkg     string // the import path of its package
	syntax  *ast.File
	imports map[string]string // the local name of each import → its path
}

type sourceTree struct {
	contract *Contract
	files    []*source
	packages map[string][]*source // import path → its files
}

func readTree(root string, contract *Contract) (*sourceTree, error) {
	tree := &sourceTree{contract: contract, packages: map[string][]*source{}}
	names := map[string]string{}
	base := filepath.Join(root, filepath.FromSlash(contract.Root))
	err := filepath.WalkDir(base, func(p string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			return nil
		}
		relative, _ := filepath.Rel(root, p)
		f, known := classify(contract, filepath.ToSlash(relative))
		if !known {
			return nil
		}
		syntax, err := parser.ParseFile(token.NewFileSet(), p, nil, 0)
		if err != nil {
			return fmt.Errorf("%s: %w", relative, err)
		}
		inside, _ := insideRoot(contract, f.path)
		s := &source{file: f, pkg: contract.ModulePath + "/" + path.Dir(inside), syntax: syntax}
		tree.files = append(tree.files, s)
		tree.packages[s.pkg] = append(tree.packages[s.pkg], s)
		names[s.pkg] = syntax.Name.Name
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, s := range tree.files {
		s.imports = map[string]string{}
		for _, spec := range s.syntax.Imports {
			imported, _ := strconv.Unquote(spec.Path.Value)
			local := path.Base(imported)
			if name, known := names[imported]; known {
				local = name
			}
			if spec.Name != nil {
				if spec.Name.Name == "_" || spec.Name.Name == "." {
					continue
				}
				local = spec.Name.Name
			}
			s.imports[local] = imported
		}
	}
	return tree, nil
}

// contextFiles is every file of one context, in walk order.
func (t *sourceTree) contextFiles(context string) []*source {
	var found []*source
	for _, s := range t.files {
		if s.file.tree == "context" && strings.EqualFold(s.file.context, context) {
			found = append(found, s)
		}
	}
	return found
}

// typeRef is a type expression's package (as the file calls it, "" for its own) and type name,
// pointers unwrapped: `*note.Note` → ("note", "Note").
func typeRef(expr ast.Expr) (local, name string) {
	switch e := expr.(type) {
	case *ast.StarExpr:
		return typeRef(e.X)
	case *ast.ParenExpr:
		return typeRef(e.X)
	case *ast.SelectorExpr:
		if x, ok := e.X.(*ast.Ident); ok {
			return x.Name, e.Sel.Name
		}
		return "", e.Sel.Name
	case *ast.Ident:
		return "", e.Name
	case *ast.IndexExpr:
		return typeRef(e.X)
	case *ast.IndexListExpr:
		return typeRef(e.X)
	}
	return "", ""
}

// packageOf resolves the package a type expression names, from this file: its own, or an import's.
func (s *source) packageOf(local string) string {
	if local == "" {
		return s.pkg
	}
	if imported, ok := s.imports[local]; ok {
		return imported
	}
	return ""
}

// embeds says whether a struct embeds the building blocks' marker of that name (AggregateRoot,
// DomainEvent, IntegrationEvent): an anonymous field naming a type of the architecture tree.
func (t *sourceTree) embeds(s *source, st *ast.StructType, marker string) bool {
	architecture := t.contract.ModulePath + "/" + t.contract.Architecture + "/"
	for _, field := range st.Fields.List {
		if len(field.Names) != 0 {
			continue
		}
		local, name := typeRef(field.Type)
		if name == marker && strings.HasPrefix(s.packageOf(local), architecture) {
			return true
		}
	}
	return false
}

type namedType struct {
	name string
	spec ast.Expr
}

// typesOf is every type a file declares.
func typesOf(s *source) []namedType {
	var found []namedType
	for _, decl := range s.syntax.Decls {
		general, ok := decl.(*ast.GenDecl)
		if !ok || general.Tok != token.TYPE {
			continue
		}
		for _, spec := range general.Specs {
			if ts, ok := spec.(*ast.TypeSpec); ok {
				found = append(found, namedType{name: ts.Name.Name, spec: ts.Type})
			}
		}
	}
	return found
}

func funcsOf(s *source) []*ast.FuncDecl {
	var found []*ast.FuncDecl
	for _, decl := range s.syntax.Decls {
		if fn, ok := decl.(*ast.FuncDecl); ok {
			found = append(found, fn)
		}
	}
	return found
}

// receiverOf is the type a method is declared on, "" for a function.
func receiverOf(fn *ast.FuncDecl) string {
	if fn.Recv == nil || len(fn.Recv.List) == 0 {
		return ""
	}
	_, name := typeRef(fn.Recv.List[0].Type)
	return name
}

// methodsOf is every method of a type, across the files of its package.
func (t *sourceTree) methodsOf(pkg, typeName string) []*ast.FuncDecl {
	var found []*ast.FuncDecl
	for _, s := range t.packages[pkg] {
		for _, fn := range funcsOf(s) {
			if receiverOf(fn) == typeName {
				found = append(found, fn)
			}
		}
	}
	return found
}

// declaring is the file of a package that declares a type, or nil.
func (t *sourceTree) declaring(pkg, typeName string) *source {
	for _, s := range t.packages[pkg] {
		for _, each := range typesOf(s) {
			if each.name == typeName {
				return s
			}
		}
	}
	return nil
}

// The public name of a message: its intent or its fact, without the suffix of its kind
// (ShareNote, NoteShared, OperationComplete), as domain.PublicName strips it.
func publicName(name string) string {
	for _, suffix := range []string{"CommandEvent", "IntegrationEvent", "Event"} {
		if strings.HasSuffix(name, suffix) {
			return strings.TrimSuffix(name, suffix)
		}
	}
	return name
}

// handlerName is a handler's public name: its type without `Handler`, its constructor without `New` too.
func handlerName(name string) string {
	return strings.TrimSuffix(strings.TrimPrefix(name, "New"), "Handler")
}

func unique(values []string) []string {
	seen := map[string]bool{}
	found := []string{}
	for _, value := range values {
		if !seen[value] {
			seen[value] = true
			found = append(found, value)
		}
	}
	return found
}

func sorted(values []string) []string {
	found := append([]string{}, values...)
	sort.Strings(found)
	return found
}

func usesIdent(node ast.Node, name string) bool {
	found := false
	ast.Inspect(node, func(n ast.Node) bool {
		if ident, ok := n.(*ast.Ident); ok && ident.Name == name {
			found = true
		}
		return !found
	})
	return found
}

// compositeTypes is every composite literal's type in a node whose name has the suffix.
func compositeTypes(node ast.Node, suffix string) []string {
	var found []string
	ast.Inspect(node, func(n ast.Node) bool {
		if literal, ok := n.(*ast.CompositeLit); ok && literal.Type != nil {
			if _, name := typeRef(literal.Type); strings.HasSuffix(name, suffix) {
				found = append(found, name)
			}
		}
		return true
	})
	return found
}

// callsMethod says whether a node calls a method of that name on anything (`x.Share(`).
func callsMethod(node ast.Node, name string) bool {
	found := false
	ast.Inspect(node, func(n ast.Node) bool {
		if call, ok := n.(*ast.CallExpr); ok {
			if sel, ok := call.Fun.(*ast.SelectorExpr); ok && sel.Sel.Name == name {
				found = true
			}
		}
		return !found
	})
	return found
}

// ---------------------------------------------------------------------------------------------
// Constant strings: a route pattern, a mount, read from `"POST " + prefix + "/{id}/share"` with
// the function's assignments (`auth := prefix + "/auth"`) and what the caller passed for its
// string parameters. What is not a constant (a setting) is "".

type scope struct {
	base map[string]string
	vars map[string]ast.Expr
}

// scopeOf is the assignments of a function, with each string parameter bound to `params`.
func scopeOf(fn *ast.FuncDecl, params string) *scope {
	found := &scope{base: map[string]string{}, vars: map[string]ast.Expr{}}
	if fn.Type.Params != nil {
		for _, field := range fn.Type.Params.List {
			if ident, ok := field.Type.(*ast.Ident); ok && ident.Name == "string" {
				for _, name := range field.Names {
					found.base[name.Name] = params
				}
			}
		}
	}
	if fn.Body == nil {
		return found
	}
	ast.Inspect(fn.Body, func(n ast.Node) bool {
		switch stmt := n.(type) {
		case *ast.AssignStmt:
			if len(stmt.Lhs) == len(stmt.Rhs) {
				for i, left := range stmt.Lhs {
					if ident, ok := left.(*ast.Ident); ok {
						if _, seen := found.vars[ident.Name]; !seen {
							found.vars[ident.Name] = stmt.Rhs[i]
						}
					}
				}
			}
		case *ast.ValueSpec:
			if len(stmt.Names) == len(stmt.Values) {
				for i, name := range stmt.Names {
					if _, seen := found.vars[name.Name]; !seen {
						found.vars[name.Name] = stmt.Values[i]
					}
				}
			}
		}
		return true
	})
	return found
}

func (sc *scope) eval(expr ast.Expr, depth int) string {
	if depth > 8 {
		return ""
	}
	switch e := expr.(type) {
	case *ast.BasicLit:
		if e.Kind == token.STRING {
			value, _ := strconv.Unquote(e.Value)
			return value
		}
	case *ast.ParenExpr:
		return sc.eval(e.X, depth)
	case *ast.BinaryExpr:
		if e.Op == token.ADD {
			return sc.eval(e.X, depth) + sc.eval(e.Y, depth)
		}
	case *ast.Ident:
		if value, ok := sc.base[e.Name]; ok {
			return value
		}
		if value, ok := sc.vars[e.Name]; ok {
			return sc.eval(value, depth+1)
		}
	}
	return ""
}

var pathParameter = regexp.MustCompile(`\{[^}]*\}`)

// canonicalRoute is a route as every language spells it: the verb, the path, each parameter as `{param}`.
func canonicalRoute(pattern string) string {
	verb, p, found := strings.Cut(pattern, " ")
	if !found {
		return ""
	}
	p = strings.TrimSpace(p)
	if p == "" {
		p = "/"
	}
	p = strings.TrimSuffix(path.Clean("/"+p), "/")
	if p == "" {
		p = "/"
	}
	return strings.ToUpper(verb) + " " + pathParameter.ReplaceAllString(p, "{param}")
}

// ---------------------------------------------------------------------------------------------
// One context's stickies.

type aggregate struct {
	name, pkg string
}

type behaviour struct {
	aggregate string
	name      string
	pkg       string
	method    bool // a method of the aggregate, or a package function (Create, Register)
	events    []string
}

type serviceMethod struct {
	typeName   string
	pkg        string
	method     string
	behaviours []behaviour
}

type handlerRef struct {
	pkg      string
	typeName string
	source   *source // the file declaring the type, nil when not found
}

type contextShapes struct {
	tree       *sourceTree
	files      []*source
	aggregates []aggregate
	behaviours []behaviour
	services   []serviceMethod
}

func (t *sourceTree) shapesOf(context string) *contextShapes {
	shapes := &contextShapes{tree: t, files: t.contextFiles(context)}

	// Aggregates: a struct embedding AggregateRoot, in the context's Domain.
	for _, s := range shapes.files {
		if s.file.layer != "Domain" {
			continue
		}
		for _, each := range typesOf(s) {
			if st, ok := each.spec.(*ast.StructType); ok && t.embeds(s, st, "AggregateRoot") {
				shapes.aggregates = append(shapes.aggregates, aggregate{name: each.name, pkg: s.pkg})
			}
		}
	}

	// Behaviours: a function of the aggregate's package that Record()s an event — a method of
	// the aggregate, or a package function that returns it (Create, Register).
	for _, root := range shapes.aggregates {
		for _, s := range t.packages[root.pkg] {
			for _, fn := range funcsOf(s) {
				if fn.Body == nil {
					continue
				}
				events := recordedEvents(fn.Body)
				if len(events) == 0 {
					continue
				}
				if receiver := receiverOf(fn); receiver != "" {
					if receiver == root.name {
						shapes.behaviours = append(shapes.behaviours, behaviour{aggregate: root.name, name: fn.Name.Name, pkg: s.pkg, method: true, events: events})
					}
					continue
				}
				if fn.Type.Results != nil && len(fn.Type.Results.List) > 0 {
					if _, name := typeRef(fn.Type.Results.List[0].Type); name == root.name {
						shapes.behaviours = append(shapes.behaviours, behaviour{aggregate: root.name, name: fn.Name.Name, pkg: s.pkg, events: events})
					}
				}
			}
		}
	}

	// Services: a method of any other type (a domain service, an application service) that
	// reaches a behaviour; a handler is not a service.
	for _, s := range shapes.files {
		for _, fn := range funcsOf(s) {
			receiver := receiverOf(fn)
			if receiver == "" || fn.Body == nil || strings.HasSuffix(receiver, "Handler") || shapes.isAggregate(receiver) {
				continue
			}
			if reached := shapes.behavioursIn(s, fn.Body); len(reached) > 0 {
				shapes.services = append(shapes.services, serviceMethod{typeName: receiver, pkg: s.pkg, method: fn.Name.Name, behaviours: reached})
			}
		}
	}
	return shapes
}

func (c *contextShapes) isAggregate(name string) bool {
	for _, each := range c.aggregates {
		if each.name == name {
			return true
		}
	}
	return false
}

// recordedEvents is what a body Record()s, by public name: `n.Record(NoteSharedEvent{...})`.
func recordedEvents(body ast.Node) []string {
	var found []string
	ast.Inspect(body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok || len(call.Args) != 1 {
			return true
		}
		if sel, ok := call.Fun.(*ast.SelectorExpr); !ok || sel.Sel.Name != "Record" {
			return true
		}
		arg := call.Args[0]
		if unary, ok := arg.(*ast.UnaryExpr); ok {
			arg = unary.X
		}
		if literal, ok := arg.(*ast.CompositeLit); ok && literal.Type != nil {
			if _, name := typeRef(literal.Type); strings.HasSuffix(name, "Event") {
				found = append(found, publicName(name))
			}
		}
		return true
	})
	return unique(found)
}

// behavioursIn is every behaviour a body reaches: a method called on anything (`n.ShareWith(`),
// a package function called through the aggregate's package (`note.Create(`) or bare from
// inside it (`Register(`).
func (c *contextShapes) behavioursIn(s *source, body ast.Node) []behaviour {
	var found []behaviour
	add := func(b behaviour) {
		for _, each := range found {
			if each.aggregate == b.aggregate && each.name == b.name {
				return
			}
		}
		found = append(found, b)
	}
	ast.Inspect(body, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		switch fun := call.Fun.(type) {
		case *ast.SelectorExpr:
			if x, ok := fun.X.(*ast.Ident); ok {
				if imported, isPackage := s.imports[x.Name]; isPackage {
					for _, b := range c.behaviours {
						if !b.method && b.pkg == imported && b.name == fun.Sel.Name {
							add(b)
						}
					}
					return true
				}
			}
			for _, b := range c.behaviours {
				if b.method && b.name == fun.Sel.Name {
					add(b)
				}
			}
		case *ast.Ident:
			for _, b := range c.behaviours {
				if !b.method && b.pkg == s.pkg && b.name == fun.Name {
					add(b)
				}
			}
		}
		return true
	})
	return found
}

// mentionsType says whether a file names a type of a package (`*note.Sharing`, or `Sharing` from inside it).
func mentionsType(s *source, pkg, name string) bool {
	found := false
	ast.Inspect(s.syntax, func(n ast.Node) bool {
		switch e := n.(type) {
		case *ast.SelectorExpr:
			if x, ok := e.X.(*ast.Ident); ok && e.Sel.Name == name && s.imports[x.Name] == pkg {
				found = true
			}
		case *ast.Ident:
			if e.Name == name && s.pkg == pkg {
				found = true
			}
		}
		return !found
	})
	return found
}

// through is the service methods a file goes through: it names the service and calls the method.
func (c *contextShapes) through(s *source) []serviceMethod {
	var found []serviceMethod
	for _, service := range c.services {
		if mentionsType(s, service.pkg, service.typeName) && callsMethod(s.syntax, service.method) {
			found = append(found, service)
		}
	}
	return found
}

type analysis struct {
	aggregate string
	events    []string
}

// analyse is what a handler's file reaches: the behaviours, directly or through a service, and
// the events they record; the aggregate is the first behaviour's, or one the file names.
func (c *contextShapes) analyse(s *source) analysis {
	if s == nil {
		return analysis{events: []string{}}
	}
	behaviours := c.behavioursIn(s, s.syntax)
	for _, service := range c.through(s) {
		for _, b := range service.behaviours {
			duplicate := false
			for _, each := range behaviours {
				if each.aggregate == b.aggregate && each.name == b.name {
					duplicate = true
				}
			}
			if !duplicate {
				behaviours = append(behaviours, b)
			}
		}
	}
	found := analysis{events: []string{}}
	for _, b := range behaviours {
		found.events = append(found.events, b.events...)
	}
	found.events = unique(found.events)
	if len(behaviours) > 0 {
		found.aggregate = behaviours[0].aggregate
	} else {
		for _, each := range c.aggregates {
			if mentionsType(s, each.pkg, each.name) {
				found.aggregate = each.name
				break
			}
		}
	}
	return found
}

// actorOf is who may call: RequireSignedIn() says a signed-in account (an administrator may see
// more, the handler says so itself); a Guard() that names the administrator role alone says an
// administrator; a guard on any other role says a signed-in account; nothing says anyone.
func actorOf(s *source) string {
	if s == nil {
		return actorAnyone
	}
	if usesIdent(s.syntax, "RequireSignedIn") {
		return actorSignedIn
	}
	for _, fn := range funcsOf(s) {
		if fn.Name.Name != "Guard" || receiverOf(fn) == "" || fn.Body == nil {
			continue
		}
		admin, user, role := false, false, false
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			if ident, ok := n.(*ast.Ident); ok {
				switch {
				case ident.Name == "RoleAdmin":
					admin, role = true, true
				case ident.Name == "RoleUser":
					user, role = true, true
				case strings.HasPrefix(ident.Name, "Role"):
					role = true
				}
			}
			return true
		})
		if admin && !user {
			return actorAdministrator
		}
		if role {
			return actorSignedIn
		}
	}
	return actorAnyone
}

// executeParam is the public name of what a handler's Execute takes first: its command, its event.
func (c *contextShapes) executeParam(ref handlerRef) string {
	for _, fn := range c.tree.methodsOf(ref.pkg, ref.typeName) {
		if fn.Name.Name != "Execute" || fn.Type.Params == nil || len(fn.Type.Params.List) == 0 {
			continue
		}
		_, name := typeRef(fn.Type.Params.List[0].Type)
		return publicName(name)
	}
	return ""
}

// publishesIn is the integration events a set of functions publish, by public name: built in a
// body that calls Publish(), inline (`ctx.Publish(integrationevents.X{…})`) or through a variable.
func publishesIn(funcs []*ast.FuncDecl) []string {
	var found []string
	for _, fn := range funcs {
		if fn.Body == nil || !callsMethod(fn.Body, "Publish") {
			continue
		}
		for _, name := range compositeTypes(fn.Body, "IntegrationEvent") {
			found = append(found, publicName(name))
		}
	}
	return unique(found)
}

// ---------------------------------------------------------------------------------------------
// The wiring: the handlers a Module lists, by section.

type wiring struct {
	commands          []commandEntry
	queries           []handlerRef
	domainEvents      []handlerRef
	integrationEvents []handlerRef
}

// commandEntry is one entry of a Module's Commands: the command it answers, when the entry
// spells it (a `Subscription{Channel: …}` literal; "" when `application.Command(h)` derives it
// from the handler), and the handlers it lists — one through application.Command(h), any number
// through a literal. ARCH-ONE-HANDLER wants exactly one per command, across the entries.
type commandEntry struct {
	channel  string
	handlers []handlerRef
}

func (c *contextShapes) wiringOf() wiring {
	var found wiring
	for _, s := range c.files {
		if !s.file.wiring {
			continue
		}
		for _, fn := range funcsOf(s) {
			if fn.Body == nil {
				continue
			}
			sc := scopeOf(fn, "")
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				literal, ok := n.(*ast.CompositeLit)
				if !ok || literal.Type == nil {
					return true
				}
				if _, name := typeRef(literal.Type); name != "Module" {
					return true
				}
				for _, element := range literal.Elts {
					kv, ok := element.(*ast.KeyValueExpr)
					if !ok {
						continue
					}
					key, ok := kv.Key.(*ast.Ident)
					if !ok {
						continue
					}
					list, ok := kv.Value.(*ast.CompositeLit)
					if !ok {
						continue
					}
					for _, entry := range list.Elts {
						switch key.Name {
						case "Commands":
							channel, handlers := c.subscriptionOf(s, sc, entry)
							found.commands = append(found.commands, commandEntry{channel: channel, handlers: handlers})
						case "Queries":
							found.queries = append(found.queries, c.handlerOf(s, sc, entry))
						case "DomainEvents":
							_, handlers := c.subscriptionOf(s, sc, entry)
							found.domainEvents = append(found.domainEvents, handlers...)
						case "IntegrationEvents":
							_, handlers := c.subscriptionOf(s, sc, entry)
							found.integrationEvents = append(found.integrationEvents, handlers...)
						}
					}
				}
				return true
			})
		}
	}
	return found
}

// subscriptionOf reads one entry of a subscriptions section: `application.Command(h)` and
// `application.Reaction(h)` list one handler and derive the channel from it; a
// `Subscription{Channel: …, Handlers: […]}` literal spells the channel (a string, or
// `domain.NameOfType[T]()`), by public name, and lists any number of handlers.
func (c *contextShapes) subscriptionOf(s *source, sc *scope, entry ast.Expr) (channel string, handlers []handlerRef) {
	literal, ok := entry.(*ast.CompositeLit)
	if !ok || literal.Type == nil {
		return "", []handlerRef{c.handlerOf(s, sc, unwrapSubscription(entry))}
	}
	if _, name := typeRef(literal.Type); name != "Subscription" {
		return "", []handlerRef{c.handlerOf(s, sc, unwrapSubscription(entry))}
	}
	handlers = []handlerRef{}
	for _, element := range literal.Elts {
		kv, ok := element.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		key, ok := kv.Key.(*ast.Ident)
		if !ok {
			continue
		}
		switch key.Name {
		case "Channel":
			channel = channelOf(sc, kv.Value)
		case "Handlers":
			if list, ok := kv.Value.(*ast.CompositeLit); ok {
				for _, each := range list.Elts {
					handlers = append(handlers, c.handlerOf(s, sc, unwrapSubscription(each)))
				}
			}
		}
	}
	return channel, handlers
}

// channelOf is the public name of the message a Channel expression names: a constant string
// (`"ShareNoteCommandEvent"`) or `domain.NameOfType[commands.ShareNoteCommandEvent]()`; "" otherwise.
func channelOf(sc *scope, expr ast.Expr) string {
	if value := sc.eval(expr, 0); value != "" {
		return publicName(value)
	}
	call, ok := expr.(*ast.CallExpr)
	if !ok {
		return ""
	}
	var fun, index ast.Expr
	switch e := call.Fun.(type) {
	case *ast.IndexExpr:
		fun, index = e.X, e.Index
	case *ast.IndexListExpr:
		if len(e.Indices) > 0 {
			fun, index = e.X, e.Indices[0]
		}
	}
	if fun == nil {
		return ""
	}
	if _, name := typeRef(fun); name != "NameOfType" {
		return ""
	}
	_, typeName := typeRef(index)
	return publicName(typeName)
}

// unwrapSubscription is the handler inside `application.Command(h)` / `application.Reaction(h)`.
func unwrapSubscription(entry ast.Expr) ast.Expr {
	if call, ok := entry.(*ast.CallExpr); ok && len(call.Args) > 0 {
		if _, name := typeRef(call.Fun); name == "Command" || name == "Reaction" {
			return call.Args[0]
		}
	}
	return entry
}

// commandName is the public name of the command a listed handler answers: what its entry
// spells, else what its Execute takes, else its type's name without the suffix of its kind.
func (c *contextShapes) commandName(entry commandEntry, ref handlerRef) string {
	if entry.channel != "" {
		return entry.channel
	}
	if name := c.executeParam(ref); name != "" {
		return name
	}
	return handlerName(ref.typeName)
}

// handlerOf resolves a wiring entry to the handler type it names: a constructor call
// (`commands.NewShareNoteHandler(…)`), a literal (`events.NoteSharedHandler{}`), or a variable
// assigned one of those.
func (c *contextShapes) handlerOf(s *source, sc *scope, entry ast.Expr) handlerRef {
	switch e := entry.(type) {
	case *ast.UnaryExpr:
		return c.handlerOf(s, sc, e.X)
	case *ast.ParenExpr:
		return c.handlerOf(s, sc, e.X)
	case *ast.Ident:
		if value, ok := sc.vars[e.Name]; ok {
			delete(sc.vars, e.Name) // never follow a variable twice
			return c.handlerOf(s, sc, value)
		}
	case *ast.CompositeLit:
		local, name := typeRef(e.Type)
		pkg := s.packageOf(local)
		return handlerRef{pkg: pkg, typeName: name, source: c.tree.declaring(pkg, name)}
	case *ast.CallExpr:
		local, name := typeRef(e.Fun)
		pkg := s.packageOf(local)
		typeName := strings.TrimPrefix(name, "New")
		for _, each := range c.tree.packages[pkg] {
			for _, fn := range funcsOf(each) {
				if fn.Name.Name == name && receiverOf(fn) == "" && fn.Type.Results != nil && len(fn.Type.Results.List) > 0 {
					if _, result := typeRef(fn.Type.Results.List[0].Type); result != "" {
						typeName = result
					}
				}
			}
		}
		return handlerRef{pkg: pkg, typeName: typeName, source: c.tree.declaring(pkg, typeName)}
	}
	return handlerRef{}
}

// ---------------------------------------------------------------------------------------------
// The routes: the pattern each HandleFunc registers under the context's mount, and the command
// it builds or the query handler it names. The first registration of a command or query wins.

func (c *contextShapes) routesOf(mount string) map[string]string {
	routes := map[string]string{}
	for _, s := range c.files {
		if s.file.layer != "Presentation" {
			continue
		}
		for _, fn := range funcsOf(s) {
			if fn.Body == nil {
				continue
			}
			sc := scopeOf(fn, mount)
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || len(call.Args) < 2 {
					return true
				}
				if _, name := typeRef(call.Fun); name != "HandleFunc" && name != "Handle" {
					return true
				}
				route := canonicalRoute(sc.eval(call.Args[0], 0))
				if route == "" {
					return true
				}
				for _, name := range carriedBy(call.Args[1]) {
					if _, seen := routes[name]; !seen {
						routes[name] = route
					}
				}
				return true
			})
		}
	}
	return routes
}

// carriedBy is what a route's handler carries: the commands it builds (`commands.ShareNoteCommandEvent{…}`)
// and the handlers it finds in the module (`application.QueryOf[*queries.GetNoteHandler]`).
func carriedBy(handler ast.Expr) []string {
	found := commandsBuiltIn(handler)
	ast.Inspect(handler, func(n ast.Node) bool {
		var fun, index ast.Expr
		switch e := n.(type) {
		case *ast.IndexExpr:
			fun, index = e.X, e.Index
		case *ast.IndexListExpr:
			if len(e.Indices) > 0 {
				fun, index = e.X, e.Indices[0]
			}
		}
		if fun == nil {
			return true
		}
		if _, name := typeRef(fun); name == "QueryOf" || name == "CommandOf" {
			if _, typeName := typeRef(index); typeName != "" {
				found = append(found, handlerName(typeName))
			}
		}
		return true
	})
	return unique(found)
}

// mountsOf is where the composition root mounts each context's routes: `notesapi.Routes(mux, prefix+"/notes", …)`,
// the API prefix (a setting) counting for nothing.
func (t *sourceTree) mountsOf() map[string]string {
	mounts := map[string]string{}
	contexts := t.contract.ModulePath + "/" + t.contract.ContextsTree + "/"
	for _, s := range t.files {
		if s.file.tree != "bootstrap" {
			continue
		}
		for _, fn := range funcsOf(s) {
			if fn.Body == nil {
				continue
			}
			sc := scopeOf(fn, "")
			ast.Inspect(fn.Body, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || len(call.Args) < 2 {
					return true
				}
				local, name := typeRef(call.Fun)
				if name != "Routes" || local == "" {
					return true
				}
				rest, inside := strings.CutPrefix(s.imports[local], contexts)
				if !inside {
					return true
				}
				context := firstDir(rest)
				mount := strings.TrimSuffix(path.Clean("/"+sc.eval(call.Args[1], 0)), "/")
				if _, seen := mounts[context]; !seen {
					mounts[context] = mount
				}
				return true
			})
		}
	}
	return mounts
}

// ---------------------------------------------------------------------------------------------
// The inventory of one context, and of the whole tree.

func (t *sourceTree) inventoryOf(context string, mounts map[string]string) InventoryContext {
	shapes := t.shapesOf(context)
	wired := shapes.wiringOf()
	routes := shapes.routesOf(mounts[strings.ToLower(context)])
	found := InventoryContext{ID: context, Commands: []InventoryCommand{}, Queries: []InventoryQuery{}, Events: []string{}, Policies: []InventoryPolicy{}}

	handlerTypes := map[string]bool{}
	for _, entry := range wired.commands {
		for _, ref := range entry.handlers {
			handlerTypes[ref.typeName] = true
			name := shapes.commandName(entry, ref)
			analysed := shapes.analyse(ref.source)
			found.Commands = append(found.Commands, InventoryCommand{
				Name:      name,
				Actor:     actorOf(ref.source),
				Route:     routes[name],
				Aggregate: analysed.aggregate,
				Events:    sorted(analysed.events),
			})
		}
	}
	for _, ref := range wired.queries {
		name := handlerName(ref.typeName)
		found.Queries = append(found.Queries, InventoryQuery{Name: name, Actor: actorOf(ref.source), Route: routes[name]})
	}

	for _, s := range shapes.files {
		if s.file.layer != "Domain" {
			continue
		}
		for _, each := range typesOf(s) {
			if st, ok := each.spec.(*ast.StructType); ok && t.embeds(s, st, "DomainEvent") {
				found.Events = append(found.Events, publicName(each.name))
			}
		}
	}
	found.Events = sorted(unique(found.Events))

	policyOf := func(ref handlerRef, on, kind string) InventoryPolicy {
		handlerTypes[ref.typeName] = true
		publishes := []string{}
		if ref.source != nil {
			publishes = publishesIn(funcsOf(ref.source))
		}
		return InventoryPolicy{On: on, Kind: kind, Publishes: sorted(publishes), Events: sorted(shapes.analyse(ref.source).events)}
	}
	for _, ref := range wired.domainEvents {
		found.Policies = append(found.Policies, policyOf(ref, shapes.executeParam(ref), "domain-event"))
	}
	for _, ref := range wired.integrationEvents {
		found.Policies = append(found.Policies, policyOf(ref, shapes.executeParam(ref), "integration-event"))
	}
	// A publisher that is not a subscribed handler reacts to every operation: the Tracker's decorated bus.
	for _, s := range shapes.files {
		for _, each := range typesOf(s) {
			if handlerTypes[each.name] {
				continue
			}
			publishes := publishesIn(t.methodsOf(s.pkg, each.name))
			if len(publishes) == 0 {
				continue
			}
			handlerTypes[each.name] = true
			found.Policies = append(found.Policies, InventoryPolicy{
				On:        "every operation",
				Kind:      "every-operation",
				Publishes: sorted(publishes),
				Events:    sorted(shapes.analyse(s).events),
			})
		}
	}

	sort.SliceStable(found.Commands, func(i, j int) bool { return found.Commands[i].Name < found.Commands[j].Name })
	sort.SliceStable(found.Queries, func(i, j int) bool { return found.Queries[i].Name < found.Queries[j].Name })
	sort.SliceStable(found.Policies, func(i, j int) bool {
		if found.Policies[i].Kind != found.Policies[j].Kind {
			return found.Policies[i].Kind < found.Policies[j].Kind
		}
		return found.Policies[i].On < found.Policies[j].On
	})
	return found
}

// ---------------------------------------------------------------------------------------------
// ARCH-ONE-HANDLER: a command has exactly one handler. The Module lists it once, with one
// handler; every command a route builds (`commands.ShareNoteCommandEvent{…}` in the
// Presentation layer) and every command a policy dispatches (the same literal in a domain or
// integration event handler) is one the Module lists. A fact may have any number of subscribers,
// so DomainEvents and IntegrationEvents are not held to it.

const oneHandlerRule = "ARCH-ONE-HANDLER"

// checkOneHandler holds every context's wiring to ARCH-ONE-HANDLER, as problems of the check.
func checkOneHandler(root string, contract *Contract) []string {
	tree, err := readTree(root, contract)
	if err != nil {
		return []string{fmt.Sprintf("%s: the wiring could not be read from the tree: %s", oneHandlerRule, err.Error())}
	}
	var problems []string
	for _, context := range contract.Contexts {
		problems = append(problems, tree.oneHandlerOf(context)...)
	}
	return problems
}

// oneHandlerOf is the ARCH-ONE-HANDLER problems of one context, each naming the rule, the
// context and the command, in the words every language's tool uses.
func (t *sourceTree) oneHandlerOf(context string) []string {
	shapes := t.shapesOf(context)
	wired := shapes.wiringOf()
	var problems []string

	// The handlers the Module lists, by command, in the Module's order.
	handlers := map[string][]string{}
	var commands []string
	listed := func(name string) {
		if _, seen := handlers[name]; !seen {
			commands = append(commands, name)
			handlers[name] = []string{}
		}
	}
	for _, entry := range wired.commands {
		if entry.channel != "" {
			listed(entry.channel)
		}
		for _, ref := range entry.handlers {
			name := shapes.commandName(entry, ref)
			listed(name)
			handlers[name] = append(handlers[name], ref.typeName)
		}
	}
	for _, name := range commands {
		if len(handlers[name]) != 1 {
			problems = append(problems, fmt.Sprintf("%s: %s: command %s has %d handlers (%s); a command has exactly one",
				oneHandlerRule, context, name, len(handlers[name]), strings.Join(handlers[name], ", ")))
		}
	}

	// Every command a route builds is one the Module lists.
	for _, name := range shapes.commandsBuiltByRoutes() {
		if _, answered := handlers[name]; !answered {
			problems = append(problems, fmt.Sprintf("%s: %s: command %s is built by a route and no handler in the Module answers it",
				oneHandlerRule, context, name))
		}
	}

	// Every command a policy dispatches is one the Module lists.
	for _, ref := range append(append([]handlerRef{}, wired.domainEvents...), wired.integrationEvents...) {
		if ref.source == nil {
			continue
		}
		for _, name := range commandsBuiltIn(ref.source.syntax) {
			if _, answered := handlers[name]; !answered {
				problems = append(problems, fmt.Sprintf("%s: %s: command %s is dispatched by %s and no handler in the Module answers it",
					oneHandlerRule, context, name, ref.typeName))
			}
		}
	}
	return problems
}

// commandsBuiltByRoutes is every command the context's Presentation layer builds, by public name.
func (c *contextShapes) commandsBuiltByRoutes() []string {
	var found []string
	for _, s := range c.files {
		if s.file.layer == "Presentation" {
			found = append(found, commandsBuiltIn(s.syntax)...)
		}
	}
	return unique(found)
}

// commandsBuiltIn is every command a node builds (`commands.ShareNoteCommandEvent{…}`), by public name.
func commandsBuiltIn(node ast.Node) []string {
	var found []string
	for _, name := range compositeTypes(node, "CommandEvent") {
		found = append(found, publicName(name))
	}
	return unique(found)
}

// linksOf is every relationship the code carries: an integration event of the shared kernel
// built in one context and subscribed to in another; a port one context owns, implemented by
// an adapter of its own that imports the other context (CTX-CONTRACTS).
func (t *sourceTree) linksOf(contexts []InventoryContext) []InventoryLink {
	byKey := map[string]*InventoryLink{}
	link := func(mechanism, upstream, downstream, contract string) {
		key := upstream + "→" + downstream + ":" + mechanism
		found, ok := byKey[key]
		if !ok {
			found = &InventoryLink{Mechanism: mechanism, Upstream: upstream, Downstream: downstream, Contracts: []string{}}
			byKey[key] = found
		}
		if contract != "" {
			found.Contracts = append(found.Contracts, contract)
		}
	}

	// The integration events of the shared kernel, and who builds and who consumes each.
	for _, s := range t.files {
		if s.file.tree != "kernel" {
			continue
		}
		for _, each := range typesOf(s) {
			st, ok := each.spec.(*ast.StructType)
			if !ok || !t.embeds(s, st, "IntegrationEvent") {
				continue
			}
			name := publicName(each.name)
			for _, upstream := range t.contract.Contexts {
				if !t.builds(upstream, s.pkg, each.name) {
					continue
				}
				for _, downstream := range contexts {
					if downstream.ID == upstream || !consumes(downstream, name) {
						continue
					}
					link("integration-event", upstream, downstream.ID, name)
				}
			}
		}
	}

	// An import of another context from inside a context: the adapter of a port this context owns.
	prefix := t.contract.ModulePath + "/" + t.contract.ContextsTree + "/"
	for _, downstream := range t.contract.Contexts {
		files := t.contextFiles(downstream)
		ports := t.portsOf(files)
		for _, s := range files {
			for _, imported := range s.imports {
				rest, inside := strings.CutPrefix(imported, prefix)
				if !inside || strings.EqualFold(firstDir(rest), downstream) {
					continue
				}
				upstream := t.contextNamed(firstDir(rest))
				implemented := false
				for _, each := range typesOf(s) {
					for _, port := range implementedBy(ports, t.methodsOf(s.pkg, each.name)) {
						link("owned-port", upstream, downstream, port)
						implemented = true
					}
				}
				if !implemented {
					link("owned-port", upstream, downstream, "")
				}
			}
		}
	}

	links := []InventoryLink{}
	for _, each := range byKey {
		each.Contracts = sorted(unique(each.Contracts))
		links = append(links, *each)
	}
	sort.Slice(links, func(i, j int) bool {
		a, b := links[i], links[j]
		return a.Upstream+"→"+a.Downstream+":"+a.Mechanism < b.Upstream+"→"+b.Downstream+":"+b.Mechanism
	})
	return links
}

// builds says whether a context builds a type of a package anywhere in its files.
func (t *sourceTree) builds(context, pkg, typeName string) bool {
	for _, s := range t.contextFiles(context) {
		for _, literal := range compositeLiterals(s.syntax) {
			if local, name := typeRef(literal.Type); name == typeName && s.packageOf(local) == pkg {
				return true
			}
		}
	}
	return false
}

func compositeLiterals(node ast.Node) []*ast.CompositeLit {
	var found []*ast.CompositeLit
	ast.Inspect(node, func(n ast.Node) bool {
		if literal, ok := n.(*ast.CompositeLit); ok && literal.Type != nil {
			found = append(found, literal)
		}
		return true
	})
	return found
}

func consumes(context InventoryContext, event string) bool {
	for _, policy := range context.Policies {
		if policy.Kind == "integration-event" && policy.On == event {
			return true
		}
	}
	return false
}

// contextNamed is the declared spelling of a context directory (notes → Notes).
func (t *sourceTree) contextNamed(dir string) string {
	for _, context := range t.contract.Contexts {
		if strings.EqualFold(context, dir) {
			return context
		}
	}
	return dir
}

type port struct {
	name    string
	methods []string
}

// portsOf is every interface of a context's Domain, with its methods.
func (t *sourceTree) portsOf(files []*source) []port {
	var found []port
	for _, s := range files {
		if s.file.layer != "Domain" {
			continue
		}
		for _, each := range typesOf(s) {
			iface, ok := each.spec.(*ast.InterfaceType)
			if !ok || iface.Methods == nil {
				continue
			}
			var methods []string
			for _, field := range iface.Methods.List {
				for _, name := range field.Names {
					methods = append(methods, name.Name)
				}
			}
			if len(methods) > 0 {
				found = append(found, port{name: each.name, methods: methods})
			}
		}
	}
	return found
}

// implementedBy is the ports whose every method a type has.
func implementedBy(ports []port, methods []*ast.FuncDecl) []string {
	has := map[string]bool{}
	for _, fn := range methods {
		has[fn.Name.Name] = true
	}
	var found []string
	for _, each := range ports {
		all := true
		for _, method := range each.methods {
			if !has[method] {
				all = false
				break
			}
		}
		if all {
			found = append(found, each.name)
		}
	}
	return found
}

// inspectInventory is the inventory read from this language's tree.
func inspectInventory(root string, contract *Contract) (*Inventory, error) {
	tree, err := readTree(root, contract)
	if err != nil {
		return nil, err
	}
	mounts := tree.mountsOf()
	inventory := &Inventory{SchemaVersion: inventorySchema, Language: contract.Language, Contexts: []InventoryContext{}}
	for _, context := range contract.Contexts {
		inventory.Contexts = append(inventory.Contexts, tree.inventoryOf(context, mounts))
	}
	// By id, not in the binding's order: the bindings list the contexts differently, the inventories are one file.
	sort.Slice(inventory.Contexts, func(i, j int) bool { return inventory.Contexts[i].ID < inventory.Contexts[j].ID })
	inventory.Links = tree.linksOf(inventory.Contexts)
	if inventory.Links == nil {
		// Canonical JSON says `[]`, as every language's tool does: an application with no link yet is not `null`.
		inventory.Links = []InventoryLink{}
	}
	return inventory, nil
}
