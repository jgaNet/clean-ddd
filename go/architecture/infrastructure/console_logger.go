package infrastructure

import (
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"clean-ddd/architecture/application"
)

// ConsoleLogger is the Logger port on the process's standard error. Each line starts with the
// trace id when the meta carries one, so the lines of one request can be grepped together; the
// rest of the meta is printed after the message. The only place in the project that writes to
// the console.
type ConsoleLogger struct {
	out   io.Writer
	debug bool
}

const noTrace = "************************************"

func NewConsoleLogger(debug bool) *ConsoleLogger {
	return &ConsoleLogger{out: os.Stderr, debug: debug}
}

func (l *ConsoleLogger) Info(message string, meta application.Meta) { l.write("INFO ", message, meta) }
func (l *ConsoleLogger) Warn(message string, meta application.Meta) { l.write("WARN ", message, meta) }
func (l *ConsoleLogger) Error(message string, err error, meta application.Meta) {
	if err != nil {
		message = fmt.Sprintf("%s: %v", message, err)
	}
	l.write("ERROR", message, meta)
}

func (l *ConsoleLogger) Debug(message string, meta application.Meta) {
	if l.debug {
		l.write("DEBUG", message, meta)
	}
}

func (l *ConsoleLogger) write(level, message string, meta application.Meta) {
	trace := noTrace
	rest := make([]string, 0, len(meta))
	for key, value := range meta {
		if key == "traceId" {
			if id, ok := value.(string); ok && id != "" {
				trace = id
			}
			continue
		}
		rest = append(rest, fmt.Sprintf("%s=%v", key, value))
	}
	sort.Strings(rest)
	line := fmt.Sprintf("%s [%s] %s", level, trace, message)
	if len(rest) > 0 {
		line += " " + strings.Join(rest, " ")
	}
	_, _ = fmt.Fprintln(l.out, line)
}
