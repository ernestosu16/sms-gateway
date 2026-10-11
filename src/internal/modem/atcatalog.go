package modem

// ATCatalog documents the AT commands a GSM modem commonly supports: the
// ITU-T V.250 basics, 3GPP TS 27.007 for the device, network and SIM, and
// 3GPP TS 27.005 for SMS. It drives validation and confirmation of raw
// commands and the WebUI's autocomplete. Risk ratings are about this gateway:
// a command is dangerous when it can stop the gateway sending or receiving,
// lose messages, or cost money.
//
// The catalog holds structure only. What each command, form, parameter and
// value means is written in the WebUI (web/src/locales/atCatalog.*.ts), keyed
// by Name, so it can be translated there.
var ATCatalog = []ATCommandInfo{
	// --- General ---
	{
		Name:     "",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT"},
		},
		Response:  "OK",
		Example:   "AT",
		Risk:      RiskSafe,
		Reference: "ITU-T V.250",
	},
	{
		Name:     "I",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "ATI"},
		},
		Example:   "ATI",
		Risk:      RiskSafe,
		Reference: "ITU-T V.250 §6.1.3",
	},
	{
		Name:     "E",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "ATE<n>"},
		},
		Params: []ATParam{
			{Name: "n", Values: []string{"0", "1"}},
		},
		Example:   "ATE0",
		Risk:      RiskConfig,
		Reference: "ITU-T V.250 §6.2.4",
	},
	{
		Name:     "V",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "ATV<n>"},
		},
		Params: []ATParam{
			{Name: "n", Values: []string{"0", "1"}},
		},
		Example:   "ATV1",
		Risk:      RiskDangerous,
		Reference: "ITU-T V.250 §6.2.6",
	},
	{
		Name:     "Q",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "ATQ<n>"},
		},
		Params: []ATParam{
			{Name: "n", Values: []string{"0", "1"}},
		},
		Example:   "ATQ0",
		Risk:      RiskDangerous,
		Reference: "ITU-T V.250 §6.2.5",
	},
	{
		Name:     "Z",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "ATZ"},
		},
		Example:   "ATZ",
		Risk:      RiskDangerous,
		Reference: "ITU-T V.250 §6.1.1",
	},
	{
		Name:     "&F",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT&F"},
		},
		Example:   "AT&F",
		Risk:      RiskDangerous,
		Reference: "ITU-T V.250 §6.1.2",
	},
	{
		Name:     "&W",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT&W"},
		},
		Example: "AT&W",
		Risk:    RiskConfig,
	},
	{
		Name:     "+CMEE",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CMEE?"},
			{Kind: FormSet, Syntax: "AT+CMEE=<n>"},
		},
		Params: []ATParam{
			{Name: "n", Values: []string{"0", "1", "2"}},
		},
		Response:  "+CMEE: <n>",
		Example:   "AT+CMEE=2",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.007 §9.1",
	},
	{
		Name:     "+CLAC",
		Category: "General",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CLAC"},
		},
		Response:  "<command>\n<command>\n...",
		Example:   "AT+CLAC",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §8.37",
	},
	// --- Device ---
	{
		Name:     "+CGMI",
		Category: "Device",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CGMI"},
		},
		Example:   "AT+CGMI",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §5.1",
	},
	{
		Name:     "+CGMM",
		Category: "Device",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CGMM"},
		},
		Example:   "AT+CGMM",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §5.2",
	},
	{
		Name:     "+CGMR",
		Category: "Device",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CGMR"},
		},
		Example:   "AT+CGMR",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §5.3",
	},
	{
		Name:     "+CGSN",
		Category: "Device",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CGSN"},
		},
		Example:   "AT+CGSN",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §5.4",
	},
	{
		Name:     "+CFUN",
		Category: "Device",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CFUN?"},
			{Kind: FormTest, Syntax: "AT+CFUN=?"},
			{Kind: FormSet, Syntax: "AT+CFUN=<fun>[,<rst>]"},
		},
		Params: []ATParam{
			{Name: "fun", Values: []string{"0", "1", "4"}},
			{Name: "rst", Values: []string{"0", "1"}},
		},
		Response:  "+CFUN: <fun>",
		Example:   "AT+CFUN?",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.007 §8.2",
	},
	{
		Name:     "+CPAS",
		Category: "Device",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CPAS"},
		},
		Params: []ATParam{
			{Name: "pas", Values: []string{"0", "2", "3", "4"}},
		},
		Response:  "+CPAS: <pas>",
		Example:   "AT+CPAS",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §8.1",
	},
	{
		Name:     "+CCLK",
		Category: "Device",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CCLK?"},
			{Kind: FormSet, Syntax: "AT+CCLK=\"<yy/MM/dd,hh:mm:ss±zz>\""},
		},
		Response:  "+CCLK: \"<yy/MM/dd,hh:mm:ss±zz>\"",
		Example:   "AT+CCLK?",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.007 §8.15",
	},
	// --- Network ---
	{
		Name:     "+CSQ",
		Category: "Network",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CSQ"},
			{Kind: FormTest, Syntax: "AT+CSQ=?"},
		},
		Params: []ATParam{
			{Name: "rssi"},
			{Name: "ber"},
		},
		Response:  "+CSQ: <rssi>,<ber>",
		Example:   "AT+CSQ",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §8.5",
	},
	{
		Name:     "+CREG",
		Category: "Network",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CREG?"},
			{Kind: FormSet, Syntax: "AT+CREG=<n>"},
		},
		Params: []ATParam{
			{Name: "n", Values: []string{"0", "1", "2"}},
			{Name: "stat", Values: []string{"0", "1", "2", "3", "4", "5"}},
		},
		Response:  "+CREG: <n>,<stat>",
		Example:   "AT+CREG?",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.007 §7.2",
	},
	{
		Name:     "+CGREG",
		Category: "Network",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CGREG?"},
			{Kind: FormSet, Syntax: "AT+CGREG=<n>"},
		},
		Params: []ATParam{
			{Name: "stat"},
		},
		Response:  "+CGREG: <n>,<stat>",
		Example:   "AT+CGREG?",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.007 §10.1.20",
	},
	{
		Name:     "+COPS",
		Category: "Network",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+COPS?"},
			{Kind: FormTest, Syntax: "AT+COPS=?"},
			{Kind: FormSet, Syntax: "AT+COPS=<mode>[,<format>[,\"<oper>\"]]"},
		},
		Params: []ATParam{
			{Name: "mode", Values: []string{"0", "1", "2", "4"}},
			{Name: "format", Values: []string{"0", "1", "2"}},
		},
		Response:  "+COPS: <mode>[,<format>,\"<oper>\"]",
		Example:   "AT+COPS?",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.007 §7.3",
	},
	{
		Name:     "+CUSD",
		Category: "Network",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CUSD?"},
			{Kind: FormSet, Syntax: "AT+CUSD=1,\"<code>\",15"},
		},
		Params: []ATParam{
			{Name: "code"},
		},
		Response:  "+CUSD: <m>,\"<text>\",<dcs>",
		Example:   "AT+CUSD=1,\"*100#\",15",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.007 §7.15",
	},
	// --- SIM ---
	{
		Name:     "+CPIN",
		Category: "SIM",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CPIN?"},
			{Kind: FormSet, Syntax: "AT+CPIN=\"<pin>\"[,\"<newpin>\"]"},
		},
		Params: []ATParam{
			{Name: "code", Values: []string{"READY", "SIM PIN", "SIM PUK"}},
		},
		Response:  "+CPIN: <code>",
		Example:   "AT+CPIN?",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.007 §8.3",
	},
	{
		Name:     "+CLCK",
		Category: "SIM",
		Forms: []ATForm{
			{Kind: FormTest, Syntax: "AT+CLCK=?"},
			{Kind: FormSet, Syntax: "AT+CLCK=\"<fac>\",<mode>[,\"<passwd>\"]"},
		},
		Params: []ATParam{
			{Name: "mode", Values: []string{"0", "1", "2"}},
		},
		Example:   "AT+CLCK=\"SC\",2",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.007 §7.4",
	},
	{
		Name:     "+CPWD",
		Category: "SIM",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "AT+CPWD=\"<fac>\",\"<oldpwd>\",\"<newpwd>\""},
		},
		Example:   "AT+CPWD=\"SC\",\"1234\",\"4321\"",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.007 §7.5",
	},
	{
		Name:     "+CIMI",
		Category: "SIM",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CIMI"},
		},
		Example:   "AT+CIMI",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §5.6",
	},
	{
		Name:     "+CNUM",
		Category: "SIM",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CNUM"},
		},
		Response:  "+CNUM: \"<alpha>\",\"<number>\",<type>",
		Example:   "AT+CNUM",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §7.1",
	},
	// --- SMS ---
	{
		Name:     "+CMGF",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CMGF?"},
			{Kind: FormSet, Syntax: "AT+CMGF=<mode>"},
		},
		Params: []ATParam{
			{Name: "mode", Values: []string{"0", "1"}},
		},
		Response:  "+CMGF: <mode>",
		Example:   "AT+CMGF?",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.005 §3.2.3",
	},
	{
		Name:     "+CSCA",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CSCA?"},
			{Kind: FormSet, Syntax: "AT+CSCA=\"<number>\"[,<type>]"},
		},
		Response:  "+CSCA: \"<number>\",<type>",
		Example:   "AT+CSCA?",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.005 §3.3.1",
	},
	{
		Name:     "+CPMS",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CPMS?"},
			{Kind: FormTest, Syntax: "AT+CPMS=?"},
			{Kind: FormSet, Syntax: "AT+CPMS=\"<mem1>\"[,\"<mem2>\"[,\"<mem3>\"]]"},
		},
		Params: []ATParam{
			{Name: "mem1", Values: []string{"\"SM\"", "\"ME\"", "\"MT\""}},
		},
		Response:  "+CPMS: \"<mem1>\",<used1>,<total1>,...",
		Example:   "AT+CPMS?",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.005 §3.2.2",
	},
	{
		Name:     "+CNMI",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CNMI?"},
			{Kind: FormSet, Syntax: "AT+CNMI=<mode>,<mt>,<bm>,<ds>,<bfr>"},
		},
		Params: []ATParam{
			{Name: "mt", Values: []string{"0", "1", "2"}},
		},
		Response:  "+CNMI: <mode>,<mt>,<bm>,<ds>,<bfr>",
		Example:   "AT+CNMI?",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.005 §3.4.1",
	},
	{
		Name:     "+CSCS",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CSCS?"},
			{Kind: FormTest, Syntax: "AT+CSCS=?"},
			{Kind: FormSet, Syntax: "AT+CSCS=\"<chset>\""},
		},
		Params: []ATParam{
			{Name: "chset", Values: []string{"\"GSM\"", "\"IRA\"", "\"UCS2\""}},
		},
		Example:   "AT+CSCS?",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.007 §5.5",
	},
	{
		Name:     "+CSMP",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormRead, Syntax: "AT+CSMP?"},
			{Kind: FormSet, Syntax: "AT+CSMP=<fo>,<vp>,<pid>,<dcs>"},
		},
		Example:   "AT+CSMP?",
		Risk:      RiskConfig,
		Reference: "3GPP TS 27.005 §3.3.2",
	},
	{
		Name:     "+CMGL",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormTest, Syntax: "AT+CMGL=?"},
			{Kind: FormSet, Syntax: "AT+CMGL=<stat>"},
		},
		Params: []ATParam{
			{Name: "stat", Values: []string{"\"REC UNREAD\"", "\"REC READ\"", "\"STO UNSENT\"", "\"STO SENT\"", "\"ALL\""}},
		},
		Response:  "+CMGL: <index>,<stat>,\"<oa>\",...",
		Example:   "AT+CMGL=\"REC READ\"",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.005 §3.4.2",
	},
	{
		Name:     "+CMGR",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "AT+CMGR=<index>"},
		},
		Params: []ATParam{
			{Name: "index"},
		},
		Response:  "+CMGR: <stat>,\"<oa>\",...",
		Example:   "AT+CMGR=1",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.005 §3.4.3",
	},
	{
		Name:     "+CMGD",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormTest, Syntax: "AT+CMGD=?"},
			{Kind: FormSet, Syntax: "AT+CMGD=<index>[,<delflag>]"},
		},
		Params: []ATParam{
			{Name: "delflag", Values: []string{"0", "1", "2", "3", "4"}},
		},
		Example:   "AT+CMGD=1",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.005 §3.5.4",
	},
	{
		Name:     "+CMGS",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "AT+CMGS=\"<number>\""},
		},
		Example:   "AT+CMGS=\"+15551234567\"",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.005 §3.5.1",
	},
	{
		Name:     "+CMGW",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "AT+CMGW=\"<number>\""},
		},
		Example:   "AT+CMGW=\"+15551234567\"",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.005 §3.5.3",
	},
	{
		Name:     "+CMSS",
		Category: "SMS",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "AT+CMSS=<index>[,\"<number>\"]"},
		},
		Example:   "AT+CMSS=3",
		Risk:      RiskDangerous,
		Reference: "3GPP TS 27.005 §3.5.2",
	},
	// --- Calls ---
	{
		Name:     "D",
		Category: "Calls",
		Forms: []ATForm{
			{Kind: FormSet, Syntax: "ATD<number>;"},
		},
		Example:   "ATD+15551234567;",
		Risk:      RiskDangerous,
		Reference: "ITU-T V.250 §6.3.1",
	},
	{
		Name:     "H",
		Category: "Calls",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "ATH"},
		},
		Example:   "ATH",
		Risk:      RiskConfig,
		Reference: "ITU-T V.250 §6.3.6",
	},
	{
		Name:     "A",
		Category: "Calls",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "ATA"},
		},
		Example:   "ATA",
		Risk:      RiskConfig,
		Reference: "ITU-T V.250 §6.3.5",
	},
	{
		Name:     "+CLCC",
		Category: "Calls",
		Forms: []ATForm{
			{Kind: FormExecute, Syntax: "AT+CLCC"},
		},
		Response:  "+CLCC: <id>,<dir>,<stat>,<mode>,<mpty>,\"<number>\",<type>",
		Example:   "AT+CLCC",
		Risk:      RiskSafe,
		Reference: "3GPP TS 27.007 §7.18",
	},
}
