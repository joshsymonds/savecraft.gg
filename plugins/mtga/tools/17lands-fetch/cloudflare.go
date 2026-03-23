package main

import (
	"bytes"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// sqlQuote escapes a string for safe SQL embedding (single quotes).
func sqlQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// buildDraftRatingsImportSQL generates the full SQL string for D1 bulk import of draft ratings.
func buildDraftRatingsImportSQL(sets []setResult) string {
	var b strings.Builder

	// Clear existing data (FTS5 and children first, then parents)
	b.WriteString("DELETE FROM mtga_draft_ratings_fts;\n")
	b.WriteString("DELETE FROM mtga_draft_color_stats;\n")
	b.WriteString("DELETE FROM mtga_draft_ratings;\n")
	b.WriteString("DELETE FROM mtga_draft_set_stats;\n")

	for _, sr := range sets {
		// Set stats
		fmt.Fprintf(&b, "INSERT INTO mtga_draft_set_stats (set_code, format, total_games, card_count, avg_gihwr) VALUES (%s, 'PremierDraft', %d, %d, %g);\n",
			sqlQuote(sr.Set), sr.TotalGames, sr.CardCount, round4(sr.AvgGIHWR))

		for _, c := range sr.Cards {
			o := c.Overall

			// Overall ratings
			fmt.Fprintf(&b, "INSERT INTO mtga_draft_ratings (set_code, card_name, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (%s, %s, %d, %d, %d, %g, %g, %g, %g, %g, %g, %g);\n",
				sqlQuote(sr.Set), sqlQuote(c.Name),
				o.GamesInHand, o.GamesPlayed, o.GamesNotSeen,
				round4(o.GIHWR), round4(o.OHWR), round4(o.GDWR), round4(o.GNSWR),
				round4(o.IWD), round4(o.ALSA), round4(o.ATA))

			// FTS5 for card name search
			fmt.Fprintf(&b, "INSERT INTO mtga_draft_ratings_fts (set_code, card_name) VALUES (%s, %s);\n",
				sqlQuote(sr.Set), sqlQuote(c.Name))

			// Color pair breakdowns
			for cp, s := range c.ByColor {
				fmt.Fprintf(&b, "INSERT INTO mtga_draft_color_stats (set_code, card_name, color_pair, games_in_hand, games_played, games_not_seen, gihwr, ohwr, gdwr, gnswr, iwd, alsa, ata) VALUES (%s, %s, %s, %d, %d, %d, %g, %g, %g, %g, %g, %g, %g);\n",
					sqlQuote(sr.Set), sqlQuote(c.Name), sqlQuote(cp),
					s.GamesInHand, s.GamesPlayed, s.GamesNotSeen,
					round4(s.GIHWR), round4(s.OHWR), round4(s.GDWR), round4(s.GNSWR),
					round4(s.IWD), round4(s.ALSA), round4(s.ATA))
			}
		}
	}

	return b.String()
}

// importD1SQL uses the D1 bulk import API to execute a large SQL string.
func importD1SQL(accountID, databaseID, apiToken, sql string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	importURL := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/import", accountID, databaseID)

	sqlBytes := []byte(sql)
	etag := fmt.Sprintf("%x", md5.Sum(sqlBytes))

	// Step 1: Init — get upload URL.
	initBody, _ := json.Marshal(map[string]string{"action": "init", "etag": etag})
	initReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(initBody))
	initReq.Header.Set("Authorization", "Bearer "+apiToken)
	initReq.Header.Set("Content-Type", "application/json")

	initResp, err := client.Do(initReq)
	if err != nil {
		return fmt.Errorf("init: %w", err)
	}
	initRespBody, _ := io.ReadAll(initResp.Body)
	initResp.Body.Close()
	if initResp.StatusCode != http.StatusOK {
		return fmt.Errorf("init: HTTP %d: %s", initResp.StatusCode, string(initRespBody[:min(len(initRespBody), 300)]))
	}

	var initResult struct {
		Result struct {
			UploadURL string `json:"upload_url"`
			Filename  string `json:"filename"`
		} `json:"result"`
	}
	if err := json.Unmarshal(initRespBody, &initResult); err != nil {
		return fmt.Errorf("init: decode: %w (body: %s)", err, string(initRespBody[:min(len(initRespBody), 300)]))
	}
	if initResult.Result.UploadURL == "" {
		return fmt.Errorf("init: empty upload_url in response: %s", string(initRespBody[:min(len(initRespBody), 500)]))
	}

	// Step 2: Upload SQL to the temporary R2 URL.
	uploadReq, _ := http.NewRequest("PUT", initResult.Result.UploadURL, bytes.NewReader(sqlBytes))
	uploadResp, err := client.Do(uploadReq)
	if err != nil {
		return fmt.Errorf("upload: %w", err)
	}
	uploadResp.Body.Close()
	if uploadResp.StatusCode != http.StatusOK {
		return fmt.Errorf("upload: HTTP %d", uploadResp.StatusCode)
	}

	// Step 3: Ingest — trigger the import.
	ingestBody, _ := json.Marshal(map[string]string{
		"action":   "ingest",
		"etag":     etag,
		"filename": initResult.Result.Filename,
	})
	ingestReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(ingestBody))
	ingestReq.Header.Set("Authorization", "Bearer "+apiToken)
	ingestReq.Header.Set("Content-Type", "application/json")

	ingestResp, err := client.Do(ingestReq)
	if err != nil {
		return fmt.Errorf("ingest: %w", err)
	}
	ingestRespBody, _ := io.ReadAll(ingestResp.Body)
	ingestResp.Body.Close()
	if ingestResp.StatusCode != http.StatusOK {
		return fmt.Errorf("ingest: HTTP %d: %s", ingestResp.StatusCode, string(ingestRespBody[:min(len(ingestRespBody), 300)]))
	}

	var ingestResult struct {
		Result struct {
			AtBookmark string `json:"at_bookmark"`
		} `json:"result"`
	}
	if err := json.Unmarshal(ingestRespBody, &ingestResult); err != nil {
		return fmt.Errorf("ingest: decode: %w", err)
	}

	// Step 4: Poll until complete.
	bookmark := ingestResult.Result.AtBookmark
	for range 120 {
		time.Sleep(1 * time.Second)

		pollBody, _ := json.Marshal(map[string]string{
			"action":           "poll",
			"current_bookmark": bookmark,
		})
		pollReq, _ := http.NewRequest("POST", importURL, bytes.NewReader(pollBody))
		pollReq.Header.Set("Authorization", "Bearer "+apiToken)
		pollReq.Header.Set("Content-Type", "application/json")

		pollResp, err := client.Do(pollReq)
		if err != nil {
			return fmt.Errorf("poll: %w", err)
		}
		pollRespBody, _ := io.ReadAll(pollResp.Body)
		pollResp.Body.Close()

		var pollResult struct {
			Result struct {
				Success    bool   `json:"success"`
				Error      string `json:"error"`
				NumQueries int    `json:"num_queries"`
			} `json:"result"`
		}
		if err := json.Unmarshal(pollRespBody, &pollResult); err != nil {
			continue
		}

		if pollResult.Result.Success {
			fmt.Printf("  D1 import complete: %d queries executed\n", pollResult.Result.NumQueries)
			return nil
		}
		if pollResult.Result.Error != "" {
			return fmt.Errorf("import failed: %s", pollResult.Result.Error)
		}
	}

	return fmt.Errorf("import timed out after 120s")
}
