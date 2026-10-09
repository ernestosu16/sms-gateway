package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
)

const (
	maxProfileNameLength   = 100
	maxProfileTextLength   = 4000
	maxProfileSteps        = 50
	maxProfileStepCommand  = 50
	maxProfileExpectLength = 200
)

// ModemProfileHandler handles carrier setup profile endpoints (admin only).
//
// Profiles are only stored here; the WebUI runs their commands one at a time
// through POST /api/v1/modem/at, so the usual validation and risk confirmation
// apply to every command.
type ModemProfileHandler struct {
	repo *database.Repository
}

// NewModemProfileHandler creates a new ModemProfileHandler.
func NewModemProfileHandler(repo *database.Repository) *ModemProfileHandler {
	return &ModemProfileHandler{repo: repo}
}

// HandleListModemProfiles returns every modem profile ordered by name.
//
// @Summary      List modem profiles
// @Description  Returns the carrier setup profiles, ordered by name. Requires admin privileges.
// @Tags         Modem
// @Produce      json
// @Success      200  {array}   models.ModemProfile
// @Failure      401  {object}  models.ErrorResponse
// @Failure      403  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/modem/profiles [get]
func (h *ModemProfileHandler) HandleListModemProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := h.repo.ListModemProfiles()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "failed to list modem profiles"})
		return
	}
	if profiles == nil {
		profiles = []models.ModemProfile{}
	}
	writeJSON(w, http.StatusOK, profiles)
}

// HandleGetModemProfile returns one modem profile.
//
// @Summary      Get modem profile
// @Description  Returns a carrier setup profile by ID. Requires admin privileges.
// @Tags         Modem
// @Produce      json
// @Param        id   path      string  true  "Profile ID"
// @Success      200  {object}  models.ModemProfile
// @Failure      401  {object}  models.ErrorResponse
// @Failure      403  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/modem/profiles/{id} [get]
func (h *ModemProfileHandler) HandleGetModemProfile(w http.ResponseWriter, r *http.Request) {
	profile, err := h.repo.GetModemProfile(chi.URLParam(r, "id"))
	if err != nil {
		writeModemProfileError(w, err, "failed to load modem profile")
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

// HandleCreateModemProfile creates a modem profile.
//
// @Summary      Create modem profile
// @Description  Creates a carrier setup profile: ordered steps of AT commands, each with an optional case-insensitive regular expression its response must match. Requires admin privileges.
// @Tags         Modem
// @Accept       json
// @Produce      json
// @Param        request  body      models.ModemProfileRequest  true  "Profile to create"
// @Success      201      {object}  models.ModemProfile
// @Failure      400      {object}  models.ErrorResponse
// @Failure      401      {object}  models.ErrorResponse
// @Failure      403      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/modem/profiles [post]
func (h *ModemProfileHandler) HandleCreateModemProfile(w http.ResponseWriter, r *http.Request) {
	var req models.ModemProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid request body"})
		return
	}
	if err := normalizeModemProfileRequest(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	profile, err := h.repo.CreateModemProfile(&models.ModemProfile{
		Name:        req.Name,
		Description: req.Description,
		Notes:       req.Notes,
		Steps:       req.Steps,
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "failed to create modem profile"})
		return
	}
	writeJSON(w, http.StatusCreated, profile)
}

// HandleUpdateModemProfile replaces a modem profile.
//
// @Summary      Update modem profile
// @Description  Replaces a carrier setup profile's name, description, notes and steps. Requires admin privileges.
// @Tags         Modem
// @Accept       json
// @Produce      json
// @Param        id       path      string                      true  "Profile ID"
// @Param        request  body      models.ModemProfileRequest  true  "New profile contents"
// @Success      200      {object}  models.ModemProfile
// @Failure      400      {object}  models.ErrorResponse
// @Failure      401      {object}  models.ErrorResponse
// @Failure      403      {object}  models.ErrorResponse
// @Failure      404      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/modem/profiles/{id} [put]
func (h *ModemProfileHandler) HandleUpdateModemProfile(w http.ResponseWriter, r *http.Request) {
	var req models.ModemProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid request body"})
		return
	}
	if err := normalizeModemProfileRequest(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	profile, err := h.repo.UpdateModemProfile(&models.ModemProfile{
		ID:          chi.URLParam(r, "id"),
		Name:        req.Name,
		Description: req.Description,
		Notes:       req.Notes,
		Steps:       req.Steps,
	})
	if err != nil {
		writeModemProfileError(w, err, "failed to update modem profile")
		return
	}
	writeJSON(w, http.StatusOK, profile)
}

// HandleDeleteModemProfile permanently deletes a modem profile.
//
// @Summary      Delete modem profile
// @Description  Permanently deletes a carrier setup profile. Requires admin privileges.
// @Tags         Modem
// @Produce      json
// @Param        id   path      string  true  "Profile ID"
// @Success      200  {object}  map[string]string  "message: modem profile deleted"
// @Failure      401  {object}  models.ErrorResponse
// @Failure      403  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/modem/profiles/{id} [delete]
func (h *ModemProfileHandler) HandleDeleteModemProfile(w http.ResponseWriter, r *http.Request) {
	if err := h.repo.DeleteModemProfile(chi.URLParam(r, "id")); err != nil {
		writeModemProfileError(w, err, "failed to delete modem profile")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "modem profile deleted"})
}

