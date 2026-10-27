package presentation

import (
	"net/http"
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/presentation"
	trackerapp "clean-ddd/contexts/tracker/application"
	"clean-ddd/contexts/tracker/application/queries"
)

// The view: the record in client words, camelCase, and nothing for what is not there yet.

type operationErrorView struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

type operationView struct {
	ID         string              `json:"id"`
	Name       string              `json:"name"`
	Status     string              `json:"status"`
	TraceID    string              `json:"traceId"`
	SubjectID  string              `json:"subjectId,omitempty"`
	Result     any                 `json:"result,omitempty"`
	Error      *operationErrorView `json:"error,omitempty"`
	CreatedAt  string              `json:"createdAt"`
	FinishedAt string              `json:"finishedAt,omitempty"`
}

func operationViewOf(record trackerapp.Record) operationView {
	view := operationView{
		ID:        record.ID,
		Name:      record.Name,
		Status:    string(record.Status),
		TraceID:   record.TraceID,
		SubjectID: record.SubjectID,
		Result:    record.Result,
		CreatedAt: record.CreatedAt.UTC().Format(time.RFC3339Nano),
	}
	if record.Error != nil {
		view.Error = &operationErrorView{Type: record.Error.Type, Message: record.Error.Message}
	}
	if record.FinishedAt != nil {
		view.FinishedAt = record.FinishedAt.UTC().Format(time.RFC3339Nano)
	}
	return view
}

func operationViews(records []trackerapp.Record) []operationView {
	views := make([]operationView, 0, len(records))
	for _, record := range records {
		views = append(views, operationViewOf(record))
	}
	return views
}

// Routes registers the context's routes under prefix (/v1/tracker/operations) on the application's mux.
func Routes(mux *http.ServeMux, prefix string, module *application.Module) {
	mux.HandleFunc("GET "+prefix, func(w http.ResponseWriter, r *http.Request) {
		ctx := presentation.ContextOf(r)
		params := queries.GetOperationsParams{TraceID: r.URL.Query().Get("traceId")}
		records, err := application.Query(application.QueryOf[*queries.GetOperationsHandler](module), params, ctx)
		if err != nil {
			presentation.Refuse(w, err, 0)
			return
		}
		presentation.WriteJSON(w, http.StatusOK, operationViews(records))
	})

	mux.HandleFunc("GET "+prefix+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		ctx := presentation.ContextOf(r)
		record, err := application.Query(application.QueryOf[*queries.GetOperationHandler](module), r.PathValue("id"), ctx)
		if err != nil {
			presentation.Refuse(w, err, 0)
			return
		}
		presentation.WriteJSON(w, http.StatusOK, operationViewOf(record))
	})
}
