use serde_json::{json, Map, Value};

const DEFAULT_LIMIT: usize = 50;

/// Trait for types that have at minimum a key and category (the SimpleEntry pattern).
pub trait SimpleSearchable {
    fn key(&self) -> &str;
    fn category(&self) -> &str;
    fn to_json(&self) -> Value;
}

/// Generic search handler for any SimpleSearchable static array.
pub fn handle<T: SimpleSearchable>(data: &[T], query: &Map<String, Value>) -> Value {
    let name_filter = query.get("name").and_then(|v| v.as_str());
    let category_filter = query.get("category").and_then(|v| v.as_str());
    let limit = query
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|l| l as usize)
        .unwrap_or(DEFAULT_LIMIT);

    let results: Vec<Value> = data
        .iter()
        .filter(|item| {
            if let Some(name) = name_filter {
                if !item.key().to_ascii_lowercase().contains(&name.to_ascii_lowercase()) {
                    return false;
                }
            }
            if let Some(cat) = category_filter {
                if !item.category().eq_ignore_ascii_case(cat) {
                    return false;
                }
            }
            true
        })
        .take(limit)
        .map(|item| item.to_json())
        .collect();

    json!({"results": results, "count": results.len()})
}

/// Extract the limit parameter from a query, defaulting to DEFAULT_LIMIT.
pub fn get_limit(query: &Map<String, Value>) -> usize {
    query
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|l| l as usize)
        .unwrap_or(DEFAULT_LIMIT)
}
