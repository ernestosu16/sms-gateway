package modem

import (
	"strings"

	"github.com/mattboston/sms-gateway/internal/apperr"
)

// ATRisk says what running a command can do to the modem or the gateway.
type ATRisk string

const (
	// RiskSafe commands only report information.
	RiskSafe ATRisk = "safe"
	// RiskConfig commands change a setting the gateway tolerates.
	RiskConfig ATRisk = "config"
	// RiskDangerous commands can break the gateway, lose messages or cost
	// money. They need explicit confirmation.
	RiskDangerous ATRisk = "dangerous"
	// RiskUnknown commands are not in the catalog, so their effect cannot be
	// judged. They also need explicit confirmation.
	RiskUnknown ATRisk = "unknown"
)

// RequiresConfirmation reports whether a command of this risk may only run
// after the caller explicitly confirms it.
func (r ATRisk) RequiresConfirmation() bool {
	return r == RiskDangerous || r == RiskUnknown
}

// ATFormKind is one of the four ways an AT command can be invoked.
type ATFormKind string

const (
	FormExecute ATFormKind = "execute" // AT+CMD
	FormRead    ATFormKind = "read"    // AT+CMD?
	FormTest    ATFormKind = "test"    // AT+CMD=?
	FormSet     ATFormKind = "set"     // AT+CMD=<args>, or ATE0 for basic commands
)

// ATForm documents one supported invocation of a command.
type ATForm struct {
	Kind        ATFormKind `json:"kind"`
	Syntax      string     `json:"syntax"`
	Description string     `json:"description"`
}

// ATParamValue documents one accepted value of a parameter.
type ATParamValue struct {
	Value       string `json:"value"`
	Description string `json:"description"`
}

// ATParam documents a command parameter.
type ATParam struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Values      []ATParamValue `json:"values,omitempty"`
}

// ATCommandInfo is the reference entry for one AT command.
type ATCommandInfo struct {
	// Name is the command as written after "AT": "+CSQ", "&F", "I", or ""
	// for the bare AT attention command.
	Name        string    `json:"name"`
	Title       string    `json:"title"`
	Category    string    `json:"category"`
	Description string    `json:"description"`
	Forms       []ATForm  `json:"forms"`
	Params      []ATParam `json:"params,omitempty"`
	Response    string    `json:"response,omitempty"`
	Example     string    `json:"example,omitempty"`
	// Risk applies to the execute and set forms. Read and test forms never
	// change anything and are always safe.
	Risk      ATRisk `json:"risk"`
	Warning   string `json:"warning,omitempty"`
	Reference string `json:"reference,omitempty"`
}

// maxATCommandLength bounds a raw command. Real commands are far shorter; the
// limit keeps a typo or paste from flooding the serial line.
const maxATCommandLength = 256

// ValidateATCommand checks that cmd is a single line of printable ASCII
// starting with AT. Control characters are refused because the serial
// protocol gives them meaning: CR or LF would end the command early and start
// another, and Ctrl-Z would submit a pending SMS. Every error it returns is an
// *apperr.Error.
func ValidateATCommand(cmd string) error {
	if cmd == "" {
		return apperr.New("at_command_required", "invalid AT command: command is required", nil)
	}
	if len(cmd) > maxATCommandLength {
		return apperr.New("at_command_too_long", "invalid AT command: longer than {max} characters", apperr.Params{"max": maxATCommandLength})
	}
	for i := 0; i < len(cmd); i++ {
		if c := cmd[i]; c < 0x20 || c > 0x7e {
			return apperr.New("at_command_not_ascii", "invalid AT command: only printable ASCII characters are allowed", nil)
		}
	}
	if !strings.HasPrefix(strings.ToUpper(cmd), "AT") {
		return apperr.New("at_command_prefix", "invalid AT command: must start with AT", nil)
	}
	return nil
}

// ATClassification is what ClassifyATCommand learned about a command.
type ATClassification struct {
	// Info is the catalog entry, or nil when the command is not in it.
	Info *ATCommandInfo
	Kind ATFormKind
	Risk ATRisk
}

// Warning explains why the command needs confirmation, or is empty.
func (c ATClassification) Warning() string {
	switch {
	case c.Risk == RiskUnknown && c.Info == nil:
		return "This command is not in the gateway's AT command reference, so its effect is unknown."
	case c.Risk == RiskUnknown:
		return "The command could not be fully recognised, for example because several commands are chained together."
	case c.Info != nil:
		return c.Info.Warning
	}
	return ""
}

