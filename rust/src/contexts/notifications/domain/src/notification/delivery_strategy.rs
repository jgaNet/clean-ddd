//! The ordered list of channels to try until one accepts the notification: a value object, so
//! a strategy is always non-empty and free of duplicates, and two strategies with the same
//! channels in the same order are the same strategy — the order is the strategy.

use architecture_domain::{DomainResult, ValueObject};

use super::channel::Channel;
use super::notification_exceptions::empty_delivery_strategy;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeliveryStrategy(Vec<Channel>);

impl DeliveryStrategy {
    pub fn create(channels: &[Channel]) -> DomainResult<DeliveryStrategy> {
        let mut distinct: Vec<Channel> = Vec::new();
        for channel in channels {
            if !distinct.contains(channel) {
                distinct.push(*channel);
            }
        }
        if distinct.is_empty() {
            return Err(empty_delivery_strategy());
        }
        Ok(DeliveryStrategy(distinct))
    }

    pub fn channels(&self) -> &[Channel] {
        &self.0
    }
}

impl ValueObject for DeliveryStrategy {}

#[cfg(test)]
mod tests {
    use super::super::notification_exceptions::EMPTY_DELIVERY_STRATEGY;
    use super::*;

    #[test]
    fn keeps_the_order_drops_the_duplicates_and_refuses_an_empty_one() {
        let strategy = DeliveryStrategy::create(&[Channel::Email, Channel::WebSocket, Channel::Email]).expect("valid");

        assert_eq!(strategy.channels(), [Channel::Email, Channel::WebSocket]);
        assert_eq!(strategy, DeliveryStrategy::create(&[Channel::Email, Channel::WebSocket]).expect("valid"));
        assert_ne!(strategy, DeliveryStrategy::create(&[Channel::WebSocket, Channel::Email]).expect("valid"));
        assert!(DeliveryStrategy::create(&[]).expect_err("empty").is(EMPTY_DELIVERY_STRATEGY));
    }
}
