package domain

import "testing"

func TestARoleIsParsedFromItsNameOnly(t *testing.T) {
	if role, ok := ParseRole("USER"); !ok || role != RoleUser {
		t.Errorf("USER: got (%q, %v)", role, ok)
	}
	if role, ok := ParseRole("ADMIN"); !ok || role != RoleAdmin {
		t.Errorf("ADMIN: got (%q, %v)", role, ok)
	}
	if role, ok := ParseRole("GUEST"); !ok || role != RoleGuest {
		t.Errorf("GUEST: got (%q, %v)", role, ok)
	}
	if _, ok := ParseRole("user"); ok {
		t.Error("a role is its exact name")
	}
	if _, ok := ParseRole(""); ok {
		t.Error("an empty string names no role")
	}
	if RoleAdmin != "ADMIN" {
		t.Error("a role reads as its name")
	}
}
