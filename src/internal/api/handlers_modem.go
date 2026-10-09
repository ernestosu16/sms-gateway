package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/mattboston/sms-gateway/internal/models"
	"github.com/mattboston/sms-gateway/internal/modem"
)

// ModemHandler handles modem-related endpoints.
type ModemHandler struct {
	modem modem.Modem

	// supported caches the modem's AT+CLAC list. It is filled on the first
	// successful query and kept for the life of the process, since the
	// command set of a modem does not change while it runs.
	supportedMu sync.Mutex
	supported   []string
}

// ATCatalogResponse is the AT command reference used by the console.
type ATCatalogResponse struct {
	Commands []modem.ATCommandInfo `json:"commands"`
	// Supported lists the command names the modem reported through AT+CLAC,
	// or is null when the modem does not support that query.
	Supported []string `json:"supported"`
}

// NewModemHandler creates a new ModemHandler.
func NewModemHandler(m modem.Modem) *ModemHandler {
	return &ModemHandler{modem: m}
}

// HandleModemStatus checks whether the modem is responsive.
//
// @Summary      Get modem status
// @Description  Checks whether the GSM modem is responsive and returns its current status.
// @Tags         Modem
// @Produce      json
// @Success      200  {object}  models.ModemStatusResponse
// @Failure      503  {object}  models.ModemStatusResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/modem/status [get]
func (h *ModemHandler) HandleModemStatus(w http.ResponseWriter, _ *http.Request) {
	if err := h.modem.CheckStatus(); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, models.ModemStatusResponse{Status: "error"})
		return
	}

	writeJSON(w, http.StatusOK, models.ModemStatusResponse{Status: "ok"})
}

// HandleModemInfo returns the modem and SIM identity (admin only).
//
// @Summary      Get modem and SIM details
// @Description  Returns the line provider and network, the SIM phone number, ICCID and IMSI, and the modem IMEI, manufacturer, model and firmware. A field is empty when the modem or SIM cannot report it; many SIMs do not store their phone number. Requires admin privileges.
// @Tags         Modem
// @Produce      json
// @Success      200  {object}  models.ModemInfoResponse
// @Failure      401  {object}  models.ErrorResponse
// @Failure      403  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/modem/info [get]
func (h *ModemHandler) HandleModemInfo(w http.ResponseWriter, _ *http.Request) {
	i := modem.ReadInfo(h.modem)
	writeJSON(w, http.StatusOK, models.ModemInfoResponse{
		Provider:     i.Provider,
		Network:      i.Network,
		PhoneNumber:  i.PhoneNumber,
		ICCID:        i.ICCID,
		IMSI:         i.IMSI,
		IMEI:         i.IMEI,
		Manufacturer: i.Manufacturer,
		Model:        i.Model,
		Firmware:     i.Firmware,
	})
}

// HandleModemSignal returns the modem signal strength.
//
// @Summary      Get modem signal strength
// @Description  Returns the GSM modem signal strength and quality assessment.
// @Tags         Modem
// @Produce      json
// @Success      200  {object}  models.ModemSignalResponse
// @Failure      503  {object}  models.ErrorResponse
// @Security     BearerAuth
// @Security     ApiKeyAuth
// @Router       /api/v1/modem/signal [get]
func (h *ModemHandler) HandleModemSignal(w http.ResponseWriter, _ *http.Request) {
	signal, err := h.modem.GetSignal()
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, models.ErrorResponse{Error: "failed to get signal strength"})
		return
	}

	quality := signalQuality(signal)
	writeJSON(w, http.StatusOK, models.ModemSignalResponse{Signal: signal, Quality: quality})
}

// HandleSendATCommand sends a raw AT command to the modem (admin only).
//
// @Summary      Send AT command
// @Description  Sends a raw AT command to the GSM modem and returns the response. Requires admin privileges.
// @Tags         Modem
// @Accept       json
// @Produce      json
// @Param        request  body      models.ATCommandRequest   true  "AT command to send"
// @Success      200      {object}  models.ATCommandResponse
// @Failure      400      {object}  models.ErrorResponse
// @Failure      409      {object}  models.ATConfirmationRequired  "Dangerous or unrecognised command sent without confirm"
// @Failure      500      {object}  models.ErrorResponse
// @Security     BearerAuth
// @Router       /api/v1/modem/at [post]
func (h *ModemHandler) HandleSendATCommand(w http.ResponseWriter, r *http.Request) {
	var req models.ATCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: "invalid request body"})
		return
	}

	command := strings.TrimSpace(req.Command)
	if err := modem.ValidateATCommand(command); err != nil {
		writeJSON(w, http.StatusBadRequest, models.ErrorResponse{Error: err.Error()})
		return
	}

	// Commands that can break the gateway, or that the catalog cannot vouch
	// for, only run once the caller has seen the warning and confirmed.
	class := modem.ClassifyATCommand(command)
	if class.Risk.RequiresConfirmation() && !req.Confirm {
		resp := models.ATConfirmationRequired{
			Error:                "this command requires confirmation",
			RequiresConfirmation: true,
			Risk:                 string(class.Risk),
			Warning:              class.Warning(),
		}
		if class.Info != nil {
			resp.Title = class.Info.Title
		}
		writeJSON(w, http.StatusConflict, resp)
		return
	}

	resp, err := h.modem.SendAT(command)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.ErrorResponse{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, models.ATCommandResponse{Response: resp})
}

// HandleATCatalog returns the AT command reference and, when the modem
// supports AT+CLAC, the commands it reports.
//
// @Summary      AT command reference
// @Description  Returns documentation for common AT commands, with the risk of running each, and the command names the modem reports through AT+CLAC (null when unsupported). Requires admin privileges.
// @Tags         Modem
// @Produce      json
// @Success      200  {object}  ATCatalogResponse
// @Security     BearerAuth
// @Router       /api/v1/modem/at/commands [get]
func (h *ModemHandler) HandleATCatalog(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, ATCatalogResponse{
		Commands:  modem.ATCatalog,
		Supported: h.supportedCommands(),
	})
}

// supportedCommands returns the cached AT+CLAC list, querying the modem when
// nothing is cached yet. Failures are not cached, so a modem that was busy or
// disconnected is asked again next time.
func (h *ModemHandler) supportedCommands() []string {
	h.supportedMu.Lock()
	defer h.supportedMu.Unlock()

	if h.supported != nil {
		return h.supported
	}
	resp, err := h.modem.SendAT("AT+CLAC")
	if err != nil {
		return nil
	}
	if names := modem.ParseCLAC(resp); len(names) > 0 {
		h.supported = names
	}
	return h.supported
}

func signalQuality(signal int) string {
	switch {
	case signal == 99:
		return "unknown"
	case signal >= 20:
		return "excellent"
	case signal >= 15:
		return "good"
	case signal >= 10:
		return "fair"
	case signal >= 2:
		return "poor"
	default:
		return "none"
	}
}
