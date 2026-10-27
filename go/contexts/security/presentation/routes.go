package presentation

import (
	"net/http"
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/presentation"
	"clean-ddd/contexts/security/application/commands"
	"clean-ddd/contexts/security/application/queries"
)

// The two GET …/validate routes are commands on GET because they are links clicked from an
// email; do not copy that for anything else.

type credentialsBody struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

// Routes registers the context's routes under prefix (/v1) on the application's mux.
func Routes(mux *http.ServeMux, prefix string, module *application.Module) {
	auth := prefix + "/auth"

	mux.HandleFunc("POST "+auth+"/signup", func(w http.ResponseWriter, r *http.Request) {
		var body credentialsBody
		if !presentation.DecodeBody(w, r, &body) {
			return
		}
		ctx := presentation.ContextOf(r)
		ctx.Log().Info("Creating new account", application.Meta{"traceId": ctx.TraceID(), "email": body.Identifier})
		// The password is hashed by the handler, behind the PasswordHasher port.
		presentation.Accept(w, ctx, commands.SignUpCommandEvent{Email: body.Identifier, Password: body.Password})
	})

	mux.HandleFunc("GET "+auth+"/validate", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("validation_token")
		if token == "" {
			presentation.WriteJSON(w, http.StatusBadRequest, map[string]string{"message": "validation_token is required"})
			return
		}
		// The token is verified by the handler; whether it is valid is the operation's outcome.
		presentation.Accept(w, presentation.ContextOf(r), commands.ValidateAccountCommandEvent{ValidationToken: token})
	})

	mux.HandleFunc("POST "+auth+"/login", func(w http.ResponseWriter, r *http.Request) {
		var body credentialsBody
		if !presentation.DecodeBody(w, r, &body) {
			return
		}
		format := presentation.FormatOf(r.Header)
		result, err := application.Run(application.CommandOf[*commands.LoginHandler](module),
			commands.LoginCommandEvent{Identifier: body.Identifier, Password: body.Password}, presentation.ContextOf(r))
		if err != nil {
			Error(http.StatusUnauthorized).Present(w, format, err.Error())
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name: "token", Value: result.Token, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteStrictMode,
		})
		LoggedIn.Present(w, format, result.Token)
	})

	mux.HandleFunc("GET "+auth+"/me", func(w http.ResponseWriter, r *http.Request) {
		ctx := presentation.ContextOf(r)
		format := presentation.FormatOf(r.Header)
		detail, err := application.Query(application.QueryOf[*queries.GetAccountHandler](module), ctx.Auth().SubjectID, ctx)
		if err != nil {
			if domain.IsNotAllowed(err) {
				// HTMX swaps the login form back in; an API client gets a 401.
				SignInAgain.Present(w, format, err.Error())
				return
			}
			Error(http.StatusBadRequest).Present(w, format, err.Error())
			return
		}
		Me.Present(w, format, detail)
	})

	mux.HandleFunc("POST "+auth+"/logout", func(w http.ResponseWriter, r *http.Request) {
		http.SetCookie(w, &http.Cookie{Name: "token", Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(0, 0).UTC()})
		LoggedOut.Present(w, presentation.FormatOf(r.Header), "Logout successful")
	})

	mux.HandleFunc("GET "+auth+"/accounts/{id}/validate", func(w http.ResponseWriter, r *http.Request) {
		// Whether this caller may validate by id is the handler's decision, from the context.
		presentation.Accept(w, presentation.ContextOf(r), commands.ValidateAccountCommandEvent{AccountID: r.PathValue("id")})
	})

	mux.HandleFunc("GET "+auth+"/accounts/{id}", func(w http.ResponseWriter, r *http.Request) {
		ctx := presentation.ContextOf(r)
		detail, err := application.Query(application.QueryOf[*queries.GetAccountHandler](module), r.PathValue("id"), ctx)
		if err != nil {
			presentation.Refuse(w, err, 0)
			return
		}
		presentation.WriteJSON(w, http.StatusOK, accountViewOf(detail))
	})
}
