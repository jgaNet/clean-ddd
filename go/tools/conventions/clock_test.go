package main

import (
	"strings"
	"testing"
)

// DOMAIN-ONE-CLOCK, held on a copy of the tree: a read of the machine's time outside the system
// clock is refused by file and line, called or handed on; the tree as it is has none, though its
// tests pass time.Now as their clock.

const accountFile = "go/contexts/security/domain/account/account.go"

func clockProblems(t *testing.T, root string) []string {
	t.Helper()
	buildsAsGo(t, root)
	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	var found []string
	for _, problem := range check(root, contract) {
		if strings.HasPrefix(problem, clockRule+":") {
			found = append(found, problem)
		}
	}
	return found
}

func TestTheTreeAsItIsReadsTheTimeOnlyInTheSystemClock(t *testing.T) {
	root := repositoryRootForTest(t)
	contract, err := loadContract(root)
	if err != nil {
		t.Fatal(err)
	}
	if problems := checkOneClock(root, contract); len(problems) != 0 {
		t.Fatalf("expected no %s problem, got %q", clockRule, problems)
	}
}

func TestRefusesADomainMethodThatDefaultsToTheMachinesTime(t *testing.T) {
	root := copyOfTheTree(t)
	editFile(t, root, accountFile, "	a.lastAuthenticatedAt = &at\n",
		`	if at.IsZero() {
		at = time.Now()
	}
	a.lastAuthenticatedAt = &at
	_ = time.Since(at)
`)

	found := clockProblems(t, root)
	if len(found) != 2 {
		t.Fatalf("expected 2 %s problems, got %q", clockRule, found)
	}
	for i, what := range []string{"(time.Now)", "(time.Since)"} {
		if !strings.HasPrefix(found[i], clockRule+": "+accountFile+":") || !strings.Contains(found[i], what) ||
			!strings.Contains(found[i], "application.Clock") || !strings.Contains(found[i], "architecture rule "+clockRule) {
			t.Errorf("problem %d: got %q, want the file, the line, %q and the way out", i, found[i], what)
		}
	}
}

func TestRefusesASecondSystemClockUnderAnotherName(t *testing.T) {
	root := copyOfTheTree(t)
	writeFile(t, root, "go/architecture/infrastructure/wall_clock.go", `package infrastructure

import clock "time"

// WallClock would be a second system clock.
var WallClock = clock.Now
`)

	found := clockProblems(t, root)
	if len(found) != 1 || !strings.HasPrefix(found[0], clockRule+": go/architecture/infrastructure/wall_clock.go:6 ") {
		t.Fatalf("expected the second clock refused, got %q", found)
	}
}
