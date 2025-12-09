package auth

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/labstack/echo/v4"
)

var (
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
)

func InitAuth() error {
	issuer := os.Getenv("OIDC_ISSUER")
	if issuer == "" {
		issuer = "http://localhost:8080" // Default Zitadel/Keycloak issuer
	}
	clientID := os.Getenv("OIDC_CLIENT_ID")
	if clientID == "" {
		clientID = "godrive-webapp"
	}

	publicIssuer := os.Getenv("OIDC_PUBLIC_ISSUER")

	ctx := context.Background()
	var err error

	// Retry mechanism for provider discovery
	for i := 0; i < 5; i++ {
		provider, err = oidc.NewProvider(ctx, issuer)
		if err == nil {
			break
		}
		// Log warning?
		fmt.Printf("Warning: Failed to connect to OIDC provider (attempt %d/5): %v\n", i+1, err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return fmt.Errorf("failed to get OIDC provider after retries: %v", err)
	}

	config := &oidc.Config{
		ClientID: clientID,
	}

	// If a separate public issuer is defined, assume tokens will have that issuer
	// and skip the strict check against the provider's discovered issuer.
	if publicIssuer != "" {
		config.SkipIssuerCheck = true
		fmt.Printf("OIDC: Using Public Issuer for validation: %s\n", publicIssuer)
	}

	verifier = provider.Verifier(config)
	fmt.Printf("OIDC Initialized with Provider Issuer: %s, ClientID: %s\n", issuer, clientID)
	return nil
}

func Middleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Skip for OPTIONS (CORS preflight) - Echo handles this usually but good practice
		if c.Request().Method == http.MethodOptions {
			return next(c)
		}

		authHeader := c.Request().Header.Get("Authorization")
		if authHeader == "" {
			return echo.NewHTTPError(http.StatusUnauthorized, "missing authorization header")
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid authorization header format")
		}
		tokenString := parts[1]

		if verifier == nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "OIDC verifier not initialized")
		}

		idToken, err := verifier.Verify(c.Request().Context(), tokenString)
		if err != nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid token: "+err.Error())
		}

		// Manual Issuer Check if we skipped the default one
		publicIssuer := os.Getenv("OIDC_PUBLIC_ISSUER")
		if publicIssuer != "" {
			if idToken.Issuer != publicIssuer {
				return echo.NewHTTPError(http.StatusUnauthorized, fmt.Sprintf("invalid issuer: expected %s, got %s", publicIssuer, idToken.Issuer))
			}
		}

		// Inject user info into context
		c.Set("user_id", idToken.Subject)

		var claims struct {
			Email             string `json:"email"`
			Verified          bool   `json:"email_verified"`
			Name              string `json:"name"`
			PreferredUsername string `json:"preferred_username"`
		}
		if err := idToken.Claims(&claims); err == nil {
			c.Set("email", claims.Email)
			c.Set("username", claims.PreferredUsername)
		}

		return next(c)
	}
}
