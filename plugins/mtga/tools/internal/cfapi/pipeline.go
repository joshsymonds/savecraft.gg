package cfapi

import (
	"fmt"
	"time"
)

// GetPipelineHash returns the content hash for a (tool, set_code) pair from
// mtga_pipeline_state. Returns empty string if no record exists.
func GetPipelineHash(accountID, databaseID, apiToken, tool, setCode string) (string, error) {
	sql := fmt.Sprintf(
		"SELECT content_hash FROM mtga_pipeline_state WHERE tool = %s AND set_code = %s",
		SQLQuote(tool), SQLQuote(setCode),
	)
	rows, err := QueryD1(accountID, databaseID, apiToken, sql)
	if err != nil {
		return "", fmt.Errorf("querying pipeline state: %w", err)
	}
	if len(rows) == 0 {
		return "", nil
	}
	hash, _ := rows[0]["content_hash"].(string)
	return hash, nil
}

// UpdatePipelineState upserts a pipeline state record after a successful import.
func UpdatePipelineState(accountID, databaseID, apiToken, tool, setCode, contentHash string, rowCount int) error {
	sql := fmt.Sprintf(
		"INSERT OR REPLACE INTO mtga_pipeline_state (tool, set_code, content_hash, imported_at, row_count) VALUES (%s, %s, %s, %s, %d)",
		SQLQuote(tool), SQLQuote(setCode), SQLQuote(contentHash),
		SQLQuote(time.Now().UTC().Format(time.RFC3339)), rowCount,
	)
	return ImportD1SQL(accountID, databaseID, apiToken, sql)
}
