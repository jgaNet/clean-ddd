package auth

// PasswordHasher: hashing is a technical concern with a business meaning ("is this the right
// password?"). The port keeps the algorithm out of the domain and the application layer; the
// infrastructure provides it (BcryptPasswordHasher), tests provide a fake.
type PasswordHasher interface {
	Hash(plain string) (string, error)
	Compare(plain, hash string) (bool, error)
}
