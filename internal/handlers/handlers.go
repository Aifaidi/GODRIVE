package handlers

import (
	"fmt"
	"godrive/internal/models"
	"godrive/internal/storage"
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type Handler struct {
	DB      *gorm.DB
	Storage storage.StorageProvider
}

func NewHandler(db *gorm.DB, storage storage.StorageProvider) *Handler {
	return &Handler{
		DB:      db,
		Storage: storage,
	}
}

// UploadHandler streams the file to storage and saves metadata
func (h *Handler) UploadHandler(c echo.Context) error {
	// Multipart form file
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid file"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Could not open file"})
	}
	defer src.Close()

	// Process Parent Folder ID
	parentIDStr := c.FormValue("parent_id")
	var parentID *uint
	if parentIDStr != "" && parentIDStr != "null" {
		id, err := strconv.ParseUint(parentIDStr, 10, 32)
		if err == nil {
			uid := uint(id)
			parentID = &uid
		}
	}

	// Save to Storage
	path, size, err := h.Storage.SaveFile(src, file.Filename)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to save file"})
	}

	// Save Metadata to DB
	fileRecord := models.File{
		Name:           file.Filename,
		Size:           size,
		ParentFolderID: parentID,
		StoragePath:    path,
	}

	if err := h.DB.Create(&fileRecord).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to save metadata"})
	}

	return c.JSON(http.StatusOK, fileRecord)
}

// BrowseHandler returns files and folders for a parent_id
func (h *Handler) BrowseHandler(c echo.Context) error {
	view := c.QueryParam("view") // "recent", "starred", "trash", or empty (default)
	parentIDStr := c.QueryParam("parent_id")

	var files []models.File
	var folders []models.Folder

	// Default query scopes (GORM handles DeletedAt automatically for regular queries)
	fileQuery := h.DB.Model(&models.File{})
	folderQuery := h.DB.Model(&models.Folder{})

	// Handle Views
	if view == "recent" {
		// Recent: Flattened list of files, sorted by time, limit 50
		fileQuery = fileQuery.Order("created_at desc").Limit(50)
		folderQuery = folderQuery.Where("1 = 0") // No folders in recent view for now
	} else if view == "starred" {
		fileQuery = fileQuery.Where("is_starred = ?", true)
		folderQuery = folderQuery.Where("is_starred = ?", true)
	} else if view == "trash" {
		// Trash: Show ONLY deleted items. GORM's Unscoped() finds all, including deleted.
		// We filter for deleted_at IS NOT NULL
		fileQuery = fileQuery.Unscoped().Where("deleted_at IS NOT NULL")
		folderQuery = folderQuery.Unscoped().Where("deleted_at IS NOT NULL")
	} else {
		// Default Browse (Hierarchical)
		if parentIDStr == "" || parentIDStr == "null" {
			fileQuery = fileQuery.Where("parent_folder_id IS NULL")
			folderQuery = folderQuery.Where("parent_folder_id IS NULL")
		} else {
			fileQuery = fileQuery.Where("parent_folder_id = ?", parentIDStr)
			folderQuery = folderQuery.Where("parent_folder_id = ?", parentIDStr)
		}
	}

	if err := fileQuery.Find(&files).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to fetch files"})
	}
	if err := folderQuery.Find(&folders).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to fetch folders"})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"files":   files,
		"folders": folders,
	})
}

func (h *Handler) ToggleStarHandler(c echo.Context) error {
	idStr := c.Param("id")
	itemType := c.Param("type")

	if itemType == "file" {
		var file models.File
		if err := h.DB.First(&file, idStr).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "Not found"})
		}
		file.IsStarred = !file.IsStarred
		h.DB.Save(&file)
		return c.JSON(http.StatusOK, file)
	} else {
		var folder models.Folder
		if err := h.DB.First(&folder, idStr).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "Not found"})
		}
		folder.IsStarred = !folder.IsStarred
		h.DB.Save(&folder)
		return c.JSON(http.StatusOK, folder)
	}
}

func (h *Handler) ToggleTrashHandler(c echo.Context) error {
	idStr := c.Param("id")
	itemType := c.Param("type")
	restore := c.QueryParam("restore") == "true"

	if itemType == "file" {
		var file models.File
		// Use Unscoped to find it even if it's already deleted (for restore)
		if err := h.DB.Unscoped().First(&file, idStr).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "Not found"})
		}
		if restore {
			h.DB.Model(&file).Update("deleted_at", nil)
		} else {
			h.DB.Delete(&file)
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	} else {
		var folder models.Folder
		if err := h.DB.Unscoped().First(&folder, idStr).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "Not found"})
		}
		if restore {
			h.DB.Model(&folder).Update("deleted_at", nil)
		} else {
			h.DB.Delete(&folder)
		}
		return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
	}
}

func (h *Handler) StorageQuotaHandler(c echo.Context) error {
	var totalSize int64
	// Sum of all NON-deleted files
	h.DB.Model(&models.File{}).Select("ifnull(sum(size), 0)").Scan(&totalSize)

	const limit = 15 * 1024 * 1024 * 1024 // 15 GB

	return c.JSON(http.StatusOK, map[string]interface{}{
		"used":  totalSize,
		"limit": limit,
	})
}

func (h *Handler) CreateFolderHandler(c echo.Context) error {
	type Request struct {
		Name     string `json:"name"`
		ParentID *uint  `json:"parent_id"`
	}
	var req Request
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
	}

	folder := models.Folder{
		Name:           req.Name,
		ParentFolderID: req.ParentID,
	}

	if err := h.DB.Create(&folder).Error; err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Failed to create folder"})
	}

	return c.JSON(http.StatusOK, folder)
}

func (h *Handler) RenameHandler(c echo.Context) error {
	type Request struct {
		Name string `json:"name"`
	}
	var req Request
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid request"})
	}

	idStr := c.Param("id")
	itemType := c.Param("type") // "file" or "folder"

	if itemType == "file" {
		var file models.File
		if err := h.DB.First(&file, idStr).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "File not found"})
		}
		file.Name = req.Name
		h.DB.Save(&file)
		return c.JSON(http.StatusOK, file)
	} else if itemType == "folder" {
		var folder models.Folder
		if err := h.DB.First(&folder, idStr).Error; err != nil {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "Folder not found"})
		}
		folder.Name = req.Name
		h.DB.Save(&folder)
		return c.JSON(http.StatusOK, folder)
	}

	return c.JSON(http.StatusBadRequest, map[string]string{"error": "Invalid type"})
}

func (h *Handler) DownloadHandler(c echo.Context) error {
	idStr := c.Param("id")
	var file models.File
	if err := h.DB.First(&file, idStr).Error; err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "File not found"})
	}

	// Open file from storage
	f, err := h.Storage.GetFile(file.StoragePath)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "Could not read file"})
	}
	// Note: In a real app we should close f, but Stream sends it.
	// Echo's Stream function takes a Reader, so we need to be careful about closing.
	// However, `http.ServeContent` or `c.Stream` is better.
	// Since Storage.GetFile returns ReadCloser, we can use c.Stream but handling headers manually is better for download.

	// Determine content disposition (inline for preview, attachment for download)
	disposition := "inline"
	if c.QueryParam("download") == "true" {
		disposition = fmt.Sprintf("attachment; filename=\"%s\"", file.Name)
	}

	c.Response().Header().Set("Content-Disposition", disposition)
	// We don't have the mime type stored in DB for this MVP, so we let browser detect or default.

	return c.Stream(http.StatusOK, "application/octet-stream", f)
}
