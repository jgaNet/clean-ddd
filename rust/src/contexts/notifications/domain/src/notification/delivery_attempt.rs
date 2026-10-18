//! `DeliveryAttempt` is an entity that is not an aggregate root: it has its own identity (two
//! attempts on the same channel would be two different attempts), but it only exists inside a
//! `Notification`, is created and reached through it, records no events of its own, and is
//! persisted as part of the notification's snapshot. Nothing outside the aggregate holds one.

use std::time::SystemTime;

use architecture_domain::{Entity, Id};

use super::channel::Channel;
use super::dtos::DeliveryAttemptSnapshot;

#[derive(Debug)]
pub struct DeliveryAttempt {
    id: Id,
    channel: Channel,
    at: SystemTime,
    succeeded: bool,
}

impl Entity for DeliveryAttempt {
    fn id(&self) -> &Id {
        &self.id
    }
}

impl DeliveryAttempt {
    pub(super) fn create(channel: Channel, succeeded: bool, at: SystemTime) -> Self {
        Self { id: Id::generate(), channel, at, succeeded }
    }

    pub(super) fn from_snapshot(snapshot: DeliveryAttemptSnapshot) -> Self {
        Self { id: Id::new(snapshot.id), channel: snapshot.channel, at: snapshot.at, succeeded: snapshot.succeeded }
    }

    pub fn to_snapshot(&self) -> DeliveryAttemptSnapshot {
        DeliveryAttemptSnapshot {
            id: self.id.value().to_string(),
            channel: self.channel,
            at: self.at,
            succeeded: self.succeeded,
        }
    }

    pub fn channel(&self) -> Channel {
        self.channel
    }

    pub fn at(&self) -> SystemTime {
        self.at
    }

    pub fn succeeded(&self) -> bool {
        self.succeeded
    }
}