// writeModemProfileError answers 404 for a missing profile and 500 with msg for
// any other repository failure.
func writeModemProfileError(w http.ResponseWriter, err error, msg string) {
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, models.ErrorResponse{Error: "modem profile not found"})
		return
	}
	writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: msg})
}

// normalizeModemProfileRequest trims req in place and rejects profiles whose
// commands the AT endpoint would refuse or whose expectations cannot compile.
func normalizeModemProfileRequest(req *models.ModemProfileRequest) error {
	req.Name = strings.TrimSpace(req.Name)
	req.Description = strings.TrimSpace(req.Description)
	req.Notes = strings.TrimSpace(req.Notes)

	if req.Name == "" {
		return errors.New("name is required")
	}
	if utf8.RuneCountInString(req.Name) > maxProfileNameLength {
		return fmt.Errorf("name must be at most %d characters", maxProfileNameLength)
	}
	if utf8.RuneCountInString(req.Description) > maxProfileTextLength ||
		utf8.RuneCountInString(req.Notes) > maxProfileTextLength {
		return fmt.Errorf("description and notes must be at most %d characters", maxProfileTextLength)
	}

	if len(req.Steps) == 0 {
		return errors.New("at least one step is required")
	}
	if len(req.Steps) > maxProfileSteps {
		return fmt.Errorf("at most %d steps are allowed", maxProfileSteps)
	}
	for i := range req.Steps {
		step := &req.Steps[i]
		step.Title = strings.TrimSpace(step.Title)
		if step.Title == "" {
			return fmt.Errorf("step %d: title is required", i+1)
		}
		if utf8.RuneCountInString(step.Title) > maxProfileNameLength {
			return fmt.Errorf("step %d: title must be at most %d characters", i+1, maxProfileNameLength)
		}
		if len(step.Commands) == 0 {
			return fmt.Errorf("step %d: at least one command is required", i+1)
		}
		if len(step.Commands) > maxProfileStepCommand {
			return fmt.Errorf("step %d: at most %d commands are allowed", i+1, maxProfileStepCommand)
		}
		for j := range step.Commands {
			c := &step.Commands[j]
			c.Command = strings.TrimSpace(c.Command)
			c.Expect = strings.TrimSpace(c.Expect)
			if err := modem.ValidateATCommand(c.Command); err != nil {
				return fmt.Errorf("step %d, command %d: %w", i+1, j+1, err)
			}
			if c.Expect == "" {
				continue
			}
			if utf8.RuneCountInString(c.Expect) > maxProfileExpectLength {
				return fmt.Errorf("step %d, command %d: expect must be at most %d characters", i+1, j+1, maxProfileExpectLength)
			}
			// The WebUI evaluates expect as a case-insensitive JavaScript
			// RegExp; compiling it the same way here catches typos early.
			if _, err := regexp.Compile("(?i)" + c.Expect); err != nil {
				return fmt.Errorf("step %d, command %d: invalid expect pattern: %w", i+1, j+1, err)
			}
		}
	}
	return nil
}
