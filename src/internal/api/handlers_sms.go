package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/mattboston/sms-gateway/internal/apperr"
	"github.com/mattboston/sms-gateway/internal/database"
	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
	"github.com/mattboston/sms-gateway/internal/webhook"
)

// maxPageSize caps how many messages a single request may return. Values above
// it are clamped rather than rejected, so a client asking for more simply gets
// the maximum instead of an error.
const maxPageSize = 500

// SMSHandler handles SMS-related endpoints.
type SMSHandler struct {
	repo     *database.Repository
	modem    modem.Modem
	webhooks *webhook.Dispatcher
}

// parseListOptions reads the limit and offset query parameters.
//
// Both are optional. Omitting limit returns every matching message, which is
// what this API did before pagination existed and what existing API-key clients
// still expect. offset is only meaningful alongside limit.
func parseListOptions(r *http.Request) (database.ListOptions, error) {
	var opts database.ListOptions

	if raw := r.URL.Query().Get("limit"); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 0 {
			return opts, apperr.New("invalid_limit", "limit must be a non-negative integer", nil)
		}
		if limit > maxPageSize {
			limit = maxPageSize
		}
		opts.Limit = limit
	}

	if raw := r.URL.Query().Get("offset"); raw != "" {
		offset, err := strconv.Atoi(raw)
		if err != nil || offset < 0 {
			return opts, apperr.New("invalid_offset", "offset must be a non-negative integer", nil)
		}
		opts.Offset = offset
	}

	return opts, nil
}

// writePage writes a listing as a bare JSON array with the unpaginated total in
// X-Total-Count.
//
// The array shape is deliberate: wrapping the response in an envelope would
// break every existing client, so the total travels in a header instead and
// paginated clients opt in by reading it. The generic parameter keeps the
// nil-slice normalization in one place — a nil slice would otherwise serialize
// as null and break clients that iterate the result.
func writePage[T any](w http.ResponseWriter, items []T, total int) {
	if items == nil {
		items = []T{}
	}
	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	writeJSON(w, http.StatusOK, items)
}

// NewSMSHandler creates a new SMSHandler.
func NewSMSHandler(repo *database.Repository, m modem.Modem, webhooks *webhook.Dispatcher) *SMSHandler {
	return &SMSHandler{repo: repo, modem: m, webhooks: webhooks}
}

// HandleSendSMS sends an SMS message.
//
// @Summary      Send SMS
// @Description  Sends an SMS message to the specified phone number via the GSM modem. The destination must be allowed by the send country policy.
// @Tags         SMS
// @Accept       json
// @Produce      json
// @Param        request  body      models.SendSMSRequest   true  "SMS message to send"
// @Success      200      {object}  models.SendSMSResponse
// @Failure      400      {object}  models.ErrorResponse
// @Failure      403      {object}  models.ErrorResponse  "Destination country not allowed by the send policy"
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/send [post]
func (h *SMSHandler) HandleSendSMS(w http.ResponseWriter, r *http.Request) {
	var req models.SendSMSRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request_body", "invalid request body")
		return
	}

	// Send to the same normalized number that gets stored, so the modem and the
	// conversation view agree on who the message went to.
	req.To = models.NormalizePhone(req.To)
	if req.To == "" || req.Body == "" {
		writeError(w, http.StatusBadRequest, "recipient_and_body_required", "to and body are required")
		return
	}
	if err := modem.ValidateSMS(req.To, req.Body); err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	// Only outbound SMS is restricted by country; inbound is always accepted.
	policy, err := h.repo.GetSendCountryPolicy()
	if err != nil {
		writeInternalError(w, "failed to load send policy")
		return
	}
	if err := policy.CheckDestination(req.To); err != nil {
		writeAppError(w, http.StatusForbidden, err)
		return
	}

	// Determine API key ID if authenticated via API key.
	var apiKeyID *string
	if ak := GetAPIKeyFromContext(r.Context()); ak != nil {
		apiKeyID = &ak.ID
	}

	// Create the message in pending status.
	msg, err := h.repo.CreateMessage(models.DirectionOutbound, req.To, req.Body, models.StatusPending, apiKeyID)
	if err != nil {
		writeInternalError(w, "failed to create message")
		return
	}

	// Attempt to send via modem.
	if err := h.modem.SendSMS(req.To, req.Body); err != nil {
		errStr := err.Error()
		_ = h.repo.UpdateMessageStatus(msg.ID, models.StatusFailed, nil, &errStr)
		h.notify(models.EventMessageFailed, msg.ID)
		writeJSON(w, http.StatusOK, models.SendSMSResponse{
			ID:      msg.ID,
			Status:  models.StatusFailed,
			Message: "failed to send: " + errStr,
		})
		return
	}

	_ = h.repo.UpdateMessageStatus(msg.ID, models.StatusSent, nil, nil)
	h.notify(models.EventMessageSent, msg.ID)

	writeJSON(w, http.StatusOK, models.SendSMSResponse{
		ID:      msg.ID,
		Status:  models.StatusSent,
		Message: "message sent",
	})
}

