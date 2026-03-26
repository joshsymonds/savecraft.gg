package main

import (
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// cachedDownloadGzip downloads a gzipped URL with ETag-based caching.
// Stores the compressed file at cacheDir/filename and the ETag at
// cacheDir/filename.etag. On subsequent calls, a HEAD request checks
// whether the remote ETag matches the cached one; if so, the local
// file is used without re-downloading.
func cachedDownloadGzip(url string, cacheDir string, filename string) (io.ReadCloser, error) {
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		return nil, fmt.Errorf("creating cache dir: %w", err)
	}

	cachePath := filepath.Join(cacheDir, filename)
	etagPath := cachePath + ".etag"

	remoteETag, err := fetchETag(url)
	if err != nil {
		return nil, fmt.Errorf("HEAD request: %w", err)
	}

	if remoteETag != "" {
		if storedETag, err := os.ReadFile(etagPath); err == nil {
			if string(storedETag) == remoteETag {
				return openCachedGzip(cachePath)
			}
		}
	}

	if err := downloadToFile(url, cachePath); err != nil {
		return nil, err
	}

	if remoteETag != "" {
		os.WriteFile(etagPath, []byte(remoteETag), 0644)
	} else {
		os.Remove(etagPath)
	}

	return openCachedGzip(cachePath)
}

func fetchETag(url string) (string, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("HEAD", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Savecraft/1.0 (savecraft.gg)")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HEAD HTTP %d for %s", resp.StatusCode, url)
	}

	return resp.Header.Get("ETag"), nil
}

func downloadToFile(url string, path string) error {
	client := &http.Client{Timeout: 30 * time.Minute} // replay data is ~438MB, needs longer timeout
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "Savecraft/1.0 (savecraft.gg)")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d for %s", resp.StatusCode, url)
	}

	tmpPath := path + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return fmt.Errorf("creating temp cache file: %w", err)
	}

	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(tmpPath)
		return fmt.Errorf("writing cache file: %w", err)
	}

	if err := f.Close(); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("closing temp cache file: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("renaming temp cache file: %w", err)
	}

	return nil
}

type gzipReadCloser struct {
	gz   *gzip.Reader
	body io.ReadCloser
}

func (g *gzipReadCloser) Read(p []byte) (int, error) { return g.gz.Read(p) }
func (g *gzipReadCloser) Close() error {
	g.gz.Close()
	return g.body.Close()
}

func openCachedGzip(path string) (io.ReadCloser, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening cache file: %w", err)
	}

	gz, err := gzip.NewReader(f)
	if err != nil {
		f.Close()
		return nil, fmt.Errorf("gzip: %w", err)
	}

	return &gzipReadCloser{gz: gz, body: f}, nil
}
