//! The REST routes of the Notifications context: an account's inbox, a notification marked
//! read (`PATCH /notifications/{id}/read`: a command that changes part of a thing's state
//! without replacing it — the `change-part` verb of the HTTP grammar), and a notification sent
//! by hand. Also what a live notification looks like on the wire ([`render`]), which the wiring
//! hands to the websocket channel: an HTML fragment the HTMX front end swaps out of band.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Module};
use architecture_domain::Exception;
use architecture_presentation::{accept, refused, status_of};
use axum::Router;
use axum::extract::{Extension, Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, patch, post};
use chrono::{DateTime, Utc};
use notifications_application::commands::mark_as_read::MarkAsRead;
use notifications_application::commands::send_notification::SendNotification;
use notifications_application::queries::get_notifications::{GetNotifications, Inbox};
use notifications_domain::notification::notification_exceptions::NOTIFICATION_NOT_FOUND;
use notifications_domain::notification::ports::notification_channel::Delivery;
use notifications_domain::notification::ports::notification_queries::{InboxFilters, NotificationListItem};
use notifications_domain::notification::{Channel, Metadata};
use serde::{Deserialize, Serialize};

/// `/notifications`: an account's inbox, a notification read, one sent by hand.
pub fn notification_routes(module: Arc<Module>) -> Router {
    Router::new()
        .route("/", post(send_notification))
        .route("/account/{recipient_id}", get(get_account_notifications))
        .route("/{id}/read", patch(mark_as_read))
        .with_state(module)
}

/// A live notification as the websocket writes it: an out-of-band swap into `#notifications`.
/// The content is the notification's own markup (a link to validate, a sentence), as the
/// anti-corruption handlers wrote it.
pub fn render(delivery: &Delivery) -> String {
    format!(r##"<div id="notifications" hx-swap-oob="innerHTML">{}</div>"##, delivery.content)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InboxQuery {
    limit: Option<usize>,
    offset: Option<usize>,
    only_unread: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendNotificationBody {
    recipient_id: String,
    title: String,
    content: String,
    /// Shape only (API-BODY-SHAPE): an unknown channel, or none, is the domain's refusal, on the operation.
    channels: Vec<String>,
    #[serde(default)]
    metadata: Metadata,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NotificationView {
    id: String,
    recipient_id: String,
    title: String,
    content: String,
    status: &'static str,
    channels: Vec<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    delivered_via: Option<&'static str>,
    created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sent_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    read_at: Option<DateTime<Utc>>,
    metadata: Metadata,
}

impl From<NotificationListItem> for NotificationView {
    fn from(n: NotificationListItem) -> Self {
        Self {
            id: n.id,
            recipient_id: n.recipient_id,
            title: n.title,
            content: n.content,
            status: n.status.as_str(),
            channels: n.channels.iter().map(|channel| channel.as_str()).collect(),
            delivered_via: n.delivered_via.map(Channel::as_str),
            created_at: n.created_at.into(),
            sent_at: n.sent_at.map(Into::into),
            read_at: n.read_at.map(Into::into),
            metadata: n.metadata,
        }
    }
}

#[derive(Debug, Serialize)]
struct InboxView {
    notifications: Vec<NotificationView>,
    total: usize,
    unread: usize,
}

impl From<Inbox> for InboxView {
    fn from(inbox: Inbox) -> Self {
        Self {
            notifications: inbox.notifications.into_iter().map(NotificationView::from).collect(),
            total: inbox.total,
            unread: inbox.unread,
        }
    }
}

async fn get_account_notifications(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
    Path(recipient_id): Path<String>,
    Query(query): Query<InboxQuery>,
) -> Response {
    let filters =
        InboxFilters { limit: query.limit, offset: query.offset, only_unread: query.only_unread.unwrap_or(false) };
    match module.query::<GetNotifications>().handle(GetNotifications { recipient_id, filters }, &context).await {
        Ok(inbox) => Json(InboxView::from(inbox)).into_response(),
        Err(error) => refuse(error),
    }
}

async fn mark_as_read(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    accept(&context, MarkAsRead { notification_id: id }).into_response()
}

/// Who may send by hand is the handler's guard, not the route's.
async fn send_notification(
    Extension(context): Extension<ExecutionContext>,
    Json(body): Json<SendNotificationBody>,
) -> Response {
    accept(
        &context,
        SendNotification {
            recipient_id: body.recipient_id,
            title: body.title,
            content: body.content,
            channels: body.channels,
            metadata: body.metadata,
        },
    )
    .into_response()
}

fn refuse(error: Exception) -> Response {
    let status = if error.is(NOTIFICATION_NOT_FOUND) { StatusCode::NOT_FOUND } else { status_of(&error) };
    refused(status, &error)
}
