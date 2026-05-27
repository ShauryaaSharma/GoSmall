package main

import (
	"fmt"
	"github.com/eddywm/go-shortner/handler"
	"github.com/eddywm/go-shortner/store"
	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize Redis store before anything else
	store.InitializeStore()

	r := gin.Default()

	// CORS — allow React dev server (port 3000) to call us
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Health check
	r.GET("/", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "Welcome to the GoSmall URL Shortener API"})
	})

	// ── Auth routes ──────────────────────────────────────────────────────────
	r.POST("/auth/register",    handler.Register)
	r.POST("/auth/login",       handler.Login)
	r.POST("/auth/google",      handler.GoogleAuth)

	// ── URL shortener routes ─────────────────────────────────────────────────
	r.POST("/create-short-url", handler.CreateShortUrl)
	r.GET("/:shortUrl",         handler.HandleShortUrlRedirect)

	err := r.Run(":9808")
	if err != nil {
		panic(fmt.Sprintf("Failed to start the GoSmall server - Error: %v", err))
	}
}
