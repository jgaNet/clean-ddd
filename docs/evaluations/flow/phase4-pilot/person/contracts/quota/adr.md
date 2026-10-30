# NN. Plans is a context of its own, and Notes asks it how many notes a person may keep

## Context

The product has two plans, Free (ten notes) and Unlimited. Which plan a person is on changes for reasons of its own — pricing, later payment — and means nothing to a note; but writing a note must be refused past the limit of the writer's plan.

## Decision

A context `Plans`, in the supporting subdomain *billing*, registered in the composition root with an empty module and routes under `/plans`. A relationship Plans → Notes, customer-supplier with an anti-corruption layer, carried by a port Notes owns (`PlanLimits`), answered by an adapter over Plans' read model, `IPlanQueries`, which this task freezes and Plans' wiring exports as `planQueries`. It is declared `planned` until the feature carries it.

## Consequences

Plans and Notes are written at once, against that read model. Everyone is on Free until Plans' first feature records a choice.
