// Package integrationevents holds the contracts between contexts: what one context tells the
// others, in its public words. A contract is deliberately not the domain event behind it: a
// domain event can change whenever the aggregate changes; an integration event is a promise to
// other contexts and evolves with care. The publishing context translates one into the other
// (its domain event handler); the receiving context reads only this (ADR 6).
package integrationevents
