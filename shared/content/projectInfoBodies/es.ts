export const PROJECT_INFO_BODY = `PIERRON — INFORMACIÓN DEL PROYECTO
Versión 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. significa "PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK",
o coloquialmente CPDDC (Moneda digital descentralizada del grupo centralizado).

Es una criptomoneda en Solana que, a través de una combinación de 49 mecanismos distintos, forma un ecosistema autónomo y descentralizado diseñado para brindar la más alta forma de seguridad financiera para el usuario individual.

El proyecto fue diseñado para una transparencia absoluta hacia el usuario y para que el usuario no necesite confiar en el producto.

Las reglas incluidas en el proyecto son definitivas y no se pueden cambiar.

El ecosistema PIERRON es totalmente autónomo: no requiere administrador ni tiene ninguno. El proyecto tampoco cuenta con servicio de soporte ni servicio al cliente. Todas las decisiones y acciones tomadas por un usuario en el ecosistema son responsabilidad exclusiva del usuario. El creador del proyecto no es responsable de las decisiones equivocadas o errores del usuario.

PIERRON tiene más de 2200 pruebas formales sin assume, admit, external_body, vacuity ni underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. ¿QUÉ ES PIERRON?
━━━━━━━━━━━━━━━━━━━━

Pierron es un protocolo simbólico en la cadena de bloques Solana. Las reglas económicas (límites, contribución del 1% al fondo común, enfriamiento, redistribución, bonificación de lealtad, emisión y quema) se aplican en la cadena mediante programas de contratos inteligentes, y no simplemente se describen en la documentación.

El token PIERRON (SPL Token-2022) combina:

• operaciones oficiales con DEX con límites por operación y tiempo de reutilización,
• una contribución del 1% al fondo de redistribución, recuperable después de un ciclo de actividad (no una “penalización por negociar”),
• ciclos de actividad y reclamación de una parte del fondo común,
• un bono de fidelidad basado en el volumen,
• emisiones controladas al mercado común más un programa de quema,
• una tarifa de precio mínimo SOL en los swaps oficiales,
• Safe Send (más transferencias privadas) y Pierron Pay (pagos a comerciantes).

La aplicación móvil y la dapp crean transacciones. La fuente de verdad de las reglas es el código implementado en Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINCIPIOS DE DISEÑO
━━━━━━━━━━━━━━━━━━━━

• Reglas en código: el programa verifica los límites y la elegibilidad.
• Actividad sobre especulación mayorista: límites máximos por transacción y por época.
• Participación en el pool para la actividad del ciclo real, no sólo para tenencias inactivas.
• Deflación estructural: gran asignación de quemas y un calendario de quemas fijo.
• Rutas de riesgo separadas: la liquidación y el sigilo son programas separados; Los pagos de la bóveda requieren vales válidos.

━━━━━━━━━━━━━━━━━━━━
3. TOKENÓMICA (OFERTA)
━━━━━━━━━━━━━━━━━━━━

Unidad: token UI (6 decimales en cadena).

Oferta total: 150,000,000,000 PIERRON (150 mil millones)

Asignación:
• Fondo de mercado (escrow → DEX): 60 mil millones (40%)
• Cartera de desarrollador: 21 mil millones (14%)
• Bonificación de fidelidad: 7 mil millones (~4.7%)
• Quemar (bóveda + programación): 56B (~37.3%)
• Tesorería: 6 mil millones (4%)

Emisión: en cada época, el protocolo libera tokens de escrow al fondo DEX conforme a una cuota por época — mayor en la génesis y después estándar.

Quemar: desde la bóveda de quemado a un ritmo fijo durante aproximadamente 20 años calendario de épocas hasta que se agote la asignación de quemado.

Duración de la época: 21,600 segundos (6 horas). La época 0 comienza en la marca de tiempo de génesis del protocolo.

━━━━━━━━━━━━━━━━━━━━
4. ARQUITECTURA (BREVE)
━━━━━━━━━━━━━━━━━━━━

• Programa Pierron: contabilidad, límites DEX, libro de operaciones, bonificación de fidelidad, redistribución, ticks, quema, precio mínimo
• Transfer Hook — Gancho de transferencia: clasificación de transferencia Token-2022; Límites y cotización del 1% en trayectos oficiales.
• Settlement — Liquidación: pagos de la bóveda (redistribución, bonificación de fidelidad, recompensas de keeper) después de la preparación del vale
• Stealth — Sigilo: regístrese, envíe y reclame (Safe Send)
• TradeBook/cuenta de usuario: actividad, volumen, tickets, mapa de bits de época, recuento de reclamaciones
• keepers de la red: épocas avanzadas, emisión/quema y extracciones; no reclaman redistribución ni premios para los usuarios

━━━━━━━━━━━━━━━━━━━━
5. REGLAS COMERCIALES
━━━━━━━━━━━━━━━━━━━━

RUTA OFICIAL
Opere mediante swap en la aplicación Pierron (grupo DEX según la política de protocolo), con instrucciones de límite y gancho de transferencia. Los traslados fuera de los trayectos permitidos podrán ser rechazados o clasificados de forma diferente.

CONTRIBUCIÓN DEL 1% (RECUPERABLE, NO UNA PENALIDAD)
El 1% del volumen del comercio oficial se destina a un fondo de redistribución compartido. Esta no es una tarifa punitiva ni una quema permanente de sus fondos: con suficiente actividad en el ecosistema, puede reclamar su parte del fondo común una vez que finalice el ciclo.

Un ciclo de redistribución dura 28 épocas. Con épocas de 6 horas son 7 días. Una vez que se cierra el ciclo, los usuarios elegibles reclaman su parte del grupo en la aplicación.

Condición de recuperación: actividad suficiente en el ciclo (incluyendo al menos 9 épocas activas en el mapa de bits de 28 épocas y manteniendo al menos 10 PIERRON); consulte Redistribución. Sin actividad del ecosistema no hay participación en el fondo; Con la contribución más la actividad, el comercio genera un derecho a reclamar del fondo común, no solo un costo de comercio.

La contribución del 1% no se puede desactivar en la configuración; es parte del protocolo.

PRECIO MÍNIMO (SOL)
Los swaps oficiales requieren una tarifa SOL proporcional al volumen de PIERRON (100 lamports por 1 PIERRON). Los fondos van a la tesorería del precio mínimo y pueden respaldar la liquidez/piso.

LÍMITE POR TRANSACCIÓN
El máximo de PIERRON por transacción depende de las reclamaciones redistribuidas recibidas:

• 0–24 reclamaciones: 13,000,000 PIERRON
• ≥ 25 reclamaciones: 16,000,000 PIERRON
• ≥ 75 reclamaciones: 19,000,000 PIERRON
• ≥ 175 reclamaciones: 24,000,000 PIERRON
• ≥ 375 reclamaciones: 34,000,000 PIERRON (límite)

ENFRIAMIENTO ENTRE INTERCAMBIOS
• 0–24 reclamaciones: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Un intento de intercambio anticipado se rechaza en la cadena.

PRIMER INTERCAMBIO
La primera transacción oficial en una cuenta debe ser de al menos 2 PIERRON.

GORRA DE VENTA DE ÉPOCA GLOBAL
Las ventas totales de todos los usuarios en una época comparten un techo que aumenta con las reclamaciones totales del protocolo:

• menos de 25 reclamaciones total: 2,000,000,000 PIERRON
• menos de 75: 3,000,000,000
• menos de 175: 5,000,000,000
• menos de 375: 7,000,000,000
• 375+: 9,000,000,000

También se aplican límites de transacciones y volumen de época por usuario (incluidos hasta 100 tx por época y un límite de volumen por usuario).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUCIÓN: RECUPERACIÓN DEL 1% DE APORTACIÓN
━━━━━━━━━━━━━━━━━━━━

POR QUÉ EXISTE EL 1%
Cada intercambio oficial coloca el 1% en un fondo compartido. Después de 28 épocas (7 días en épocas de 6 horas), el grupo se divide entre las personas que fueron lo suficientemente activas en el ecosistema. Comercio activo + actividad cíclica = derecho a reclamar del pool. Inactividad = no compartir. Este es un mecanismo de lealtad/recuperación de contribuciones, no una penalización por operar.

La contribución del 1% está diseñada para unir temporalmente parte del capital en el ecosistema y desalentar indirectamente los ataques Sybil.

FUENTE DEL FONDO
La contribución del 1% de los swaps oficiales financia la bóveda de redistribución.

CICLO Y TIEMPO
• ciclo: 28 épocas = 7 días (época = 6 h),
• después de que se cierra el ciclo, el fondo se divide (participación ≈ fondo / recuento elegible),
• reclamar en la aplicación una vez que se cumpla la elegibilidad.

ELEGIBILIDAD (ACTIVIDAD SUFICIENTE)
• al menos 9 épocas activas en el mapa de bits de 28 épocas,
• mantener al menos 10 saldos PIERRON,
• actividad reconocida por el protocolo (trayectos oficiales de comercio/protocolo).

RECLAMANDO
• el usuario inicia el reclamo en la aplicación (preparar → liquidar → consumir),
• los poseedores no reclaman por el usuario,
• los vales siguen siendo válidos del orden de 28 épocas; los no reclamados pueden caducar,
• la tarifa de reclamación de protocolo en PIERRON es 0; el usuario paga la tarifa de red SOL,
• un reclamo exitoso aumenta el contador de reclamos → límite de intercambio más alto y tiempo de reutilización más corto.

━━━━━━━━━━━━━━━━━━━━
7. BONO DE FIDELIDAD
━━━━━━━━━━━━━━━━━━━━

ENTRADAS
• obtenido del volumen comercial oficial (umbral: 10 volúmenes PIERRON → 1 boleto),
• máximo 50 entradas por usuario por ventana,
• dibujar ventanas cada 7 épocas dentro del ciclo de 28 épocas.

SORTEO
• los keepers envían confirmaciones aleatorias (commit–reveal),
• los sorteos requieren un recuento mínimo de compromisos (piso de producción: 20) y un grupo mínimo de boletos,
• después de la ventana: sorteo u omisión (muy pocos boletos),
• premio: 2,000,000 PIERRON por sorteo (de la asignación del bono de fidelidad),
• pago: preparar → liquidar → reclamar por parte del ganador.

VALIDEZ DEL BONO
El cupón para reclamar el lanzamiento aéreo de la lotería es válido por 7 épocas y luego caduca.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND Y PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrarse → enviar a la bóveda oculta → reclamar al destinatario. La reclamación puede requerir dos transacciones. Esta es una ruta de transferencia más privada: no pasa por alto los límites de swap ni la contribución del 1%.

PIERRON PAY
Pago a una cuenta de comerciante con una instrucción de pago. El gancho clasifica la transferencia como Pay, no como una venta normal de DEX.

REGLAS
• no utilice estas vías para eludir los límites comerciales oficiales o la contribución del 1%,
• Verifique siempre la dirección del destinatario / QR antes de enviar: los errores en la cadena son irreversibles.

━━━━━━━━━━━━━━━━━━━━
9. REGLAS DE USO DE LA APLICACIÓN
━━━━━━━━━━━━━━━━━━━━

1. Conecte sólo una billetera confiable. Nunca compartas tu frase inicial con "apoyo" o extraños.
2. Swap: aprueba la secuencia completa en la billetera; no cierre la billetera a mitad de la firma.
3. Respete el tiempo de reutilización: tocar nuevamente no anula las reglas en cadena.
4. Reclamación de bonificación de redistribución/fidelidad: solo cuando la aplicación muestra que está preparada; después del éxito, espere la sincronización de la red antes del próximo intercambio.
5. En Android (OEM agresivos): permanezca en la billetera hasta CONFIRM, luego regrese con Pierron; No cierres la aplicación en segundo plano.
6. Prohibido: ataques a programas, phishing con el nombre de Pierron, spam RPC, intentos de explotación de acuerdos/hooks.

━━━━━━━━━━━━━━━━━━━━
10. BUCLE ECONÓMICO
━━━━━━━━━━━━━━━━━━━━

El depósito de garantía libera tokens en el grupo DEX en cada época.
El comercio realiza una contribución del 1% al fondo de redistribución (recuperable después de 7 días/28 épocas con actividad suficiente), boletos de bonificación de fidelidad y la tarifa de precio mínimo SOL.
La actividad en el ciclo de 28 épocas te califica para reclamar una parte del fondo.
El bono de fidelidad se sortea en ventanas de 7 épocas.
Burn reduce el suministro en paralelo según lo previsto.
Los usuarios reclaman ellos mismos la redistribución y los premios; Los porteros mantienen el reloj de protocolo.

━━━━━━━━━━━━━━━━━━━━
11. RIESGOS
━━━━━━━━━━━━━━━━━━━━

• contrato inteligente y riesgo de actualización,
• riesgo de mercado para el precio de PIERRON (no hay un alza garantizada a pesar de quemar / piso),
• Tarifas SOL por transacciones fallidas o repetidas,
• sin garantía de beneficios: la redistribución y el bono de fidelidad no son un producto de depósito.

Usar la aplicación significa aceptar las reglas de la cadena y los riesgos mencionados anteriormente.

Pierron: tokenómica transparente y uso real.`;
