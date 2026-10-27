package account

// Credentials is what an account authenticates with. The domain only ever sees a hash: hashing
// and comparing are the job of the PasswordHasher port, implemented in the infrastructure. A
// value object: once you hold one you know the hash is not empty. The type leaves room for
// other kinds of credentials without touching the aggregate.
type Credentials struct {
	hash string
}

const CredentialsType = "password"

func NewCredentials(hash string) (Credentials, error) {
	if hash == "" {
		return Credentials{}, InvalidCredentials()
	}
	return Credentials{hash: hash}, nil
}

func (c Credentials) Type() string { return CredentialsType }
func (c Credentials) Hash() string { return c.hash }
