use serde_json::{json, Map, Value};
use crate::data::edicts_gen::EDICTS;
use crate::data::types::Edict;
use super::simple_search::{SimpleSearchable, handle};

impl SimpleSearchable for Edict {
    fn key(&self) -> &str { self.key }
    fn category(&self) -> &str { self.category }
    fn to_json(&self) -> Value { json!({"key": self.key, "category": self.category, "cost": self.cost}) }
}

pub fn handle_query(query: &Map<String, Value>) -> Value { handle(EDICTS, query) }
