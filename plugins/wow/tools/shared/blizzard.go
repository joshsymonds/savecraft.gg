// Package shared provides common helpers for WoW data pipeline tools.
package shared

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
)

// GetAppToken fetches a Blizzard app-level access token via client credentials flow.
func GetAppToken(clientID, clientSecret, region string) (string, error) {
	tokenURL := "https://oauth.battle.net/token"
	if region == "kr" || region == "tw" {
		tokenURL = "https://apac.oauth.battle.net/token"
	}

	resp, err := http.PostForm(tokenURL, url.Values{
		"grant_type":    {"client_credentials"},
		"client_id":     {clientID},
		"client_secret": {clientSecret},
	})
	if err != nil {
		return "", fmt.Errorf("token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token request: HTTP %d", resp.StatusCode)
	}

	var result struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decoding token: %w", err)
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("empty access_token in response")
	}
	return result.AccessToken, nil
}

// BlizzardGet fetches a Blizzard API endpoint with Bearer token auth and decodes JSON.
func BlizzardGet(apiURL, token string, out any) error {
	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("GET %s: %w", apiURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: HTTP %d", apiURL, resp.StatusCode)
	}

	return json.NewDecoder(resp.Body).Decode(out)
}

// EnvOrDefault returns the value of an environment variable, or a default if unset.
func EnvOrDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// SaveJSON writes a value as indented JSON to a file, creating parent directories.
func SaveJSON(path string, v any) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Printf("  WARN: couldn't marshal fixture: %v\n", err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fmt.Printf("  WARN: couldn't create dir: %v\n", err)
		return
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		fmt.Printf("  WARN: couldn't write fixture %s: %v\n", path, err)
		return
	}
	fmt.Printf("    Saved fixture: %s\n", path)
}
