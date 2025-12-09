package main

import (
	"embed"
	"godrive/internal/auth"
	"godrive/internal/handlers"
	"godrive/internal/models"
	"godrive/internal/storage"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/glebarez/sqlite"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"gorm.io/gorm"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// 1. Setup DB
	db, err := gorm.Open(sqlite.Open("godrive.db"), &gorm.Config{})
	if err != nil {
		log.Fatal("failed to connect database")
	}

	// Migrate the schema
	db.AutoMigrate(&models.File{}, &models.Folder{})

	// 2. Setup Storage
	store, err := storage.NewLocalStorage("uploads")
	if err != nil {
		log.Fatal(err)
	}

	// 3. Setup Echo
	if err := auth.InitAuth(); err != nil {
		log.Fatal(err)
	}
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS()) // Enable CORS for dev

	// 4. API Routes
	h := handlers.NewHandler(db, store)
	api := e.Group("/api")
	api.Use(auth.Middleware)
	api.GET("/browse", h.BrowseHandler)
	api.POST("/upload", h.UploadHandler)
	api.POST("/folder", h.CreateFolderHandler)
	api.PUT("/rename/:type/:id", h.RenameHandler)
	api.GET("/file/:id/content", h.DownloadHandler)

	api.GET("/storage", h.StorageQuotaHandler)
	api.POST("/star/:type/:id", h.ToggleStarHandler)
	api.DELETE("/trash/:type/:id", h.ToggleTrashHandler) // DELETE to trash, with ?restore=true to restore

	// 5. Serve Frontend (SPA Catch-all)
	// We need to serve static files from 'frontend/dist'
	// AND serve index.html for any unknown route

	// Get the sub-filesystem for frontend/dist
	distFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Printf("Warning: frontend/dist not found (did you run 'npm run build'?). embedded fs error: %v", err)
		// Fallback for dev mode without build
	} else {
		// Serve static files
		e.GET("/*", func(c echo.Context) error {
			path := c.Request().URL.Path

			// API routes handled above
			if strings.HasPrefix(path, "/api") {
				return echo.ErrNotFound
			}

			// runtime config override: verify if 'frontend/dist/config.json' exists on disk
			// This allows K8s volume mounts to override the embedded config
			cleanPath := strings.TrimPrefix(path, "/")
			if cleanPath == "config.json" {
				// Debug log
				log.Println("Checking for runtime config.json...")
				// Try serving from disk first with absolute path
				if _, err := os.Stat("/app/frontend/dist/config.json"); err == nil {
					log.Println("Serving runtime config.json from /app/frontend/dist/config.json")
					return c.File("/app/frontend/dist/config.json")
				} else {
					log.Printf("Runtime config not found: %v", err)
				}
			}

			if cleanPath == "" {
				cleanPath = "index.html"
			}

			file, err := distFS.Open(cleanPath)
			if err == nil {
				defer file.Close()
				stat, _ := file.Stat()
				http.ServeContent(c.Response(), c.Request(), cleanPath, stat.ModTime(), file.(io.ReadSeeker))
				return nil
			}

			// SPA Fallback
			index, err := distFS.Open("index.html")
			if err != nil {
				return c.String(http.StatusInternalServerError, "index.html not found")
			}
			defer index.Close()
			stat, _ := index.Stat()
			http.ServeContent(c.Response(), c.Request(), "index.html", stat.ModTime(), index.(io.ReadSeeker))
			return nil
		})
	}

	e.Logger.Fatal(e.Start(":8080"))
}
