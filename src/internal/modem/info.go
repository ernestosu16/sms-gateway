package modem

import (
	"regexp"
	"strings"
)

// Info identifies the modem and the SIM in it. Every field comes from its own
// query and is left empty when the modem or SIM cannot report it; many SIMs,
// for instance, do not store their own phone number.
type Info struct {
	// Provider is the service provider name stored on the SIM (AT+CSPN?),
	// e.g. the MVNO brand.
	Provider string
	// Network is the operator the modem is registered on (AT+COPS?). For an
	// MVNO this is usually the host network rather than the brand.
	Network string
	// PhoneNumber is the subscriber number stored on the SIM (AT+CNUM).
	PhoneNumber string
	// ICCID is the SIM card serial number (AT+CCID).
	ICCID string
	// IMSI is the subscriber identity on the SIM (AT+CIMI).
	IMSI string
	// IMEI is the modem's hardware identity (AT+CGSN).
	IMEI         string
	Manufacturer string // AT+CGMI
	Model        string // AT+CGMM
	Firmware     string // AT+CGMR
}

var (
	cspnName    = regexp.MustCompile(`\+CSPN:\s*"([^"]*)"`)
	copsName    = regexp.MustCompile(`\+COPS:\s*\d+\s*,\s*\d+\s*,\s*"([^"]*)"`)
	cnumNumber  = regexp.MustCompile(`\+CNUM:\s*"[^"]*"\s*,\s*"([^"]+)"`)
	iccidDigits = regexp.MustCompile(`\b(\d{18,22}F?)\b`)
	imsiDigits  = regexp.MustCompile(`\b(\d{14,15})\b`)
	imeiDigits  = regexp.MustCompile(`\b(\d{14,17})\b`)
	infoPrefix  = regexp.MustCompile(`^(\+[A-Z]+:|Revision:)\s*`)
)

// ReadInfo queries the modem and SIM identity. A query that fails only leaves
// its field empty.
func ReadInfo(m Modem) Info {
	query := func(cmd string, parse func(string) string) string {
		resp, err := m.SendAT(cmd)
		if err != nil {
			return ""
		}
		return parse(resp)
	}
	match := func(re *regexp.Regexp) func(string) string {
		return func(resp string) string { return firstMatch(re, resp) }
	}

	return Info{
		Provider:     query("AT+CSPN?", match(cspnName)),
		Network:      query("AT+COPS?", match(copsName)),
		PhoneNumber:  query("AT+CNUM", match(cnumNumber)),
		ICCID:        query("AT+CCID", match(iccidDigits)),
		IMSI:         query("AT+CIMI", match(imsiDigits)),
		IMEI:         query("AT+CGSN", match(imeiDigits)),
		Manufacturer: query("AT+CGMI", infoLine),
		Model:        query("AT+CGMM", infoLine),
		Firmware:     query("AT+CGMR", infoLine),
	}
}

func firstMatch(re *regexp.Regexp, s string) string {
	if m := re.FindStringSubmatch(s); m != nil {
		return m[1]
	}
	return ""
}

// infoLine returns the first information line of a reply, without any
// "+CMD:" or "Revision:" prefix the modem puts in front of the value.
func infoLine(resp string) string {
	for _, line := range strings.Split(resp, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || line == "OK" {
			continue
		}
		return strings.TrimSpace(infoPrefix.ReplaceAllString(line, ""))
	}
	return ""
}
