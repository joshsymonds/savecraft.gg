use serde_json::{json, Map, Value};
use crate::data::traits_gen::TRAITS;
use crate::data::types::Trait;
use super::simple_search::{SimpleSearchable, handle};

impl SimpleSearchable for Trait {
    fn key(&self) -> &str { self.key }
    fn category(&self) -> &str { self.category }
    fn to_json(&self) -> Value { json!({"key": self.key, "category": self.category, "cost": self.cost}) }
}

pub fn handle_query(query: &Map<String, Value>) -> Value { handle(TRAITS, query) }
