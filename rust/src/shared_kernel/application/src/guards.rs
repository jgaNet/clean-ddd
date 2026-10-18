//! The one authorization question every context asks first: is there a signed-in user or
//! administrator behind this call? It answers with the caller's `Id`, so a handler can hand it
//! to the aggregate. Whether that caller may touch a given object is the aggregate's business.
//!
//! Call it once, at the top of `execute()`, naming your context so the refusal says where it
//! came from: the handler needs the Id anyway, and a `guard()` override that asked the same
//! question would only ask it twice. Reserve `guard()` for rules that need no caller Id, such as
//! "administrators only".

use architecture_application::ExecutionContext;
use architecture_domain::{DomainResult, Exception, Id};
use shared_kernel_domain::Role;

pub fn require_signed_in(context: &ExecutionContext, service: &str) -> DomainResult<Id> {
    let auth = context.auth();
    let role = auth.role.as_deref().and_then(Role::parse);
    match (&auth.subject_id, role) {
        (Some(subject_id), Some(Role::Admin | Role::User)) => Ok(Id::new(subject_id.clone())),
        _ => Err(Exception::not_allowed(service, "Authentication required")),
    }
}
