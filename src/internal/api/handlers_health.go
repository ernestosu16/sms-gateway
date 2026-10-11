package api

import (
	"net/http"

	"github.com/mattboston/sms-gateway/internal/buildinfo"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/modem"
)

// HealthResponse is the JSON response for the health check endpoint.
type HealthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
	Modem    string `json:"modem"`
	Version  string `json:"version"`
	Commit   string `json:"commit,omitempty"`
}

// HealthHandler handles the health check endpoint.
type HealthHandler struct {
	repo  *database.Repository
	modem modem.Modem
}

// NewHealthHandler creates a new HealthHandler.
func NewHealthHandler(repo *database.Repository, m modem.Modem) *HealthHandler {
	return &HealthHandler{repo: repo, modem: m}
}

// HandleHealth checks database connectivity and modem status, returning the overall health.
//
// @Summary      Health check
// @Description  Checks database connectivity and modem status, returning the overall system health and the running build.
// @Tags         Health
// @Produce      json
// @Success      200  {object}  HealthResponse
// @Failure      503  {object}  HealthResponse
// @Router       /api/v1/health [get]
func (h *HealthHandler) HandleHealth(w http.ResponseWriter, _ *http.Request) {
	resp := HealthResponse{
		Status:   "ok",
		Database: "ok",
		Modem:    "ok",
		Version:  buildinfo.Version,
		Commit:   buildinfo.Commit,
	}
	statusCode := http.StatusOK

	// Check database connectivity.
	if err := h.repo.Ping(); err != nil {
		resp.Database = "error"
		resp.Status = "degraded"
		statusCode = http.StatusServiceUnavailable
	}

	// Check modem status.
	if _, isMock := h.modem.(*modem.MockModem); isMock {
		resp.Modem = "mock"
	} else if err := h.modem.CheckStatus(); err != nil {
		resp.Modem = "error"
		resp.Status = "degraded"
		statusCode = http.StatusServiceUnavailable
	}

	writeJSON(w, statusCode, resp)
}
