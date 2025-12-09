package models

import (
	"time"

	"gorm.io/gorm"
)

type File struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	Name           string         `json:"name"`
	Size           int64          `json:"size"`
	IsStarred      bool           `json:"is_starred"`
	ParentFolderID *uint          `json:"parent_folder_id"` // Nullable for root
	StoragePath    string         `json:"-"`                // Path on disk/S3, verification hidden
}

type Folder struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	Name           string         `json:"name"`
	IsStarred      bool           `json:"is_starred"`
	ParentFolderID *uint          `json:"parent_folder_id"`
}
