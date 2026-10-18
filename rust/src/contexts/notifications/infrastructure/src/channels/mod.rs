//! One adapter per `Channel` value.

pub mod email;
pub mod websocket;

pub use email::EmailChannel;
pub use websocket::WebSocketChannel;
