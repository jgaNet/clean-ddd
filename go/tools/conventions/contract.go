package main

import (
	"fmt"
	"os"
	"path"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	contractFile = "conventions/architecture.yaml"
	bindingFile  = "conventions/go.yaml"
	language     = "go"
)

// Contract is what this tool needs of the contract and the binding, loaded into one value.
type Contract struct {
	SchemaVersion int
	Languages     []string
	Language      string
	Root          string
	Contexts      []string
	ContextsTree  string
	Architecture  string
	Kernel        string
	Bootstrap     string
	Wiring        string
	Libraries     []string
	ModulePath    string
	// Layers in the contract's spelling (Domain), with what each may import, and the specs rows.
	Layers     map[string]row
	Wiring_    row
	E2E        row
	NamedFiles []string
}

type row struct {
	id        string
	mayImport []string
}

type contractYAML struct {
	SchemaVersion int      `yaml:"schemaVersion"`
	Languages     []string `yaml:"languages"`
	Layers        map[string]struct {
		ID        string   `yaml:"id"`
		MayImport []string `yaml:"may_import"`
		Specs     *struct {
			ID        string   `yaml:"id"`
			MayImport []string `yaml:"may_import"`
		} `yaml:"specs"`
	} `yaml:"layers"`
	WiringFile struct {
		ID        string   `yaml:"id"`
		MayImport []string `yaml:"may_import"`
	} `yaml:"wiring_file"`
	E2ESpecs struct {
		ID        string   `yaml:"id"`
		MayImport []string `yaml:"may_import"`
	} `yaml:"e2e_specs"`
}

type bindingYAML struct {
	SchemaVersion int               `yaml:"schemaVersion"`
	Language      string            `yaml:"language"`
	Root          string            `yaml:"root"`
	Contexts      []string          `yaml:"contexts"`
	ContextsTree  tree              `yaml:"contexts_tree"`
	Architecture  tree              `yaml:"architecture"`
	Kernel        tree              `yaml:"kernel"`
	Bootstrap     tree              `yaml:"bootstrap"`
	Wiring        string            `yaml:"wiring"`
	Libraries     []string          `yaml:"libraries"`
	Module        string            `yaml:"module"`
	Verbs         map[string]string `yaml:"verbs"`
	Rules         map[string]struct {
		References []string `yaml:"references"`
	} `yaml:"rules"`
	Concepts map[string]struct {
		Canonical []string `yaml:"canonical"`
		Examples  []string `yaml:"examples"`
	} `yaml:"concepts"`
}

type tree struct {
	Alias string `yaml:"alias"`
	Path  string `yaml:"path"`
}

// specs rows are kept beside their layer under the key "<Layer>.specs".
func loadContract(root string) (*Contract, error) {
	var contract contractYAML
	if err := readYAML(filepath.Join(root, contractFile), &contract); err != nil {
		return nil, err
	}
	var binding bindingYAML
	if err := readYAML(filepath.Join(root, bindingFile), &binding); err != nil {
		return nil, err
	}
	if binding.Language != language {
		return nil, fmt.Errorf("%s: language is %q, not %q", bindingFile, binding.Language, language)
	}
	if !contains(contract.Languages, language) {
		return nil, fmt.Errorf("%s: languages does not list %q", contractFile, language)
	}
	if binding.SchemaVersion != contract.SchemaVersion {
		return nil, fmt.Errorf("%s: schemaVersion %d differs from the contract's %d", bindingFile, binding.SchemaVersion, contract.SchemaVersion)
	}
	if binding.Module == "" {
		return nil, fmt.Errorf("%s: module (the Go module path) is missing", bindingFile)
	}

	loaded := &Contract{
		SchemaVersion: contract.SchemaVersion,
		Languages:     contract.Languages,
		Language:      binding.Language,
		Root:          binding.Root,
		Contexts:      binding.Contexts,
		ContextsTree:  binding.ContextsTree.Path,
		Architecture:  binding.Architecture.Path,
		Kernel:        binding.Kernel.Path,
		Bootstrap:     binding.Bootstrap.Path,
		Wiring:        binding.Wiring,
		Libraries:     binding.Libraries,
		ModulePath:    binding.Module,
		Layers:        map[string]row{},
		Wiring_:       row{id: contract.WiringFile.ID, mayImport: contract.WiringFile.MayImport},
		E2E:           row{id: contract.E2ESpecs.ID, mayImport: contract.E2ESpecs.MayImport},
	}
	for name, layer := range contract.Layers {
		loaded.Layers[name] = row{id: layer.ID, mayImport: layer.MayImport}
		if layer.Specs != nil {
			loaded.Layers[name+".specs"] = row{id: layer.Specs.ID, mayImport: layer.Specs.MayImport}
		}
	}
	seen := map[string]bool{}
	add := func(paths ...string) {
		for _, p := range paths {
			if p != "" && !seen[p] {
				seen[p] = true
				loaded.NamedFiles = append(loaded.NamedFiles, path.Join(binding.Root, p))
			}
		}
	}
	for _, p := range binding.Verbs {
		add(p)
	}
	for _, rule := range binding.Rules {
		add(rule.References...)
	}
	for _, concept := range binding.Concepts {
		add(concept.Canonical...)
		add(concept.Examples...)
	}
	return loaded, nil
}

func readYAML(path string, into any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := yaml.Unmarshal(data, into); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	return nil
}

func contains(list []string, item string) bool {
	for _, each := range list {
		if each == item {
			return true
		}
	}
	return false
}

// layerOf turns a directory name into the contract's layer name (domain → Domain), or "".
func layerOf(contract *Contract, dir string) string {
	for name := range contract.Layers {
		if strings.Contains(name, ".") {
			continue
		}
		if strings.EqualFold(name, dir) {
			return name
		}
	}
	return ""
}
