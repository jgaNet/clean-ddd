# Conventions

The architecture of this application, as data, so that tooling can hold the code to it.

| File | What it holds |
|---|---|
| [`architecture.yaml`](architecture.yaml) | the layers, which layer may import from which, the rules, the HTTP verbs, the kinds of thing a feature is made of, and the two modes |
| [`typescript.yaml`](typescript.yaml) | this language's binding: the contexts, the trees and their aliases, the libraries, the file that shows each concept, what a new thing of each kind is made of |
| [`concepts.yaml`](concepts.yaml) | every concept, in the contract’s words |
| [`plans/`](plans) | feature plans: what a change intends, checked before it is written |

```bash
clean-ddd check           # the contract is sound and the documents are rendered from it
clean-ddd check --write   # regenerate the rendered blocks in README.md and CLAUDE.md
clean-ddd …               # ask the contract: inspect, rules, concepts, verbs, checklists, plan, mode, can-import
```

Adding a context means adding it to `contexts` in `typescript.yaml`, or no import rule applies to it.
