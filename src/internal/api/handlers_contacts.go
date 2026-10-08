package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
)

// ContactHandler handles contact name endpoints.
type ContactHandler struct {
	repo *database.Repository
}

// NewContactHandler creates a new ContactHandler.
func NewContactHandler(repo *database.Repository) *ContactHandler {
	return &ContactHandler{repo: repo}
}

// validateContactName trims name and rejects empty, overlong or control
// characters, returning the cleaned name.
func validateContactName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", errors.New("name is required")
	}
	if utf8.RuneCountInString(name) > models.MaxContactNameRunes {
		return "", fmt.Errorf("name must be at most %d characters", models.MaxContactNameRunes)
	}
	if strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return "", errors.New("name must not contain control characters")
	}
	return name, nil
}

// HandleListContacts returns saved contacts.
//
// @Summary      List contacts
// @Description  Returns saved contact names ordered by name.
// @Tags         Contacts
// @Produce      json
// @Param        q       query     string  false  "Only contacts whose name or number contains this text"
// @Param        limit   query     int     false  "Maximum contacts to return (max 500). Omit to return all."
// @Param        offset  query     int     false  "Contacts to skip. Only applied together with limit."
// @Success      200     {array}   models.Contact  "Total matching contacts is returned in the X-Total-Count header"
// @Failure      400     {object}  models.ErrorResponse
// @Failure      500     {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/contacts [get]
func (h *ContactHandler) HandleListContacts(w http.ResponseWriter, r *http.Request) {
	opts, err := parseListOptions(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}
	search := r.URL.Query().Get("q")

	contacts, err := h.repo.ListContacts(search, opts)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "failed to list contacts"})
		return
	}
	total, err := h.repo.CountContacts(search)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "failed to count contacts"})
		return
	}
	writePage(w, contacts, total)
}

// HandleSaveContact creates or renames the contact for a number.
//
// @Summary      Save contact name
// @Description  Sets the display name for a phone number, creating the contact if needed.
// @Tags         Contacts
// @Accept       json
// @Produce      json
// @Param        phone    query     string                 true  "Phone number of the contact"
// @Param        request  body      models.ContactRequest  true  "Contact name"
// @Success      200      {object}  models.Contact
// @Failure      400      {object}  models.ErrorResponse
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/contacts [put]
func (h *ContactHandler) HandleSaveContact(w http.ResponseWriter, r *http.Request) {
	phone, ok := conversationPhone(w, r)
	if !ok {
		return
	}

	var req models.ContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid request body"})
		return
	}
	name, err := validateContactName(req.Name)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	contact, err := h.repo.SaveContact(phone, name)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "failed to save contact"})
		return
	}
	writeJSON(w, http.StatusOK, contact)
}

// HandleDeleteContact removes the saved name for a number. Its messages stay.
//
// @Summary      Delete contact name
// @Description  Removes the saved name for a phone number. Messages are not affected.
// @Tags         Contacts
// @Produce      json
// @Param        phone  query     string  true  "Phone number of the contact"
// @Success      200    {object}  map[string]string
// @Failure      400    {object}  models.ErrorResponse
// @Failure      404    {object}  models.ErrorResponse
// @Failure      500    {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/contacts [delete]
func (h *ContactHandler) HandleDeleteContact(w http.ResponseWriter, r *http.Request) {
	phone, ok := conversationPhone(w, r)
	if !ok {
		return
	}

	if err := h.repo.DeleteContact(phone); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusNotFound, models.ErrorResponse{Error: "contact not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: "failed to delete contact"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}
