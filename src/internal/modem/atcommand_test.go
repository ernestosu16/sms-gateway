package modem

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/mattboston/sms-gateway/internal/apperr"
)

func TestValidateATCommand(t *testing.T) {
	tests := []struct {
		name    string
		cmd     string
		wantErr bool
	}{
		{name: "bare AT", cmd: "AT"},
		{name: "lower case", cmd: "at+csq"},
		{name: "quoted args", cmd: `AT+CMGL="ALL"`},
		{name: "empty", cmd: "", wantErr: true},
		{name: "no AT prefix", cmd: "+CSQ", wantErr: true},
		{name: "carriage return injects a second command", cmd: "AT+CSQ\rAT+CFUN=0", wantErr: true},
		{name: "line feed", cmd: "AT\n", wantErr: true},
		{name: "ctrl-z would submit an SMS", cmd: "AT\x1a", wantErr: true},
		{name: "non-ASCII", cmd: "AT+CSQñ", wantErr: true},
		{name: "too long", cmd: "AT" + strings.Repeat("A", maxATCommandLength), wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateATCommand(tt.cmd)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateATCommand(%q) error = %v, wantErr %v", tt.cmd, err, tt.wantErr)
			}
			var appErr *apperr.Error
			if err != nil && !errors.As(err, &appErr) {
				t.Errorf("error %v is not an *apperr.Error", err)
			}
		})
	}
}

func TestClassifyATCommand(t *testing.T) {
	tests := []struct {
		cmd      string
		wantName string // "-" for no catalog entry
		wantKind ATFormKind
		wantRisk ATRisk
	}{
		{cmd: "AT", wantName: "", wantKind: FormExecute, wantRisk: RiskSafe},
		{cmd: "at+csq", wantName: "+CSQ", wantKind: FormExecute, wantRisk: RiskSafe},
		{cmd: " AT+CSQ ", wantName: "+CSQ", wantKind: FormExecute, wantRisk: RiskSafe},
		{cmd: "AT+CMGF=1", wantName: "+CMGF", wantKind: FormSet, wantRisk: RiskConfig},
		{cmd: "AT+CFUN=0", wantName: "+CFUN", wantKind: FormSet, wantRisk: RiskDangerous},
		{cmd: "AT+CFUN?", wantName: "+CFUN", wantKind: FormRead, wantRisk: RiskSafe},
		{cmd: "AT+CFUN=?", wantName: "+CFUN", wantKind: FormTest, wantRisk: RiskSafe},
		{cmd: `AT+CMGL="ALL"`, wantName: "+CMGL", wantKind: FormSet, wantRisk: RiskDangerous},
		{cmd: `AT+CPMS="SM;ME"`, wantName: "+CPMS", wantKind: FormSet, wantRisk: RiskConfig},
		{cmd: "ATE0", wantName: "E", wantKind: FormSet, wantRisk: RiskConfig},
		{cmd: "ATI", wantName: "I", wantKind: FormExecute, wantRisk: RiskSafe},
		{cmd: "AT&F", wantName: "&F", wantKind: FormExecute, wantRisk: RiskDangerous},
		{cmd: "ATZ", wantName: "Z", wantKind: FormExecute, wantRisk: RiskDangerous},
		{cmd: "ATD+15551234567;", wantName: "D", wantKind: FormSet, wantRisk: RiskDangerous},
		{cmd: "AT^SYSINFO", wantName: "-", wantKind: FormExecute, wantRisk: RiskUnknown},
		// A safe prefix must not carry a chained command past confirmation.
		{cmd: "AT+CSQ;+CFUN=0", wantName: "-", wantRisk: RiskUnknown},
		{cmd: "AT+CMGF=1;+CFUN=0", wantName: "-", wantRisk: RiskUnknown},
		{cmd: "ATE0&F", wantName: "-", wantRisk: RiskUnknown},
		{cmd: "ATS0=1", wantName: "-", wantRisk: RiskUnknown},
		{cmd: "AT+", wantName: "-", wantRisk: RiskUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.cmd, func(t *testing.T) {
			got := ClassifyATCommand(tt.cmd)
			gotName := "-"
			if got.Info != nil {
				gotName = got.Info.Name
			}
			if gotName != tt.wantName || got.Risk != tt.wantRisk {
				t.Errorf("ClassifyATCommand(%q) = (%q, %s), want (%q, %s)", tt.cmd, gotName, got.Risk, tt.wantName, tt.wantRisk)
			}
			if tt.wantKind != "" && got.Kind != tt.wantKind {
				t.Errorf("ClassifyATCommand(%q).Kind = %s, want %s", tt.cmd, got.Kind, tt.wantKind)
			}
			if got.Risk.RequiresConfirmation() && got.Warning() == "" {
				t.Errorf("ClassifyATCommand(%q) needs confirmation but has no warning", tt.cmd)
			}
		})
	}
}

func TestATCatalogIsConsistent(t *testing.T) {
	seen := make(map[string]bool)
	for _, c := range ATCatalog {
		if seen[c.Name] {
			t.Errorf("duplicate catalog entry %q", c.Name)
		}
		seen[c.Name] = true
		if c.Name != strings.ToUpper(c.Name) {
			t.Errorf("%q: name must be upper case", c.Name)
		}
		if c.Title == "" || c.Description == "" || c.Category == "" || len(c.Forms) == 0 {
			t.Errorf("%q: title, description, category and forms are required", c.Name)
		}
		switch c.Risk {
		case RiskSafe, RiskConfig:
		case RiskDangerous:
			if c.Warning == "" {
				t.Errorf("%q: dangerous commands need a warning", c.Name)
			}
		default:
			t.Errorf("%q: invalid risk %q", c.Name, c.Risk)
		}
		for _, f := range c.Forms {
			if !strings.HasPrefix(f.Syntax, "AT"+c.Name) {
				t.Errorf("%q: form syntax %q does not start with AT%s", c.Name, f.Syntax, c.Name)
			}
		}
		if c.Example != "" {
			if err := ValidateATCommand(c.Example); err != nil {
				t.Errorf("%q: example %q is invalid: %v", c.Name, c.Example, err)
			}
			if got := ClassifyATCommand(c.Example); got.Info == nil || got.Info.Name != c.Name {
				t.Errorf("%q: example %q does not classify as its own command", c.Name, c.Example)
			}
		}
	}
}

func TestParseCLAC(t *testing.T) {
	resp := "\r\nAT+CSQ\r\n+CREG\r\nAT&F\r\n+csq\r\nATI\r\n^SYSINFO\r\n\r\nOK\r\n"
	want := []string{"+CSQ", "+CREG", "&F", "I", "^SYSINFO"}
	if got := ParseCLAC(resp); !reflect.DeepEqual(got, want) {
		t.Errorf("ParseCLAC() = %v, want %v", got, want)
	}

	if got := ParseCLAC("OK (mock response to AT+CLAC)"); len(got) != 0 {
		t.Errorf("ParseCLAC(non-list) = %v, want empty", got)
	}
}
