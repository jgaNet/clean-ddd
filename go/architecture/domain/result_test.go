package domain

import (
	"errors"
	"fmt"
	"reflect"
	"testing"
)

func halve(n int) (int, error) {
	if n%2 != 0 {
		return 0, NotAllowed("Test", "Odd numbers do not halve", map[string]any{"n": n})
	}
	return n / 2, nil
}

func TestASuccessCarriesItsDataAndAFailureItsException(t *testing.T) {
	if half, err := halve(4); err != nil || half != 2 {
		t.Errorf("halve(4): got (%d, %v), want (2, nil)", half, err)
	}
	_, err := halve(3)
	refused, ok := Refusal(err)
	if !ok {
		t.Fatalf("halve(3) should be refused, got %v", err)
	}
	if refused.Type != TypeNotAllowed {
		t.Errorf("type: got %q, want NotAllowed", refused.Type)
	}
	if !reflect.DeepEqual(refused.Context, map[string]any{"n": 3}) {
		t.Errorf("context: got %v", refused.Context)
	}
}

func TestAFailureIsReturnedAsIsWhateverTheExpectedType(t *testing.T) {
	describe := func(n int) (string, error) {
		half, err := halve(n)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("half of %d is %d", n, half), nil
	}
	if described, err := describe(4); err != nil || described != "half of 4 is 2" {
		t.Errorf("describe(4): got (%q, %v)", described, err)
	}
	if _, err := describe(3); !IsNotAllowed(err) {
		t.Errorf("describe(3) should pass the refusal on, got %v", err)
	}
}

func TestTheCommonExceptionsNameTheTypeAControllerSwitchesOnAndNeverLeaveTheServiceBlank(t *testing.T) {
	if NotFound("Notes", "Note not found", nil).Type != TypeNotFound {
		t.Error("NotFound should be typed NotFound")
	}
	if NotAllowed("", "Sign in first", nil).Service != "unknown" {
		t.Error("a blank service should read unknown")
	}
	if ConcurrencyConflict("Notes", "stale", nil).Type != TypeConcurrencyConflict {
		t.Error("ConcurrencyConflict should be typed ConcurrencyConflict")
	}
	if Unknown("boom", nil).Type != TypeUnknown || Unknown("boom", nil).Service != "unknown" {
		t.Error("Unknown should be typed Unknown from the unknown service")
	}
	if NewException("Notes", "X", "m", nil).Context == nil {
		t.Error("a nil context should become an empty one")
	}
	if NotFound("Notes", "Note not found", nil).Error() != "Note not found" {
		t.Error("the error text is the message")
	}
}

func TestARefusalIsFoundThroughWrappingAndAPlainErrorIsUnknown(t *testing.T) {
	wrapped := fmt.Errorf("loading: %w", NotFound("Notes", "Note not found", nil))
	if !IsNotFound(wrapped) {
		t.Error("a wrapped refusal should still be read")
	}
	if IsNotAllowed(wrapped) || IsConcurrencyConflict(wrapped) {
		t.Error("a NotFound is not another kind")
	}
	plain := errors.New("disk on fire")
	if _, ok := Refusal(plain); ok {
		t.Error("a plain error is no refusal")
	}
	if as := AsException(plain); as.Type != TypeUnknown || as.Message != "disk on fire" {
		t.Errorf("AsException on a plain error: got %+v", as)
	}
	if refused := NotAllowed("Test", "no", nil); AsException(refused) != refused {
		t.Error("AsException on a refusal is the refusal itself")
	}
	if IsNotFound(nil) {
		t.Error("nil is no refusal")
	}
}

func TestARecoveredPanicBecomesAnError(t *testing.T) {
	if err := Recovered("boom"); err == nil || err.Error() != "boom" {
		t.Errorf("a string panic: got %v", err)
	}
	original := errors.New("boom")
	if err := Recovered(original); !errors.Is(err, original) {
		t.Errorf("an error panic should be kept as is, got %v", err)
	}
	if err := Recovered(42); err == nil || err.Error() != "42" {
		t.Errorf("any other value is printed: got %v", err)
	}
}
