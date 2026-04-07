use serde_json::{json, Map, Value};
use crate::data::civics_gen::CIVICS;
use crate::data::types::Civic;
use super::simple_search::{SimpleSearchable, handle};

impl SimpleSearchable for Civic {
    fn key(&self) -> &str { self.key }
    fn category(&self) -> &str { self.category }
    fn to_json(&self) -> Value { json!({"key": self.key, "category": self.category, "is_origin": self.is_origin}) }
}

pub fn handle_query(query: &Map<String, Value>) -> Value { handle(CIVICS, query) }