// notify sends event to webhooks with the message as stored after its final
// status update, so the payload carries the status and error the event reports.
func (h *SMSHandler) notify(event models.WebhookEvent, messageID string) {
	msg, err := h.repo.GetMessage(messageID)
	if err != nil {
		log.Printf("webhooks: loading message %s for %s: %v", messageID, event, err)
		return
	}
	h.webhooks.Dispatch(event, msg)
}

// HandleGetInbox returns inbound messages.
//
// @Summary      Get inbox messages
// @Description  Returns inbound SMS messages. Use status=received for unread only (default), status=read for read messages, or all=true for everything.
// @Tags         SMS
// @Produce      json
// @Param        status  query     string  false  "Filter by status: received (unread), read"
// @Param        all     query     string  false  "Set to true to return all inbound messages regardless of status"
// @Param        limit   query     int     false  "Maximum messages to return (max 500). Omit to return all."
// @Param        offset  query     int     false  "Messages to skip. Only applied together with limit."
// @Success      200     {array}   models.Message  "Total matching messages is returned in the X-Total-Count header"
// @Failure      400     {object}  models.ErrorResponse
// @Failure      500     {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/inbox [get]
func (h *SMSHandler) HandleGetInbox(w http.ResponseWriter, r *http.Request) {
	var status *models.MessageStatus

	if s := r.URL.Query().Get("status"); r.URL.Query().Get("all") != "true" && s != "" {
		ms := models.MessageStatus(s)
		status = &ms
	} else if r.URL.Query().Get("all") != "true" {
		// Default: only unread messages.
		s := models.StatusReceived
		status = &s
	}

	opts, err := parseListOptions(r)
	if err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	messages, err := h.repo.ListMessages(models.DirectionInbound, status, opts)
	if err != nil {
		writeInternalError(w, "failed to list messages")
		return
	}

	total, err := h.repo.CountMessages(models.DirectionInbound, status)
	if err != nil {
		writeInternalError(w, "failed to count messages")
		return
	}

	writePage(w, messages, total)
}

// HandleMarkRead marks an inbound message as read.
//
// @Summary      Mark message as read
// @Description  Marks an inbound message as read, changing its status from "received" to "read".
// @Tags         SMS
// @Produce      json
// @Param        id   path      string  true  "Message ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/{id}/read [put]
func (h *SMSHandler) HandleMarkRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "message_id_required", "message id is required")
		return
	}

	if err := h.repo.MarkMessageRead(id); err != nil {
		writeError(w, http.StatusNotFound, "message_not_found", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "marked as read"})
}

// HandleMarkUnread marks an inbound message as unread.
//
// @Summary      Mark message as unread
// @Description  Marks an inbound message as unread, changing its status from "read" back to "received".
// @Tags         SMS
// @Produce      json
// @Param        id   path      string  true  "Message ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/{id}/unread [put]
func (h *SMSHandler) HandleMarkUnread(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "message_id_required", "message id is required")
		return
	}

	if err := h.repo.MarkMessageUnread(id); err != nil {
		writeError(w, http.StatusNotFound, "message_not_found", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "marked as unread"})
}

