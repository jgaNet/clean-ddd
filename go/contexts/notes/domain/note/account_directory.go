package note

// AccountDirectory is what Notes needs to know about accounts, in its own words: whether one
// exists. The accounts themselves belong to the Security context; Notes never imports it. The
// infrastructure provides an adapter over Security's read model, which is the read-side
// counterpart of the anti-corruption layer used for events.
type AccountDirectory interface {
	Exists(accountID string) (bool, error)
}
