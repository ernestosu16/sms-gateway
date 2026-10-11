import type { ATFormKind } from '@/lib/at';

/** Wording of one catalog command. */
export interface ATCatalogText {
  title: string;
  description: string;
  /** Why the command needs care; shown for its execute and set forms. */
  warning?: string;
  /** What each supported form does, by form kind. */
  forms: Partial<Record<ATFormKind, string>>;
  /** Each parameter by name, with its documented values by value. */
  params?: Record<string, { description: string; values?: Record<string, string> }>;
}

// English text of the AT command reference, keyed by command name as written
// after "AT" ("+CSQ", "&F", "" for the bare attention command). The server's
// catalog (internal/modem/atcatalog.go) holds the structure; all wording lives
// here so the WebUI can translate it.

// Warnings shared by several commands.
const warnResetsStartup =
  'Resets settings the gateway configures at startup (echo off, SMS text mode, verbose errors). Sending and receiving may fail until the gateway is restarted.';
const warnMarksRead =
  'Reading messages marks unread ones as read on the SIM. The gateway only imports unread messages, so anything read here never reaches the inbox.';
const warnNeedsPrompt =
  'This command waits for message text after a ">" prompt, which this console cannot provide. The modem stays blocked until it times out. Use the Send SMS page instead.';

const atCatalogEn = {
  '': {
    title: 'Attention',
    description: 'Checks that the modem is responding. It answers OK and does nothing else.',
    forms: {
      execute: 'Ping the modem.',
    },
  },
  I: {
    title: 'Product identification',
    description: 'Returns manufacturer-specific identification such as the model and firmware.',
    forms: {
      execute: 'Show identification.',
    },
  },
  E: {
    title: 'Command echo',
    description: 'Controls whether the modem echoes commands back.',
    warning:
      'The gateway expects echo off. With ATE1 responses include the command itself; send ATE0 to restore.',
    forms: {
      set: 'Turn echo on or off.',
    },
    params: {
      n: {
        description: 'Echo mode.',
        values: {
          '0': 'Echo off (what the gateway uses)',
          '1': 'Echo on',
        },
      },
    },
  },
  V: {
    title: 'Result code format',
    description: 'Chooses verbose (OK / ERROR) or numeric (0 / 4) result codes.',
    warning:
      'The gateway recognises replies by the words OK and ERROR. Numeric codes (ATV0) make every command appear to hang.',
    forms: {
      set: 'Set the result code format.',
    },
    params: {
      n: {
        description: 'Format.',
        values: {
          '0': 'Numeric codes',
          '1': 'Verbose codes (required by the gateway)',
        },
      },
    },
  },
  Q: {
    title: 'Quiet result codes',
    description: 'Suppresses result codes entirely when set to 1.',
    warning:
      'Without result codes (ATQ1) the gateway cannot tell when a command finishes, so every command times out.',
    forms: {
      set: 'Enable or suppress result codes.',
    },
    params: {
      n: {
        description: 'Mode.',
        values: {
          '0': 'Send result codes (required by the gateway)',
          '1': 'Suppress result codes',
        },
      },
    },
  },
  Z: {
    title: 'Reset to stored profile',
    description: "Restores the settings saved in the modem's user profile.",
    warning: warnResetsStartup,
    forms: {
      execute: 'Reset settings.',
    },
  },
  '&F': {
    title: 'Factory defaults',
    description: "Restores the manufacturer's default configuration.",
    warning: warnResetsStartup,
    forms: {
      execute: 'Load factory settings.',
    },
  },
  '&W': {
    title: 'Save profile',
    description: 'Stores the current settings as the user profile that ATZ and power-up restore.',
    forms: {
      execute: 'Save current settings.',
    },
  },
  '+CMEE': {
    title: 'Error reporting',
    description:
      'Controls whether errors are reported as a plain ERROR or with a +CME ERROR code or text.',
    forms: {
      read: 'Show the current mode.',
      set: 'Set the mode.',
    },
    params: {
      n: {
        description: 'Reporting mode.',
        values: {
          '0': 'Plain ERROR',
          '1': 'Numeric +CME ERROR codes (gateway default)',
          '2': 'Verbose +CME ERROR text',
        },
      },
    },
  },
  '+CLAC': {
    title: 'List available commands',
    description:
      'Lists every AT command the modem supports, one per line. The console uses it to mark which suggestions this modem accepts.',
    forms: {
      execute: 'List supported commands.',
    },
  },
  '+CGMI': {
    title: 'Manufacturer',
    description: 'Returns the manufacturer name.',
    forms: {
      execute: 'Show the manufacturer.',
    },
  },
  '+CGMM': {
    title: 'Model',
    description: 'Returns the model identification.',
    forms: {
      execute: 'Show the model.',
    },
  },
  '+CGMR': {
    title: 'Firmware revision',
    description: 'Returns the firmware revision.',
    forms: {
      execute: 'Show the firmware revision.',
    },
  },
  '+CGSN': {
    title: 'IMEI',
    description: "Returns the modem's serial number (IMEI).",
    forms: {
      execute: 'Show the IMEI.',
    },
  },
  '+CFUN': {
    title: 'Phone functionality',
    description:
      'Reads or sets the functionality level: full, minimum, or radio off. Some modems also accept a reset flag.',
    warning:
      'Levels other than 1 turn the radio off, so no SMS can be sent or received. A reset drops the modem off the serial port.',
    forms: {
      read: 'Show the current level.',
      test: 'List supported levels.',
      set: 'Change the level.',
    },
    params: {
      fun: {
        description: 'Functionality level.',
        values: {
          '0': 'Minimum functionality',
          '1': 'Full functionality',
          '4': 'Radio off (flight mode)',
        },
      },
      rst: {
        description: 'Reset before changing.',
        values: {
          '0': 'Do not reset',
          '1': 'Reset the modem',
        },
      },
    },
  },
  '+CPAS': {
    title: 'Activity status',
    description: 'Reports whether the modem is ready, ringing or in a call.',
    forms: {
      execute: 'Show the activity status.',
    },
    params: {
      pas: {
        description: 'Status in the response.',
        values: {
          '0': 'Ready',
          '2': 'Unknown',
          '3': 'Ringing',
          '4': 'Call in progress',
        },
      },
    },
  },
  '+CCLK': {
    title: 'Clock',
    description: "Reads or sets the modem's real-time clock.",
    forms: {
      read: 'Show the time.',
      set: 'Set the time (zz is the offset in quarter hours).',
    },
  },
  '+CSQ': {
    title: 'Signal quality',
    description:
      'Reports received signal strength (rssi) and bit error rate. Signal in dBm is -113 + 2 × rssi.',
    forms: {
      execute: 'Show the signal quality.',
      test: 'List supported values.',
    },
    params: {
      rssi: { description: '0 is -113 dBm or less, 31 is -51 dBm or more, 99 is unknown.' },
      ber: { description: 'Bit error rate 0-7, 99 is unknown.' },
    },
  },
  '+CREG': {
    title: 'Network registration',
    description:
      'Shows whether the modem is registered on the network, and controls unsolicited registration reports.',
    warning: 'Unsolicited reports (n=1 or 2) can appear in the middle of other command responses.',
    forms: {
      read: 'Show the registration status.',
      set: 'Set unsolicited reporting.',
    },
    params: {
      n: {
        description: 'Unsolicited reporting.',
        values: {
          '0': 'Disabled',
          '1': 'Report status changes',
          '2': 'Report status and cell location',
        },
      },
      stat: {
        description: 'Status in the response.',
        values: {
          '0': 'Not registered, not searching',
          '1': 'Registered, home network',
          '2': 'Not registered, searching',
          '3': 'Registration denied',
          '4': 'Unknown',
          '5': 'Registered, roaming',
        },
      },
    },
  },
  '+CGREG': {
    title: 'Packet data registration',
    description: 'Like +CREG but for the packet-switched (GPRS) network.',
    forms: {
      read: 'Show the registration status.',
      set: 'Set unsolicited reporting.',
    },
    params: {
      stat: { description: 'Status in the response; same values as +CREG.' },
    },
  },
  '+COPS': {
    title: 'Operator selection',
    description: 'Shows the current operator, lists available ones, or forces a selection.',
    warning:
      'Manual selection or deregistration can leave the modem without network service until it is set back to automatic (AT+COPS=0).',
    forms: {
      read: 'Show the current operator.',
      test: 'Scan for operators (can take over a minute and time out here).',
      set: 'Select an operator.',
    },
    params: {
      mode: {
        description: 'Selection mode.',
        values: {
          '0': 'Automatic',
          '1': 'Manual',
          '2': 'Deregister from the network',
          '4': 'Manual, falling back to automatic',
        },
      },
      format: {
        description: 'Operator name format.',
        values: {
          '0': 'Long alphanumeric',
          '1': 'Short alphanumeric',
          '2': 'Numeric (MCC+MNC)',
        },
      },
    },
  },
  '+CUSD': {
    title: 'USSD request',
    description:
      "Sends a USSD code such as a balance check. The answer arrives as an unsolicited +CUSD line, often after this console's 5 second timeout.",
    forms: {
      read: 'Show whether results are reported.',
      set: 'Send a USSD code.',
    },
    params: {
      code: { description: 'USSD string, for example *100#.' },
    },
  },
  '+CPIN': {
    title: 'SIM PIN',
    description: 'Shows whether the SIM is ready or waiting for a PIN or PUK, and enters it.',
    warning: 'Each wrong PIN uses up an attempt. After three the SIM locks and needs the PUK.',
    forms: {
      read: 'Show the SIM state.',
      set: 'Enter the PIN (or PUK and a new PIN).',
    },
    params: {
      code: {
        description: 'State in the response.',
        values: {
          READY: 'No PIN needed',
          'SIM PIN': 'Waiting for the PIN',
          'SIM PUK': 'Waiting for the PUK (PIN blocked)',
        },
      },
    },
  },
  '+CLCK': {
    title: 'Facility lock',
    description:
      'Locks, unlocks or queries facilities such as the SIM PIN requirement or call barring.',
    warning:
      'Enabling the SIM PIN lock ("SC") makes the SIM ask for a PIN on every power-up, which stops the gateway until it is entered.',
    forms: {
      test: 'List supported facilities.',
      set: 'Lock, unlock or query a facility.',
    },
    params: {
      mode: {
        description: 'Operation.',
        values: {
          '0': 'Unlock',
          '1': 'Lock',
          '2': 'Query status',
        },
      },
    },
  },
  '+CPWD': {
    title: 'Change password',
    description: 'Changes the password of a facility, such as the SIM PIN.',
    warning: 'A wrong old password uses up an attempt and can lock the SIM.',
    forms: {
      set: 'Change a password.',
    },
  },
  '+CIMI': {
    title: 'IMSI',
    description: 'Returns the subscriber identity (IMSI) stored on the SIM.',
    forms: {
      execute: 'Show the IMSI.',
    },
  },
  '+CNUM': {
    title: 'Own number',
    description: "Returns the subscriber's own phone number, if the SIM stores it.",
    forms: {
      execute: 'Show the phone number.',
    },
  },
  '+CMGF': {
    title: 'SMS format',
    description:
      'Selects text or PDU mode for SMS commands. The gateway rests in text mode and switches to PDU mode itself while sending and receiving.',
    forms: {
      read: 'Show the current mode.',
      set: 'Set the mode.',
    },
    params: {
      mode: {
        description: 'SMS format.',
        values: {
          '0': 'PDU mode',
          '1': 'Text mode',
        },
      },
    },
  },
  '+CSCA': {
    title: 'Service centre address',
    description:
      'Reads or sets the SMS service centre (SMSC) number every outgoing SMS goes through.',
    warning: 'A wrong service centre number makes every outgoing SMS fail.',
    forms: {
      read: 'Show the SMSC number.',
      set: 'Set the SMSC number.',
    },
  },
  '+CPMS': {
    title: 'Message storage',
    description:
      'Selects where messages are read, written and received: SIM ("SM"), modem ("ME") or both ("MT"). The response includes used and total slots.',
    warning:
      'The gateway reads incoming messages from the selected storage; moving it can hide messages already stored elsewhere.',
    forms: {
      read: 'Show storages and usage.',
      test: 'List supported storages.',
      set: 'Select storages.',
    },
    params: {
      mem1: {
        description: 'Storage for reading, listing and deleting.',
        values: {
          '"SM"': 'SIM card',
          '"ME"': 'Modem memory',
          '"MT"': 'SIM and modem memory',
        },
      },
    },
  },
  '+CNMI': {
    title: 'New message indications',
    description:
      'Controls how the modem announces new messages. The gateway polls for messages and does not rely on indications.',
    warning:
      'With mt=2 messages are forwarded without being stored, so the gateway never sees them. Other indications can also interleave with command responses.',
    forms: {
      read: 'Show the current settings.',
      set: 'Change the settings.',
    },
    params: {
      mt: {
        description: 'Delivery of new SMS.',
        values: {
          '0': 'No indication',
          '1': 'Store and send +CMTI with the index',
          '2': 'Forward directly as +CMT without storing',
        },
      },
    },
  },
  '+CSCS': {
    title: 'Character set',
    description:
      'Selects the character set used for text-mode strings such as numbers and message text.',
    forms: {
      read: 'Show the current set.',
      test: 'List supported sets.',
      set: 'Set the character set.',
    },
    params: {
      chset: {
        description: 'Character set.',
        values: {
          '"GSM"': 'GSM 7-bit default alphabet',
          '"IRA"': 'International reference alphabet (ASCII)',
          '"UCS2"': '16-bit Unicode, as hex',
        },
      },
    },
  },
  '+CSMP': {
    title: 'Text mode parameters',
    description:
      'Sets first octet, validity period, protocol and data coding scheme for messages sent in text mode.',
    forms: {
      read: 'Show the parameters.',
      set: 'Set the parameters.',
    },
  },
  '+CMGL': {
    title: 'List messages',
    description: 'Lists messages in the selected storage by status.',
    warning: warnMarksRead,
    forms: {
      test: 'List supported status values.',
      set: 'List messages with a status.',
    },
    params: {
      stat: {
        description: 'Status (text mode / PDU mode).',
        values: {
          '"REC UNREAD"': 'Received unread (PDU: 0)',
          '"REC READ"': 'Received read (PDU: 1)',
          '"STO UNSENT"': 'Stored unsent (PDU: 2)',
          '"STO SENT"': 'Stored sent (PDU: 3)',
          '"ALL"': 'All messages (PDU: 4)',
        },
      },
    },
  },
  '+CMGR': {
    title: 'Read message',
    description: 'Reads the message stored at an index.',
    warning: warnMarksRead,
    forms: {
      set: 'Read one message.',
    },
    params: {
      index: { description: 'Storage slot, as listed by +CMGL.' },
    },
  },
  '+CMGD': {
    title: 'Delete message',
    description: 'Deletes the message at an index, or several at once with a delete flag.',
    warning:
      'Deleted messages are gone for good, including unread ones the gateway has not imported yet.',
    forms: {
      test: 'List used indexes and supported flags.',
      set: 'Delete messages.',
    },
    params: {
      delflag: {
        description: 'What to delete.',
        values: {
          '0': 'Only the message at index',
          '1': 'All read messages',
          '2': 'All read and sent messages',
          '3': 'All read, sent and unsent messages',
          '4': 'All messages',
        },
      },
    },
  },
  '+CMGS': {
    title: 'Send message',
    description: 'Sends an SMS. The modem answers with a ">" prompt and waits for the text or PDU.',
    warning: warnNeedsPrompt,
    forms: {
      set: 'Start sending a message.',
    },
  },
  '+CMGW': {
    title: 'Write message to storage',
    description: 'Stores a message in memory. Like +CMGS it waits for the text after a ">" prompt.',
    warning: warnNeedsPrompt,
    forms: {
      set: 'Start writing a message.',
    },
  },
  '+CMSS': {
    title: 'Send stored message',
    description: 'Sends a message already held in storage.',
    warning: 'This sends a real SMS, which may be charged, and it is not recorded in the outbox.',
    forms: {
      set: 'Send a stored message.',
    },
  },
  D: {
    title: 'Dial',
    description: 'Places a call. End the number with ; for a voice call.',
    warning: 'This places a real phone call, which may be charged. Hang up with ATH.',
    forms: {
      set: 'Dial a number.',
    },
  },
  H: {
    title: 'Hang up',
    description: 'Ends the current call.',
    forms: {
      execute: 'Hang up.',
    },
  },
  A: {
    title: 'Answer',
    description: 'Answers an incoming call.',
    forms: {
      execute: 'Answer the call.',
    },
  },
  '+CLCC': {
    title: 'Current calls',
    description: 'Lists calls in progress.',
    forms: {
      execute: 'List current calls.',
    },
  },
} satisfies Record<string, ATCatalogText>;

/** Same shape as the English catalog, so a translation cannot miss an entry. */
type Translation<T> = { [K in keyof T]: T[K] extends string ? string : Translation<T[K]> };
export type ATCatalogTranslation = Translation<typeof atCatalogEn>;

export default atCatalogEn;
