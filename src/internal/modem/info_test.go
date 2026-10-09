package modem

import (
	"errors"
	"testing"
)

// scriptedModem answers SendAT from a fixed table and fails anything else;
// other methods come from the mock.
type scriptedModem struct {
	*MockModem
	replies map[string]string
}

func (s scriptedModem) SendAT(cmd string) (string, error) {
	if r, ok := s.replies[cmd]; ok {
		return r, nil
	}
	return "\r\nERROR\r\n", errors.New("AT command error: ERROR")
}

func reply(info string) string { return "\r\n" + info + "\r\n\r\nOK\r\n" }

func TestReadInfo(t *testing.T) {
	tests := []struct {
		name    string
		replies map[string]string
		want    Info
	}{
		{
			"full SIMCom reply set",
			map[string]string{
				"AT+CSPN?": reply(`+CSPN: "Tello",0`),
				"AT+COPS?": reply(`+COPS: 0,0,"T-Mobile",9`),
				"AT+CNUM":  reply(`+CNUM: "","+13055550123",145`),
				"AT+CCID":  reply("89012600000000000000F"),
				"AT+CIMI":  reply("310260000000000"),
				"AT+CGSN":  reply("860000000000000"),
				"AT+CGMI":  reply("SIMCOM INCORPORATED"),
				"AT+CGMM":  reply("SIMCOM_SIM7080G"),
				"AT+CGMR":  reply("Revision:1951B17SIM7080"),
			},
			Info{
				Provider: "Tello", Network: "T-Mobile", PhoneNumber: "+13055550123",
				ICCID: "89012600000000000000F", IMSI: "310260000000000", IMEI: "860000000000000",
				Manufacturer: "SIMCOM INCORPORATED", Model: "SIMCOM_SIM7080G", Firmware: "1951B17SIM7080",
			},
		},
		{
			"prefixed replies",
			map[string]string{
				"AT+CCID": reply("+CCID: 8901260000000000000"),
				"AT+CGSN": reply("+CGSN: 860000000000000"),
				"AT+CGMR": reply("+CGMR: R1.0"),
			},
			Info{ICCID: "8901260000000000000", IMEI: "860000000000000", Firmware: "R1.0"},
		},
		{
			"no number on SIM and not registered",
			map[string]string{
				"AT+CNUM":  "\r\nOK\r\n",
				"AT+COPS?": reply("+COPS: 0"),
			},
			Info{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ReadInfo(scriptedModem{MockModem: NewMockModem(), replies: tt.replies})
			if got != tt.want {
				t.Errorf("ReadInfo() =\n %+v\nwant\n %+v", got, tt.want)
			}
		})
	}
}

func TestReadInfo_Mock(t *testing.T) {
	got := ReadInfo(NewMockModem())
	if got.Provider != "Tello" || got.Network != "T-Mobile" || got.PhoneNumber == "" ||
		got.IMEI == "" || got.ICCID == "" || got.IMSI == "" || got.Firmware == "" {
		t.Errorf("ReadInfo(mock) = %+v, want every field filled", got)
	}
}
