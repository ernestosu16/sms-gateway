package api

import (
	"encoding/json"
	"net/http"
	"slices"
	"strings"

	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
)

// SendPolicyHandler handles the endpoints for the country policy that
// restricts outbound SMS.
type SendPolicyHandler struct {
	repo *database.Repository
}

// NewSendPolicyHandler creates a new SendPolicyHandler.
func NewSendPolicyHandler(repo *database.Repository) *SendPolicyHandler {
	return &SendPolicyHandler{repo: repo}
}

// HandleGetSendPolicy returns the send country policy.
//
// @Summary      Get send country policy
// @Description  Returns which destination countries outbound SMS may be sent to. Inbound SMS is never restricted.
// @Tags         SMS
// @Produce      json
// @Success      200  {object}  models.SendCountryPolicy
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/send-policy [get]
func (h *SendPolicyHandler) HandleGetSendPolicy(w http.ResponseWriter, _ *http.Request) {
	policy, err := h.repo.GetSendCountryPolicy()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "failed to load send policy"})
		return
	}
	writeJSON(w, http.StatusOK, policy)
}

// HandleUpdateSendPolicy replaces the send country policy.
//
// @Summary      Update send country policy
// @Description  Sets which destination countries outbound SMS may be sent to: mode "all" allows every number, "none" blocks every send, and "selected" only allows international numbers from the listed ISO 3166-1 alpha-2 countries. Requires admin privileges.
// @Tags         SMS
// @Accept       json
// @Produce      json
// @Param        request  body      models.SendCountryPolicy  true  "Policy (updated_at is ignored)"
// @Success      200      {object}  models.SendCountryPolicy
// @Failure      400      {object}  models.ErrorResponse
// @Failure      401      {object}  models.ErrorResponse
// @Failure      403      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/sms/send-policy [put]
func (h *SendPolicyHandler) HandleUpdateSendPolicy(w http.ResponseWriter, r *http.Request) {
	var req models.SendCountryPolicy
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid request body"})
		return
	}

	countries := []string{}
	switch req.Mode {
	case models.SendCountriesAll, models.SendCountriesNone:
		// The list only applies to "selected"; drop it so a stale one is not kept.
	case models.SendCountriesSelected:
		for _, c := range req.Countries {
			c = strings.ToUpper(strings.TrimSpace(c))
			if !models.IsSupportedCountry(c) {
				writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "unknown country code: " + c})
				return
			}
			countries = append(countries, c)
		}
		slices.Sort(countries)
		countries = slices.Compact(countries)
		if len(countries) == 0 {
			writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "select at least one country"})
			return
		}
	default:
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: `mode must be "all", "none" or "selected"`})
		return
	}

	policy, err := h.repo.SaveSendCountryPolicy(req.Mode, countries)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "failed to save send policy"})
		return
	}
	writeJSON(w, http.StatusOK, policy)
}
