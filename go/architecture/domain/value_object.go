package domain

// A value object is an object defined by its value, with no identity of its own: two are equal
// when they are of the same kind and their values are equal, they are immutable (to "change"
// one you create another), and their job is to make an invalid value impossible to represent,
// so validation lives in one constructor instead of being sprinkled across the code.
//
// In Go a value object is a struct with one unexported field and a constructor that returns
// (T, error): the unexported field is what keeps the rule, since nothing outside the package
// can build one around it, and the struct's == is the structural equality. Kinds matter: an ID
// and a NoteTitle holding the same string are different types and cannot be compared.
//
// Examples: id.go, sharedkernel/domain/email.go, contexts/notes/domain/note/note_title.go.
// This file names the shape; there is no base type to embed, on purpose: a one-field struct
// is already the whole mechanism.