// HandleGetOutbox returns outbound messages.
//
// @Summary      Get outbox messages
// @Description  Returns outbound SMS messages, newest first.
// @Tags         SMS
// @Produce      json
// @Param        limit   query     int  false  "Maximum messages to return (max 500). Omit to return all."
// @Param        offset  query     int  false  "Messages to skip. Only applied together with limit."
// @Success      200  {array}   models.Message  "Total matching messages is returned in the X-Total-Count header"
// @Failure      400  {object}  models.ErrorResponse
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/outbox [get]
func (h *SMSHandler) HandleGetOutbox(w http.ResponseWriter, r *http.Request) {
	opts, err := parseListOptions(r)
	if err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	messages, err := h.repo.ListMessages(models.DirectionOutbound, nil, opts)
	if err != nil {
		writeInternalError(w, "failed to list messages")
		return
	}

	total, err := h.repo.CountMessages(models.DirectionOutbound, nil)
	if err != nil {
		writeInternalError(w, "failed to count messages")
		return
	}

	writePage(w, messages, total)
}

// HandleMessageStats returns message counts aggregated across the whole table.
//
// @Summary      Get message statistics
// @Description  Returns message counts aggregated by direction and status. Lets clients show accurate totals without downloading every message.
// @Tags         SMS
// @Produce      json
// @Success      200  {object}  models.MessageStats
// @Failure      500  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/stats [get]
func (h *SMSHandler) HandleMessageStats(w http.ResponseWriter, _ *http.Request) {
	stats, err := h.repo.MessageStats()
	if err != nil {
		writeInternalError(w, "failed to compute message stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

// HandleDeleteMessage deletes a message by ID.
//
// @Summary      Delete message
// @Description  Deletes a single SMS message by its unique identifier.
// @Tags         SMS
// @Produce      json
// @Param        id   path      string  true  "Message ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/{id} [delete]
func (h *SMSHandler) HandleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "message_id_required", "message id is required")
		return
	}

	if err := h.repo.DeleteMessage(id); err != nil {
		writeError(w, http.StatusNotFound, "message_not_found", err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "deleted"})
}

// HandleGetMessage returns a single message by ID.
//
// @Summary      Get message by ID
// @Description  Returns a single SMS message by its unique identifier.
// @Tags         SMS
// @Produce      json
// @Param        id   path      string  true  "Message ID"
// @Success      200  {object}  models.Message
// @Failure      400  {object}  models.ErrorResponse
// @Failure      404  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/{id} [get]
func (h *SMSHandler) HandleGetMessage(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		writeError(w, http.StatusBadRequest, "message_id_required", "message id is required")
		return
	}

	msg, err := h.repo.GetMessage(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "message_not_found", "message not found")
		return
	}

	writeJSON(w, http.StatusOK, msg)
}

// conversationPhone reads the required phone query parameter used by the
// conversation endpoints. The number travels as a query parameter rather than a
// path segment because a leading "+" is awkward to round-trip through a path.
func conversationPhone(w http.ResponseWriter, r *http.Request) (string, bool) {
	phone := models.NormalizePhone(r.URL.Query().Get("phone"))
	if phone == "" {
		writeError(w, http.StatusBadRequest, "phone_required", "phone is required")
		return "", false
	}
	return phone, true
}

// HandleListConversations returns one entry per phone number.
//
// @Summary      List conversations
// @Description  Returns inbound and outbound messages grouped by phone number, most recent activity first. Each entry carries the latest message and message/unread counts.
// @Tags         SMS
// @Produce      json
// @Param        q       query     string  false  "Only conversations with a message whose number or body contains this text"
// @Param        limit   query     int     false  "Maximum conversations to return (max 500). Omit to return all."
// @Param        offset  query     int     false  "Conversations to skip. Only applied together with limit."
// @Success      200     {array}   models.Conversation  "Total matching conversations is returned in the X-Total-Count header"
// @Failure      400     {object}  models.ErrorResponse
// @Failure      500     {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/conversations [get]
func (h *SMSHandler) HandleListConversations(w http.ResponseWriter, r *http.Request) {
	opts, err := parseListOptions(r)
	if err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}
	search := r.URL.Query().Get("q")

	conversations, err := h.repo.ListConversations(search, opts)
	if err != nil {
		writeInternalError(w, "failed to list conversations")
		return
	}

	total, err := h.repo.CountConversations(search)
	if err != nil {
		writeInternalError(w, "failed to count conversations")
		return
	}

	writePage(w, conversations, total)
}

