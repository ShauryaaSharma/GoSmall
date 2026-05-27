package store

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/go-redis/redis/v8"
	"time"
)

var (
	storeService = &StorageService{}
	ctx          = context.Background()
)

const CacheDuration = 6 * time.Hour

// UserRecord is what we store in Redis for each registered user.
type UserRecord struct {
	Email     string `json:"email"`
	Username  string `json:"username"`
	Password  string `json:"password"`   // stored as plain text (hash in production)
	Name      string `json:"name"`
	Picture   string `json:"picture"`
	Provider  string `json:"provider"`   // "password" or "google"
	CreatedAt int64  `json:"created_at"` // Unix timestamp
}

type StorageService struct {
	redisClient *redis.Client
}

func InitializeStore() *StorageService {
	redisClient := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "",
		DB:       0,
	})

	pong, err := redisClient.Ping(ctx).Result()
	if err != nil {
		panic(fmt.Sprintf("Error init Redis: %v", err))
	}

	fmt.Printf("\nRedis started successfully: pong message = {%s}", pong)
	storeService.redisClient = redisClient
	return storeService
}

// ─── URL functions ────────────────────────────────────────────────────────────

func AliasExists(alias string) bool {
	result, err := storeService.redisClient.Exists(ctx, alias).Result()
	if err != nil {
		return false
	}
	return result > 0
}

func SaveUrlMapping(shortUrl string, originalUrl string, userId string) error {
	err := storeService.redisClient.Set(ctx, shortUrl, originalUrl, CacheDuration).Err()
	if err != nil {
		return fmt.Errorf("failed saving key url | Error: %v - shortUrl: %s - originalUrl: %s", err, shortUrl, originalUrl)
	}
	fmt.Printf("Saved shortUrl: %s - originalUrl: %s\n", shortUrl, originalUrl)
	return nil
}

func RetrieveInitialUrl(shortUrl string) (string, bool) {
	result, err := storeService.redisClient.Get(ctx, shortUrl).Result()
	if err != nil {
		return "", false
	}
	return result, true
}

// ─── User functions ───────────────────────────────────────────────────────────

// userKey returns the Redis key for a user record.
// Keys are namespaced as "user:<email>" so they never clash with short URLs.
func userKey(email string) string {
	return "user:" + email
}

// SaveUser stores a UserRecord in Redis with no expiry (permanent).
func SaveUser(u UserRecord) error {
	data, err := json.Marshal(u)
	if err != nil {
		return fmt.Errorf("failed to marshal user: %v", err)
	}
	return storeService.redisClient.Set(ctx, userKey(u.Email), data, 0).Err()
}

// GetUser retrieves a UserRecord by email. Returns (record, true) if found.
func GetUser(email string) (UserRecord, bool) {
	data, err := storeService.redisClient.Get(ctx, userKey(email)).Result()
	if err != nil {
		return UserRecord{}, false
	}
	var u UserRecord
	if err := json.Unmarshal([]byte(data), &u); err != nil {
		return UserRecord{}, false
	}
	return u, true
}

// UserExists returns true if a user with that email is already registered.
func UserExists(email string) bool {
	result, err := storeService.redisClient.Exists(ctx, userKey(email)).Result()
	if err != nil {
		return false
	}
	return result > 0
}
