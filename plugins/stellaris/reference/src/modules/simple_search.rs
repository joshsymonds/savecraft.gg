use serde_json::{json, Map, Value};

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

    let results: Vec<Value> = data
        .iter()
        .filter(|item| {
            if let Some(name) = name_filter {
                if !item.key().contains(name) {
                    return false;
                }
            }
            if let Some(cat) = category_filter {
                if item.category() != cat {
                    return false;
                }
            }
            true
        })
        .map(|item| item.to_json())
        .collect();

    json!({"results": results, "count": results.len()})
}
