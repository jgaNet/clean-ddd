// Command application is the process entry point: the settings from the environment, the
// application wired by the composition root, serving until the process ends.
package main

import (
	"os"

	"clean-ddd/architecture/infrastructure"
	"clean-ddd/bootstrap"
)

func main() {
	settings := bootstrap.SettingsFromEnv()
	logger := infrastructure.NewConsoleLogger(settings.Debug)
	app, err := bootstrap.CreateApplication(settings, logger)
	if err != nil {
		logger.Error("The application could not be built", err, nil)
		os.Exit(1)
	}
	running, err := app.Start(-1)
	if err != nil {
		logger.Error("The application could not listen", err, nil)
		os.Exit(1)
	}
	if err := running.Wait(); err != nil {
		logger.Error("The transport ended", err, nil)
		os.Exit(1)
	}
}
