import type { ATCatalogTranslation } from '@/locales/atCatalog.en';

// Spanish text of the AT command reference. Typed against the English
// catalog, so every command, form, parameter and value must be present.

// Avisos compartidos por varios comandos.
const warnResetsStartup =
  'Restablece los ajustes que el gateway configura al arrancar (eco desactivado, modo texto de SMS, errores detallados). El envío y la recepción pueden fallar hasta que se reinicie el gateway.';
const warnMarksRead =
  'Leer mensajes marca como leídos en la SIM los que no lo estaban. El gateway solo importa mensajes no leídos, así que lo que se lea aquí nunca llega a la bandeja de entrada.';
const warnNeedsPrompt =
  'Este comando espera el texto del mensaje tras un indicador ">", que esta consola no puede proporcionar. El módem queda bloqueado hasta que se agota el tiempo. Usa la página de envío de SMS.';

const atCatalogEs: ATCatalogTranslation = {
  '': {
    title: 'Atención',
    description: 'Comprueba que el módem responde. Contesta OK y no hace nada más.',
    forms: {
      execute: 'Hacer ping al módem.',
    },
  },
  I: {
    title: 'Identificación del producto',
    description: 'Devuelve la identificación del fabricante, como el modelo y el firmware.',
    forms: {
      execute: 'Mostrar la identificación.',
    },
  },
  E: {
    title: 'Eco de comandos',
    description: 'Controla si el módem repite los comandos que recibe.',
    warning:
      'El gateway espera el eco desactivado. Con ATE1 las respuestas incluyen el propio comando; envía ATE0 para restaurarlo.',
    forms: {
      set: 'Activar o desactivar el eco.',
    },
    params: {
      n: {
        description: 'Modo de eco.',
        values: {
          '0': 'Eco desactivado (lo que usa el gateway)',
          '1': 'Eco activado',
        },
      },
    },
  },
  V: {
    title: 'Formato de los códigos de resultado',
    description: 'Elige códigos de resultado detallados (OK / ERROR) o numéricos (0 / 4).',
    warning:
      'El gateway reconoce las respuestas por las palabras OK y ERROR. Con códigos numéricos (ATV0) todos los comandos parecen colgarse.',
    forms: {
      set: 'Definir el formato de los códigos de resultado.',
    },
    params: {
      n: {
        description: 'Formato.',
        values: {
          '0': 'Códigos numéricos',
          '1': 'Códigos detallados (los requiere el gateway)',
        },
      },
    },
  },
  Q: {
    title: 'Códigos de resultado silenciados',
    description: 'Suprime por completo los códigos de resultado cuando vale 1.',
    warning:
      'Sin códigos de resultado (ATQ1) el gateway no sabe cuándo termina un comando, así que todos agotan el tiempo de espera.',
    forms: {
      set: 'Activar o suprimir los códigos de resultado.',
    },
    params: {
      n: {
        description: 'Modo.',
        values: {
          '0': 'Enviar códigos de resultado (lo requiere el gateway)',
          '1': 'Suprimir códigos de resultado',
        },
      },
    },
  },
  Z: {
    title: 'Restablecer perfil guardado',
    description: 'Restaura los ajustes guardados en el perfil de usuario del módem.',
    warning: warnResetsStartup,
    forms: {
      execute: 'Restablecer los ajustes.',
    },
  },
  '&F': {
    title: 'Valores de fábrica',
    description: 'Restaura la configuración predeterminada del fabricante.',
    warning: warnResetsStartup,
    forms: {
      execute: 'Cargar los ajustes de fábrica.',
    },
  },
  '&W': {
    title: 'Guardar perfil',
    description:
      'Guarda los ajustes actuales como el perfil de usuario que restauran ATZ y el encendido.',
    forms: {
      execute: 'Guardar los ajustes actuales.',
    },
  },
  '+CMEE': {
    title: 'Informe de errores',
    description:
      'Controla si los errores se informan como un ERROR simple o con un código o texto +CME ERROR.',
    forms: {
      read: 'Mostrar el modo actual.',
      set: 'Definir el modo.',
    },
    params: {
      n: {
        description: 'Modo de informe.',
        values: {
          '0': 'ERROR simple',
          '1': 'Códigos numéricos +CME ERROR (predeterminado del gateway)',
          '2': 'Texto detallado +CME ERROR',
        },
      },
    },
  },
  '+CLAC': {
    title: 'Listar comandos disponibles',
    description:
      'Lista todos los comandos AT que admite el módem, uno por línea. La consola lo usa para marcar qué sugerencias acepta este módem.',
    forms: {
      execute: 'Listar los comandos admitidos.',
    },
  },
  '+CGMI': {
    title: 'Fabricante',
    description: 'Devuelve el nombre del fabricante.',
    forms: {
      execute: 'Mostrar el fabricante.',
    },
  },
  '+CGMM': {
    title: 'Modelo',
    description: 'Devuelve la identificación del modelo.',
    forms: {
      execute: 'Mostrar el modelo.',
    },
  },
  '+CGMR': {
    title: 'Versión de firmware',
    description: 'Devuelve la versión del firmware.',
    forms: {
      execute: 'Mostrar la versión del firmware.',
    },
  },
  '+CGSN': {
    title: 'IMEI',
    description: 'Devuelve el número de serie del módem (IMEI).',
    forms: {
      execute: 'Mostrar el IMEI.',
    },
  },
  '+CFUN': {
    title: 'Funcionalidad del teléfono',
    description:
      'Lee o define el nivel de funcionalidad: completa, mínima o radio apagada. Algunos módems también aceptan un indicador de reinicio.',
    warning:
      'Los niveles distintos de 1 apagan la radio, así que no se pueden enviar ni recibir SMS. Un reinicio desconecta el módem del puerto serie.',
    forms: {
      read: 'Mostrar el nivel actual.',
      test: 'Listar los niveles admitidos.',
      set: 'Cambiar el nivel.',
    },
    params: {
      fun: {
        description: 'Nivel de funcionalidad.',
        values: {
          '0': 'Funcionalidad mínima',
          '1': 'Funcionalidad completa',
          '4': 'Radio apagada (modo avión)',
        },
      },
      rst: {
        description: 'Reiniciar antes de cambiar.',
        values: {
          '0': 'No reiniciar',
          '1': 'Reiniciar el módem',
        },
      },
    },
  },
  '+CPAS': {
    title: 'Estado de actividad',
    description: 'Indica si el módem está listo, sonando o en una llamada.',
    forms: {
      execute: 'Mostrar el estado de actividad.',
    },
    params: {
      pas: {
        description: 'Estado en la respuesta.',
        values: {
          '0': 'Listo',
          '2': 'Desconocido',
          '3': 'Sonando',
          '4': 'Llamada en curso',
        },
      },
    },
  },
  '+CCLK': {
    title: 'Reloj',
    description: 'Lee o define el reloj de tiempo real del módem.',
    forms: {
      read: 'Mostrar la hora.',
      set: 'Definir la hora (zz es la diferencia horaria en cuartos de hora).',
    },
  },
  '+CSQ': {
    title: 'Calidad de señal',
    description:
      'Indica la intensidad de la señal recibida (rssi) y la tasa de error de bits. La señal en dBm es -113 + 2 × rssi.',
    forms: {
      execute: 'Mostrar la calidad de señal.',
      test: 'Listar los valores admitidos.',
    },
    params: {
      rssi: { description: '0 es -113 dBm o menos, 31 es -51 dBm o más, 99 es desconocido.' },
      ber: { description: 'Tasa de error de bits de 0 a 7, 99 es desconocida.' },
    },
  },
  '+CREG': {
    title: 'Registro en la red',
    description:
      'Muestra si el módem está registrado en la red y controla los avisos de registro no solicitados.',
    warning:
      'Los avisos no solicitados (n=1 o 2) pueden aparecer en medio de las respuestas de otros comandos.',
    forms: {
      read: 'Mostrar el estado de registro.',
      set: 'Definir los avisos no solicitados.',
    },
    params: {
      n: {
        description: 'Avisos no solicitados.',
        values: {
          '0': 'Desactivados',
          '1': 'Avisar de cambios de estado',
          '2': 'Avisar del estado y la ubicación de la celda',
        },
      },
      stat: {
        description: 'Estado en la respuesta.',
        values: {
          '0': 'No registrado, sin buscar',
          '1': 'Registrado, red propia',
          '2': 'No registrado, buscando',
          '3': 'Registro denegado',
          '4': 'Desconocido',
          '5': 'Registrado, en roaming',
        },
      },
    },
  },
  '+CGREG': {
    title: 'Registro de datos por paquetes',
    description: 'Como +CREG, pero para la red de conmutación de paquetes (GPRS).',
    forms: {
      read: 'Mostrar el estado de registro.',
      set: 'Definir los avisos no solicitados.',
    },
    params: {
      stat: { description: 'Estado en la respuesta; mismos valores que +CREG.' },
    },
  },
  '+COPS': {
    title: 'Selección de operador',
    description: 'Muestra el operador actual, lista los disponibles o fuerza una selección.',
    warning:
      'La selección manual o la baja de la red pueden dejar el módem sin servicio hasta que se vuelva a automático (AT+COPS=0).',
    forms: {
      read: 'Mostrar el operador actual.',
      test: 'Buscar operadores (puede tardar más de un minuto y agotar aquí el tiempo de espera).',
      set: 'Seleccionar un operador.',
    },
    params: {
      mode: {
        description: 'Modo de selección.',
        values: {
          '0': 'Automático',
          '1': 'Manual',
          '2': 'Darse de baja de la red',
          '4': 'Manual, con vuelta a automático',
        },
      },
      format: {
        description: 'Formato del nombre del operador.',
        values: {
          '0': 'Alfanumérico largo',
          '1': 'Alfanumérico corto',
          '2': 'Numérico (MCC+MNC)',
        },
      },
    },
  },
  '+CUSD': {
    title: 'Solicitud USSD',
    description:
      'Envía un código USSD, como una consulta de saldo. La respuesta llega como una línea +CUSD no solicitada, a menudo después del tiempo de espera de 5 segundos de esta consola.',
    forms: {
      read: 'Mostrar si se informan los resultados.',
      set: 'Enviar un código USSD.',
    },
    params: {
      code: { description: 'Cadena USSD, por ejemplo *100#.' },
    },
  },
  '+CPIN': {
    title: 'PIN de la SIM',
    description: 'Muestra si la SIM está lista o espera un PIN o PUK, y permite introducirlo.',
    warning:
      'Cada PIN incorrecto gasta un intento. Tras tres, la SIM se bloquea y necesita el PUK.',
    forms: {
      read: 'Mostrar el estado de la SIM.',
      set: 'Introducir el PIN (o el PUK y un PIN nuevo).',
    },
    params: {
      code: {
        description: 'Estado en la respuesta.',
        values: {
          READY: 'No necesita PIN',
          'SIM PIN': 'Esperando el PIN',
          'SIM PUK': 'Esperando el PUK (PIN bloqueado)',
        },
      },
    },
  },
  '+CLCK': {
    title: 'Bloqueo de servicios',
    description:
      'Bloquea, desbloquea o consulta servicios como la exigencia del PIN de la SIM o el bloqueo de llamadas.',
    warning:
      'Activar el bloqueo por PIN de la SIM ("SC") hace que la SIM pida el PIN en cada encendido, lo que detiene el gateway hasta que se introduzca.',
    forms: {
      test: 'Listar los servicios admitidos.',
      set: 'Bloquear, desbloquear o consultar un servicio.',
    },
    params: {
      mode: {
        description: 'Operación.',
        values: {
          '0': 'Desbloquear',
          '1': 'Bloquear',
          '2': 'Consultar el estado',
        },
      },
    },
  },
  '+CPWD': {
    title: 'Cambiar contraseña',
    description: 'Cambia la contraseña de un servicio, como el PIN de la SIM.',
    warning: 'Una contraseña antigua incorrecta gasta un intento y puede bloquear la SIM.',
    forms: {
      set: 'Cambiar una contraseña.',
    },
  },
  '+CIMI': {
    title: 'IMSI',
    description: 'Devuelve la identidad del abonado (IMSI) guardada en la SIM.',
    forms: {
      execute: 'Mostrar el IMSI.',
    },
  },
  '+CNUM': {
    title: 'Número propio',
    description: 'Devuelve el número de teléfono del abonado, si la SIM lo guarda.',
    forms: {
      execute: 'Mostrar el número de teléfono.',
    },
  },
  '+CMGF': {
    title: 'Formato de SMS',
    description:
      'Elige el modo texto o PDU para los comandos de SMS. El gateway queda en modo texto y cambia él mismo a modo PDU al enviar y recibir.',
    forms: {
      read: 'Mostrar el modo actual.',
      set: 'Definir el modo.',
    },
    params: {
      mode: {
        description: 'Formato de SMS.',
        values: {
          '0': 'Modo PDU',
          '1': 'Modo texto',
        },
      },
    },
  },
  '+CSCA': {
    title: 'Dirección del centro de servicio',
    description:
      'Lee o define el número del centro de servicio de SMS (SMSC) por el que pasa cada SMS saliente.',
    warning: 'Un número de centro de servicio incorrecto hace fallar todos los SMS salientes.',
    forms: {
      read: 'Mostrar el número del SMSC.',
      set: 'Definir el número del SMSC.',
    },
  },
  '+CPMS': {
    title: 'Almacenamiento de mensajes',
    description:
      'Elige dónde se leen, escriben y reciben los mensajes: SIM ("SM"), módem ("ME") o ambos ("MT"). La respuesta incluye las posiciones usadas y totales.',
    warning:
      'El gateway lee los mensajes entrantes del almacenamiento seleccionado; cambiarlo puede ocultar mensajes ya guardados en otro sitio.',
    forms: {
      read: 'Mostrar los almacenamientos y su uso.',
      test: 'Listar los almacenamientos admitidos.',
      set: 'Seleccionar los almacenamientos.',
    },
    params: {
      mem1: {
        description: 'Almacenamiento para leer, listar y borrar.',
        values: {
          '"SM"': 'Tarjeta SIM',
          '"ME"': 'Memoria del módem',
          '"MT"': 'SIM y memoria del módem',
        },
      },
    },
  },
  '+CNMI': {
    title: 'Avisos de mensajes nuevos',
    description:
      'Controla cómo anuncia el módem los mensajes nuevos. El gateway consulta periódicamente los mensajes y no depende de estos avisos.',
    warning:
      'Con mt=2 los mensajes se reenvían sin guardarse, así que el gateway nunca los ve. Otros avisos también pueden mezclarse con las respuestas de los comandos.',
    forms: {
      read: 'Mostrar los ajustes actuales.',
      set: 'Cambiar los ajustes.',
    },
    params: {
      mt: {
        description: 'Entrega de SMS nuevos.',
        values: {
          '0': 'Sin aviso',
          '1': 'Guardar y enviar +CMTI con el índice',
          '2': 'Reenviar directamente como +CMT sin guardar',
        },
      },
    },
  },
  '+CSCS': {
    title: 'Juego de caracteres',
    description:
      'Elige el juego de caracteres de las cadenas en modo texto, como números y texto de mensajes.',
    forms: {
      read: 'Mostrar el juego actual.',
      test: 'Listar los juegos admitidos.',
      set: 'Definir el juego de caracteres.',
    },
    params: {
      chset: {
        description: 'Juego de caracteres.',
        values: {
          '"GSM"': 'Alfabeto GSM predeterminado de 7 bits',
          '"IRA"': 'Alfabeto de referencia internacional (ASCII)',
          '"UCS2"': 'Unicode de 16 bits, en hexadecimal',
        },
      },
    },
  },
  '+CSMP': {
    title: 'Parámetros del modo texto',
    description:
      'Define el primer octeto, el periodo de validez, el protocolo y el esquema de codificación de los mensajes enviados en modo texto.',
    forms: {
      read: 'Mostrar los parámetros.',
      set: 'Definir los parámetros.',
    },
  },
  '+CMGL': {
    title: 'Listar mensajes',
    description: 'Lista por estado los mensajes del almacenamiento seleccionado.',
    warning: warnMarksRead,
    forms: {
      test: 'Listar los estados admitidos.',
      set: 'Listar los mensajes con un estado.',
    },
    params: {
      stat: {
        description: 'Estado (modo texto / modo PDU).',
        values: {
          '"REC UNREAD"': 'Recibidos no leídos (PDU: 0)',
          '"REC READ"': 'Recibidos leídos (PDU: 1)',
          '"STO UNSENT"': 'Guardados sin enviar (PDU: 2)',
          '"STO SENT"': 'Guardados enviados (PDU: 3)',
          '"ALL"': 'Todos los mensajes (PDU: 4)',
        },
      },
    },
  },
  '+CMGR': {
    title: 'Leer mensaje',
    description: 'Lee el mensaje guardado en un índice.',
    warning: warnMarksRead,
    forms: {
      set: 'Leer un mensaje.',
    },
    params: {
      index: { description: 'Posición en el almacenamiento, tal como la lista +CMGL.' },
    },
  },
  '+CMGD': {
    title: 'Borrar mensaje',
    description: 'Borra el mensaje de un índice, o varios a la vez con un indicador de borrado.',
    warning:
      'Los mensajes borrados se pierden para siempre, incluidos los no leídos que el gateway aún no ha importado.',
    forms: {
      test: 'Listar los índices usados y los indicadores admitidos.',
      set: 'Borrar mensajes.',
    },
    params: {
      delflag: {
        description: 'Qué borrar.',
        values: {
          '0': 'Solo el mensaje del índice',
          '1': 'Todos los mensajes leídos',
          '2': 'Todos los mensajes leídos y enviados',
          '3': 'Todos los mensajes leídos, enviados y sin enviar',
          '4': 'Todos los mensajes',
        },
      },
    },
  },
  '+CMGS': {
    title: 'Enviar mensaje',
    description: 'Envía un SMS. El módem responde con un indicador ">" y espera el texto o la PDU.',
    warning: warnNeedsPrompt,
    forms: {
      set: 'Empezar a enviar un mensaje.',
    },
  },
  '+CMGW': {
    title: 'Escribir mensaje en el almacenamiento',
    description: 'Guarda un mensaje en memoria. Como +CMGS, espera el texto tras un indicador ">".',
    warning: warnNeedsPrompt,
    forms: {
      set: 'Empezar a escribir un mensaje.',
    },
  },
  '+CMSS': {
    title: 'Enviar mensaje guardado',
    description: 'Envía un mensaje que ya está en el almacenamiento.',
    warning:
      'Esto envía un SMS real, que puede tener coste, y no queda registrado en la bandeja de salida.',
    forms: {
      set: 'Enviar un mensaje guardado.',
    },
  },
  D: {
    title: 'Marcar',
    description: 'Realiza una llamada. Termina el número con ; para una llamada de voz.',
    warning: 'Esto realiza una llamada telefónica real, que puede tener coste. Cuelga con ATH.',
    forms: {
      set: 'Marcar un número.',
    },
  },
  H: {
    title: 'Colgar',
    description: 'Finaliza la llamada en curso.',
    forms: {
      execute: 'Colgar.',
    },
  },
  A: {
    title: 'Contestar',
    description: 'Contesta una llamada entrante.',
    forms: {
      execute: 'Contestar la llamada.',
    },
  },
  '+CLCC': {
    title: 'Llamadas en curso',
    description: 'Lista las llamadas en curso.',
    forms: {
      execute: 'Listar las llamadas en curso.',
    },
  },
};

export default atCatalogEs;
