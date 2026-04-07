use serde_json::{json, Map, Value};

use crate::data::buildings_gen::BUILDINGS;
use super::simple_search::get_limit;

pub fn handle(query: &Map<String, Value>) -> Value {
    let name_filter = query.get("name").and_then(|v| v.as_str());
    let category_filter = query.get("category").and_then(|v| v.as_str());
    let limit = get_limit(query);

    let results: Vec<Value> = BUILDINGS
        .iter()
        .filter(|b| {
            if let Some(name) = name_filter {
                if !b.key.to_ascii_lowercase().contains(&name.to_ascii_lowercase()) {
                    return false;
                }
            }
            if let Some(cat) = category_filter {
                if !b.category.eq_ignore_ascii_case(cat) {
                    return false;
                }
            }
            true
        })
        .take(limit)
        .map(|b| {
            json!({
                "key": b.key,
                "category": b.category,
                "base_buildtime": b.base_buildtime,
                "is_capital": b.is_capital,
            })
        })
        .collect();

    json!({
        "results": results,
        "count": results.len(),
    })
}
