package application

// Meta is what a log line carries besides its message; "traceId" is read by the console logger.
type Meta map[string]any

// Logger is the port every handler logs through; the console logger is its one adapter.
type Logger interface {
	Info(message string, meta Meta)
	Warn(message string, meta Meta)
	Error(message string, err error, meta Meta)
	Debug(message string, meta Meta)
}
