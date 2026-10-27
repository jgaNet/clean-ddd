package note

import "strings"

// Title is a value object: it has no identity, it is immutable, and it cannot exist in an
// invalid state. Once you hold a Title you know it is non-blank and short enough. The
// validation lives here, in one place, instead of being repeated wherever a title enters the
// system (creation, edition, import...).
type Title struct {
	value string
}

const TitleMaxLength = 100

func NewTitle(raw string) (Title, error) {
	title := strings.TrimSpace(raw)
	if title == "" {
		return Title{}, BlankNoteTitle()
	}
	if len([]rune(title)) > TitleMaxLength {
		return Title{}, NoteTitleTooLong(TitleMaxLength, len([]rune(title)))
	}
	return Title{value: title}, nil
}

func (t Title) Value() string { return t.value }
