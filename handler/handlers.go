package handler

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/eddywm/go-shortner/shortener"
	"github.com/eddywm/go-shortner/store"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// ─── URL handlers ─────────────────────────────────────────────────────────────

type UrlCreationRequest struct {
	LongUrl     string `json:"long_url" binding:"required"`
	UserId      string `json:"user_id"  binding:"required"`
	CustomAlias string `json:"custom_alias"`
}

var aliasRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

func getHost() string {
	return "http://localhost:9808/"
}

func CreateShortUrl(c *gin.Context) {
	var req UrlCreationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var shortUrl string

	if req.CustomAlias != "" {
		if !aliasRegex.MatchString(req.CustomAlias) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Alias can only contain letters, numbers, hyphens and underscores"})
			return
		}
		if len(req.CustomAlias) < 3 || len(req.CustomAlias) > 30 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Alias must be between 3 and 30 characters"})
			return
		}
		if store.AliasExists(req.CustomAlias) {
			c.JSON(http.StatusConflict, gin.H{"error": "This alias is already taken, please choose another"})
			return
		}
		shortUrl = req.CustomAlias
	} else {
		shortUrl = shortener.GenerateShortLink(req.LongUrl, req.UserId)
	}

	if err := store.SaveUrlMapping(shortUrl, req.LongUrl, req.UserId); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save URL mapping"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "short url created successfully",
		"short_url": getHost() + shortUrl,
	})
}

func HandleShortUrlRedirect(c *gin.Context) {
	shortUrl := c.Param("shortUrl")
	initialUrl, found := store.RetrieveInitialUrl(shortUrl)
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "Short URL not found or has expired"})
		return
	}
	c.Redirect(http.StatusFound, initialUrl)
}

// ─── Auth handlers ────────────────────────────────────────────────────────────

type RegisterRequest struct {
	Username string `json:"username" binding:"required"`
	Email    string `json:"email"    binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginRequest struct {
	Email    string `json:"email"    binding:"required"`
	Password string `json:"password" binding:"required"`
}

type GoogleAuthRequest struct {
	Name    string `json:"name"    binding:"required"`
	Email   string `json:"email"   binding:"required"`
	Picture string `json:"picture"`
	Sub     string `json:"sub"     binding:"required"`
}

// Register creates a new account with a bcrypt-hashed password.
func Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Email    = strings.ToLower(strings.TrimSpace(req.Email))
	req.Username = strings.TrimSpace(req.Username)

	if len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Password must be at least 6 characters"})
		return
	}
	if len(req.Username) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Username must be at least 2 characters"})
		return
	}
	if store.UserExists(req.Email) {
		c.JSON(http.StatusConflict, gin.H{"error": "An account with this email already exists"})
		return
	}

	// Hash the password with bcrypt (cost 12 — strong but not slow on modern hardware)
	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to secure password"})
		return
	}

	user := store.UserRecord{
		Email:     req.Email,
		Username:  req.Username,
		Password:  string(hashed), // bcrypt hash, never the raw password
		Name:      req.Username,
		Provider:  "password",
		CreatedAt: time.Now().Unix(),
	}

	if err := store.SaveUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Account created successfully",
		"user": gin.H{
			"email":    user.Email,
			"username": user.Username,
			"name":     user.Name,
			"provider": user.Provider,
		},
	})
}

// Login verifies credentials using bcrypt comparison.
func Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	user, found := store.GetUser(req.Email)
	if !found {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "No account found with this email"})
		return
	}

	if user.Provider == "google" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "This account uses Google sign-in. Please use the Google button."})
		return
	}

	// bcrypt.CompareHashAndPassword returns nil if the password matches the hash
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Incorrect password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"user": gin.H{
			"email":    user.Email,
			"username": user.Username,
			"name":     user.Name,
			"picture":  user.Picture,
			"provider": user.Provider,
		},
	})
}

// GoogleAuth upserts a Google-authenticated user into Redis.
func GoogleAuth(c *gin.Context) {
	var req GoogleAuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	existing, found := store.GetUser(req.Email)
	if found && existing.Provider == "password" {
		// Email already registered with a password — return their existing account
		c.JSON(http.StatusOK, gin.H{
			"message": "Login successful",
			"user": gin.H{
				"email":    existing.Email,
				"username": existing.Username,
				"name":     existing.Name,
				"picture":  existing.Picture,
				"provider": existing.Provider,
			},
		})
		return
	}

	user := store.UserRecord{
		Email:     req.Email,
		Username:  req.Name,
		Name:      req.Name,
		Picture:   req.Picture,
		Provider:  "google",
		CreatedAt: time.Now().Unix(),
	}
	if found {
		user.CreatedAt = existing.CreatedAt // preserve original join date on re-login
	}

	if err := store.SaveUser(user); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save user"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Login successful",
		"user": gin.H{
			"email":    user.Email,
			"username": user.Username,
			"name":     user.Name,
			"picture":  user.Picture,
			"provider": user.Provider,
		},
	})
}
