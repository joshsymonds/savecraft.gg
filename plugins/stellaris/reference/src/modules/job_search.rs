use serde_json::{json, Map, Value};
use crate::data::jobs_gen::JOBS;
use crate::data::types::Job;
use super::simple_search::{SimpleSearchable, handle};

impl SimpleSearchable for Job {
    fn key(&self) -> &str { self.key }
    fn category(&self) -> &str { self.category }
    fn to_json(&self) -> Value { json!({"key": self.key, "category": self.category}) }
}

pub fn handle_query(query: &Map<String, Value>) -> Value { handle(JOBS, query) }
