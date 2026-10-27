package application

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	kernel "clean-ddd/sharedkernel/domain"
)

// RequireSignedIn is the one authorization question every context asks first: is there a
// signed-in user or administrator behind this call? It answers with the caller's ID, so a
// handler can hand it to the aggregate. Whether that caller may touch a given object is the
// aggregate's business.
//
// Call it once, at the top of Execute, naming your context so the refusal says where it came
// from: the handler needs the ID anyway, and a Guard that asked the same question would only
// ask it twice. Reserve Guard for rules that need no caller ID, such as "administrators only".
func RequireSignedIn(ctx *application.ExecutionContext, service string) (domain.ID, error) {
	auth := ctx.Auth()
	role, known := kernel.ParseRole(auth.Role)
	if auth.SubjectID == "" || !known || (role != kernel.RoleAdmin && role != kernel.RoleUser) {
		return domain.ID{}, domain.NotAllowed(service, "Authentication required", nil)
	}
	return domain.NewID(auth.SubjectID), nil
}
