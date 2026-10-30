package bootstrap

import "testing"

func TestAnAdministratorExistsOnlyWhenBothItsIdentifierAndPasswordAreSet(t *testing.T) {
	if got := adminAccountFrom("root@example.com", "s3cret"); got == nil || *got != (AdminAccount{Identifier: "root@example.com", Password: "s3cret"}) {
		t.Fatalf("both set: got %v", got)
	}
	for _, missing := range [][2]string{{"", ""}, {"root@example.com", ""}, {"", "s3cret"}} {
		if got := adminAccountFrom(missing[0], missing[1]); got != nil {
			t.Fatalf("%q: got %v, want no administrator", missing, got)
		}
	}
}