// HandleGetConversationMessages returns the messages exchanged with one number.
//
// @Summary      Get conversation messages
// @Description  Returns inbound and outbound messages for one phone number, newest first. Page backwards by passing the oldest received message's id as before_id.
// @Tags         SMS
// @Produce      json
// @Param        phone      query     string  true   "Phone number of the conversation"
// @Param        limit      query     int     false  "Maximum messages to return (max 500). Omit to return all."
// @Param        before_id  query     string  false  "Only return messages older than this message"
// @Success      200        {array}   models.Message  "Total messages in the conversation is returned in the X-Total-Count header"
// @Failure      400        {object}  models.ErrorResponse
// @Failure      500        {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/conversations/messages [get]
func (h *SMSHandler) HandleGetConversationMessages(w http.ResponseWriter, r *http.Request) {
	phone, ok := conversationPhone(w, r)
	if !ok {
		return
	}

	opts, err := parseListOptions(r)
	if err != nil {
		writeAppError(w, http.StatusBadRequest, err)
		return
	}

	var before *models.Message
	if beforeID := r.URL.Query().Get("before_id"); beforeID != "" {
		before, err = h.repo.GetMessage(beforeID)
		if err != nil || before.PhoneNumber != phone {
			writeError(w, http.StatusBadRequest, "invalid_before_id", "before_id is not a message in this conversation")
			return
		}
	}

	messages, err := h.repo.ListThread(phone, before, opts.Limit)
	if err != nil {
		writeInternalError(w, "failed to list messages")
		return
	}

	total, err := h.repo.CountThread(phone)
	if err != nil {
		writeInternalError(w, "failed to count messages")
		return
	}

	writePage(w, messages, total)
}

// HandleMarkConversationRead marks every unread message in a conversation read.
//
// @Summary      Mark conversation as read
// @Description  Marks every unread inbound message from the phone number as read.
// @Tags         SMS
// @Produce      json
// @Param        phone  query     string  true  "Phone number of the conversation"
// @Success      200    {object}  models.ConversationUpdateResponse
// @Failure      400    {object}  models.ErrorResponse
// @Failure      500    {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/conversations/read [put]
func (h *SMSHandler) HandleMarkConversationRead(w http.ResponseWriter, r *http.Request) {
	phone, ok := conversationPhone(w, r)
	if !ok {
		return
	}

	n, err := h.repo.MarkConversationRead(phone)
	if err != nil {
		writeInternalError(w, "failed to mark conversation as read")
		return
	}

	writeJSON(w, http.StatusOK, models.ConversationUpdateResponse{Affected: n})
}

// HandleDeleteConversation deletes every message exchanged with a number.
//
// @Summary      Delete conversation
// @Description  Deletes every inbound and outbound message for the phone number.
// @Tags         SMS
// @Produce      json
// @Param        phone  query     string  true  "Phone number of the conversation"
// @Success      200    {object}  models.ConversationUpdateResponse
// @Failure      400    {object}  models.ErrorResponse
// @Failure      500    {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/sms/conversations [delete]
func (h *SMSHandler) HandleDeleteConversation(w http.ResponseWriter, r *http.Request) {
	phone, ok := conversationPhone(w, r)
	if !ok {
		return
	}

	n, err := h.repo.DeleteConversation(phone)
	if err != nil {
		writeInternalError(w, "failed to delete conversation")
		return
	}

	writeJSON(w, http.StatusOK, models.ConversationUpdateResponse{Affected: n})
}
