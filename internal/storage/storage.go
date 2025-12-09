package storage

import (
	"io"
	"os"
	"path/filepath"
)

type StorageProvider interface {
	SaveFile(reader io.Reader, filename string) (string, int64, error)
	GetFile(path string) (io.ReadCloser, error)
}

type LocalStorage struct {
	BaseDir string
}

func NewLocalStorage(baseDir string) (*LocalStorage, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, err
	}
	return &LocalStorage{BaseDir: baseDir}, nil
}

func (s *LocalStorage) SaveFile(reader io.Reader, filename string) (string, int64, error) {
	// Simple strategy: keep original filename, handle collisions or uuid in real world
	// For MVP, we'll just save it directly to BaseDir
	path := filepath.Join(s.BaseDir, filename)

	// Create the file
	out, err := os.Create(path)
	if err != nil {
		return "", 0, err
	}
	defer out.Close()

	// Stream copy
	written, err := io.Copy(out, reader)
	if err != nil {
		return "", 0, err
	}

	return path, written, nil
}

func (s *LocalStorage) GetFile(path string) (io.ReadCloser, error) {
	return os.Open(path)
}