var catalogIndex = func() map[string]*ATCommandInfo {
	index := make(map[string]*ATCommandInfo, len(ATCatalog))
	for i := range ATCatalog {
		index[ATCatalog[i].Name] = &ATCatalog[i]
	}
	return index
}()

// LookupATCommand returns the catalog entry for a command name as written
// after "AT" ("+CSQ", "&F", "I"), in any case.
func LookupATCommand(name string) *ATCommandInfo {
	return catalogIndex[strings.ToUpper(name)]
}

// ClassifyATCommand works out which catalog command cmd invokes, in which
// form, and how risky that is. Anything it cannot fully account for, such as
// trailing characters or several commands chained with ";", is RiskUnknown so
// that a harmless-looking prefix cannot carry a dangerous command past the
// confirmation step. cmd should already have passed ValidateATCommand.
func ClassifyATCommand(cmd string) ATClassification {
	name, kind, ok := parseATCommand(strings.ToUpper(strings.TrimSpace(cmd)))
	if !ok {
		return ATClassification{Risk: RiskUnknown}
	}
	info := catalogIndex[name]
	switch {
	case info == nil:
		return ATClassification{Kind: kind, Risk: RiskUnknown}
	case kind == FormRead || kind == FormTest:
		return ATClassification{Info: info, Kind: kind, Risk: RiskSafe}
	default:
		return ATClassification{Info: info, Kind: kind, Risk: info.Risk}
	}
}

// parseATCommand splits an upper-cased command into its name and form. ok is
// false when anything is left over after one complete command.
func parseATCommand(cmd string) (name string, kind ATFormKind, ok bool) {
	if !strings.HasPrefix(cmd, "AT") {
		return "", "", false
	}
	rest := cmd[2:]
	if rest == "" {
		return "", FormExecute, true
	}

	// Extended commands: a prefix character followed by the command name.
	if strings.ContainsRune("+^$%#*", rune(rest[0])) {
		end := 1
		for end < len(rest) && isNameChar(rest[end]) {
			end++
		}
		if end == 1 {
			return "", "", false
		}
		name, tail := rest[:end], rest[end:]
		switch {
		case tail == "":
			return name, FormExecute, true
		case tail == "?":
			return name, FormRead, true
		case tail == "=?":
			return name, FormTest, true
		case strings.HasPrefix(tail, "=") && !hasUnquotedSemicolon(tail[1:]):
			return name, FormSet, true
		}
		return "", "", false
	}

	// Basic commands: one letter, or & plus a letter, then optional digits.
	end := 1
	if rest[0] == '&' {
		end = 2
	}
	if end > len(rest) || !isLetter(rest[end-1]) {
		return "", "", false
	}
	name, tail := rest[:end], rest[end:]

	// D takes a dial string, which may itself end in ";" for a voice call.
	if name == "D" {
		if tail == "" {
			return "", "", false
		}
		return name, FormSet, true
	}

	switch {
	case tail == "":
		return name, FormExecute, true
	case tail == "?":
		return name, FormRead, true
	case isDigits(tail):
		return name, FormSet, true
	}
	return "", "", false
}

func hasUnquotedSemicolon(s string) bool {
	quoted := false
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"':
			quoted = !quoted
		case ';':
			if !quoted {
				return true
			}
		}
	}
	return false
}

func isLetter(c byte) bool { return c >= 'A' && c <= 'Z' }

func isNameChar(c byte) bool { return isLetter(c) || (c >= '0' && c <= '9') || c == '_' }

func isDigits(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return s != ""
}

// ParseCLAC extracts command names from an AT+CLAC response. Modems list them
// one per line, with or without the AT prefix; anything that does not look
// like a single command name (blank lines, OK, echoes) is skipped.
func ParseCLAC(resp string) []string {
	seen := make(map[string]bool)
	var names []string
	for _, line := range strings.Split(resp, "\n") {
		line = strings.ToUpper(strings.TrimSpace(line))
		if line == "" || line == "OK" || line == "AT+CLAC" {
			continue
		}
		name := strings.TrimPrefix(line, "AT")
		if !looksLikeCommandName(name) || seen[name] {
			continue
		}
		seen[name] = true
		names = append(names, name)
	}
	return names
}

func looksLikeCommandName(name string) bool {
	if name == "" {
		return false
	}
	start := 0
	if strings.ContainsRune("+^$%#*&", rune(name[0])) {
		start = 1
	}
	if start == len(name) {
		return false
	}
	for i := start; i < len(name); i++ {
		if !isNameChar(name[i]) {
			return false
		}
	}
	return true
}
