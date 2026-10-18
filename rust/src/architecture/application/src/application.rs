//! `Application`: registers modules and starts them against one event bus.
//!
//! The transport is the composition root's business: it builds the bus, registers the modules
//! and the routes, starts the modules, seeds, and only then listens.

use std::collections::BTreeMap;
use std::sync::Arc;

use crate::event_bus::EventBus;
use crate::module::Module;

pub struct Application {
    modules: BTreeMap<&'static str, Arc<Module>>,
    event_bus: Arc<dyn EventBus>,
}

impl Application {
    pub fn new(event_bus: Arc<dyn EventBus>) -> Self {
        Self { modules: BTreeMap::new(), event_bus }
    }

    /// Registers a module; the same `Arc` is what its routes are built over.
    pub fn register_module(mut self, module: Arc<Module>) -> Self {
        self.modules.insert(module.name(), module);
        self
    }

    pub fn event_bus(&self) -> &Arc<dyn EventBus> {
        &self.event_bus
    }

    /// Subscribes every module's handlers to the bus. Awaited, so nothing is served before they listen.
    pub async fn start_modules(&self) {
        for module in self.modules.values() {
            module.start(self.event_bus.as_ref()).await;
        }
    }

    /// # Panics
    ///
    /// When no module of that name was registered: a wiring mistake.
    pub fn module(&self, name: &str) -> &Arc<Module> {
        self.modules.get(name).unwrap_or_else(|| panic!("Module {name} not found"))
    }
}
