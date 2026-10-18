//! Email delivery. This reference project has no mail server: the adapter logs what it would
//! send. A real one would hand the same `Delivery` to an SMTP client or a provider API, and
//! nothing above this file would change.

use std::sync::Arc;

use architecture_application::Logger;
use notifications_domain::notification::Channel;
use notifications_domain::notification::ports::notification_channel::{Delivery, NotificationChannel};

pub struct EmailChannel {
    logger: Arc<dyn Logger>,
    from_email: String,
}

impl EmailChannel {
    pub fn new(logger: Arc<dyn Logger>, from_email: &str) -> Self {
        Self { logger, from_email: from_email.into() }
    }
}

impl NotificationChannel for EmailChannel {
    fn channel(&self) -> Channel {
        Channel::Email
    }

    async fn is_available_for(&self, _: &str) -> bool {
        true
    }

    async fn deliver(&self, delivery: &Delivery) -> Result<(), String> {
        let Some(to) = delivery.metadata.get("email").filter(|email| !email.is_empty()) else {
            return Err(format!("No email address for recipient {}", delivery.recipient_id));
        };
        self.logger.info("email", &format!("[EMAIL] from {} to {to}: {}", self.from_email, delivery.title));
        self.logger.debug("email", &delivery.content);
        Ok(())
    }
}
