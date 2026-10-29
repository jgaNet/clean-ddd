// Command application is the process entry point: the application its composition root builds,
// serving until the process ends. It reads no setting of its own (the composition root reads
// the environment: PORT, API_PREFIX, WEB_ORIGINS, and whatever its contexts need), so it is the
// same file in every application built on this architecture.
package main

import (
	"os"

	"clean-ddd/architecture/infrastructure"
	"clean-ddd/bootstrap"
)

func main() {
	logger := infrastructure.NewConsoleLogger(os.Getenv("DEBUG") == "true")
	server, err := bootstrap.CreateApplication(logger)
	if err != nil {
		logger.Error("The application could not be built", err, nil)
		os.Exit(1)
	}
	running, err := server.Start(-1)
	if err != nil {
		logger.Error("The application could not listen", err, nil)
		os.Exit(1)
	}
	if err := running.Wait(); err != nil {
		logger.Error("The transport ended", err, nil)
		os.Exit(1)
	}
}
