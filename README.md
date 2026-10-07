# Studio Barber

Aplicación para una barbería unipersonal: Next.js App Router, React, TypeScript, Tailwind CSS 4, PostgreSQL y Prisma 7 con adaptador PostgreSQL. Interfaz responsive en español. Reservas sin cuenta y administración con sesión HTTP-only firmada mediante JOSE.

## Desarrollo

Requisitos: Node.js 22.12+ o 24, npm, PostgreSQL 16 (o Supabase PostgreSQL).

```sh
npm ci --cache /tmp/barber-npm-cache
cp .env.example .env
# Define DATABASE_URL, ADMIN_PASSWORD (mínimo 16 caracteres),
# SESSION_SECRET (mínimo 32 caracteres) y APP_ORIGIN sin barra final.
# PostgreSQL local opcional:
LOCAL_DB_PASSWORD=una-clave-local docker compose up -d db
npx prisma generate
npm run db:deploy
npm run db:seed
npm run dev
```

Las credenciales de DATABASE_URL deben coincidir con PostgreSQL. El seed es repetible, crea configuración y tres servicios sin borrar datos. Los precios iniciales están en USD; modifica servicios con Prisma Studio (`npx prisma studio`) y configuración desde el panel. Todos los montos son enteros en centavos: 1500 representa $15.00. Cambiar moneda no convierte importes; no mezcles monedas en una misma instalación.

## Arquitectura

- `src/app`: portal, panel y endpoints HTTP. Componentes de cliente en `src/components`.
- `src/lib/availability.ts`: algoritmo puro con zona IANA, horarios, días de atención, bloques y citas activas; grilla de 15 minutos y duración variable. Los intervalos son semiabiertos: terminar cuando empieza otra cita es válido.
- `prisma/schema.prisma`: User (rol único BARBER_ADMIN), Service, Appointment, Expense, BusinessConfig, Block, Payment y RateLimit.
- `api/book`: valida Zod, consulta disponibilidad y guarda la reserva bajo un bloqueo transaccional de PostgreSQL. Los bloqueos personales usan la misma llave para no competir con una reserva. Constraint de exclusión impide solapamientos incluso en escrituras directas.
- `api/admin`: autorización en cada operación, comprobación de origen para escrituras y sesión de ocho horas. No hay registro de usuarios; el modelo User reserva la identidad única para una futura integración de auth. Actualmente la clave configurada representa esa única identidad.
- Completar una cita crea un único Payment en la misma transacción; estados finales son inmutables y las citas futuras no se pueden completar. El cobro se registra al momento de completar, no en la fecha de reserva.
- `date-fns-tz`: UTC en almacenamiento, zona de la barbería en selección y visualización. Formularios de administración interpretan sus fechas en esa misma zona.
- Analytics: ingresos cobrados, egresos y ganancia del período actual; semana desde lunes hasta hoy. Semáforo siempre mensual. Ticket promedio: cobros vinculados / servicios completados. Ingresos por servicio miden contribución a ingresos, no beneficio individual: no se asignan costes por servicio.

## Verificación

```sh
npm test
npm run typecheck
npm run build
npm start
```

Pruebas del algoritmo cubren límites, solapamientos, descansos, días cerrados, pasado, duración y zona horaria. Para pruebas HTTP, arranca con una base de desarrollo migrada y seed; verifica el catálogo, reserva un slot, repite la reserva (409) y prueba un endpoint privado sin sesión (401). No ejecutes reservas de prueba sobre datos de producción.

## Despliegue

1. Crea PostgreSQL administrado o un proyecto Supabase. Para migraciones usa conexión directa (no transaction pooler); la conexión debe permitir `btree_gist`. Prisma puede usar un pooler compatible para runtime, pero este proyecto usa una URL directa por simplicidad. Mantén TLS verificado según las instrucciones del proveedor.
2. Configura las cuatro variables de `.env.example` en Vercel o tu servidor. Genera claves independientes con `openssl rand -hex 32`. No subas `.env` al repositorio. APP_ORIGIN debe ser el origen HTTPS exacto del sitio.
3. Ejecuta `npm ci`, `npx prisma generate`, `npm run db:deploy` y `npm run db:seed` contra la base destino desde un trabajo de release controlado. No ejecutes migraciones concurrentes ni por petición.
4. Compila con `npm run build` y arranca con `npm start`, o usa el adaptador nativo de Vercel. Concede acceso a la BD solo al servidor; nunca expongas DATABASE_URL al navegador.
5. Configura copias de seguridad, HTTPS, monitorización y políticas de retención de contactos antes de operar con clientes reales.

Protecciones incluidas: sesión segura en producción, validación de origen, comprobación de clave en tiempo constante, datos privados tras autorización, límites globales persistentes (login: 10/5 min; reservas: 60/min) y precios/duraciones resueltos en servidor. Los límites globales son adecuados para un negocio pequeño, pero pueden bloquear temporalmente a todos ante abuso: añade límites por IP en el proxy confiable y CAPTCHA si se publica ampliamente. No se confía en cabeceras IP arbitrarias. No hay envío automático de correo o WhatsApp, pagos en línea ni cancelación pública: la confirmación se muestra en pantalla. No se necesita proveedor externo para el flujo solicitado.

## Entorno cloud

Usa el checkout existente `/workspace/metodos-cuantitativos`; no crees worktrees. Las dependencias quedan en el snapshot; los procesos deben iniciarse de nuevo. Publicar el entorno es una acción del usuario, independiente de guardar instrucciones.

Para reproducir este entorno cloud de desarrollo: `node scripts/setup-local.mjs` conserva `.env`, genera claves aleatorias solo si no existe configuración e inicia PostgreSQL local; después ejecuta migraciones y seed. La base local en Docker es de desarrollo: el snapshot cloud no garantiza conservar volúmenes Docker. Usa PostgreSQL administrado para datos duraderos. Para entrar al panel, establece una clave propia en `ADMIN_PASSWORD` de `.env` y reinicia el servidor. Las claves aleatorias no se muestran en logs.

`npm run test:smoke` valida endpoints contra el servidor activo y una base exclusivamente de desarrollo; crea y elimina sus citas y cobros de prueba. Los límites de peticiones conservan sus contadores hasta vencer la ventana.

## Horarios por fecha y duración de servicios

En Mi negocio → Configuración se elige una fecha concreta y hasta seis bloques de atención sin solapamiento. No hay repetición semanal: fechas no programadas quedan cerradas. Cada servicio permite editar su duración entre 5 y 240 minutos. Las citas existentes mantienen sus intervalos y precios. Las operaciones de horario, duración y reserva comparten un bloqueo transaccional para resolver solicitudes simultáneas.

La migración `202610070001_dated_schedule` crea BusinessSchedule, una configuración por negocio con bloques fechados y RLS habilitada. Antes de aplicar esta migración, el backend mantiene la disponibilidad semanal anterior y el panel muestra un aviso. Al aplicarla, las fechas deben programarse explícitamente para aceptar nuevas reservas. No cambia ni elimina las citas existentes. En Supabase configurado inicialmente mediante SQL manual, ejecuta solo el SQL de esta migración en SQL Editor; antes de utilizar Prisma migrate deploy en esa base debes establecer su historial mediante el procedimiento de baseline de Prisma. No vuelvas a ejecutar la migración inicial.

## Registrar una operación y libro diario

El panel abre en **Registrar operación**. El dueño elige una venta, compra de insumos, gasto, máquina/mueble, aporte/retiro o préstamo/deuda. Solo completa monto, fecha, estado de pago y medio de pago, con descripción opcional (obligatoria en la interfaz para identificar pendientes). No elige cuentas ni Debe/Haber. Puede consultar los asientos automáticos en la pestaña secundaria **Libro diario**.

`JournalEntry` y `JournalLine` conservan el asiento y su origen. Una clave única evita duplicar solicitudes; saldar un pendiente genera un asiento vinculado único y no vuelve a reconocer el ingreso/gasto. Los préstamos recibidos y aportes no son ventas; el capital pagado reduce préstamos, los intereses son gasto, y máquinas/muebles se registran como activo. Una restricción diferida en PostgreSQL exige al menos dos líneas, igualdad de Debe/Haber y coincidencia con el monto de cada operación. Los endpoints financieros, las importaciones históricas y la finalización de citas comparten bloqueo transaccional.

La migración `202610070002_simple_operations` agrega ambas tablas, índices, RLS y controles de balance. Antes de aplicarla, las citas siguen funcionando y el panel avisa que falta activar operaciones. En Supabase creado manualmente, ejecuta **solo** el SQL de esta migración en SQL Editor; no vuelvas a crear las tablas iniciales. Los pagos y gastos anteriores se incorporan una vez sin borrarse; gastos históricos conservan un medio de pago "no registrado", en lugar de inventar que fueron efectivo o transferencia. Las citas completadas conservan Payment y además generan su asiento automáticamente.

Los indicadores de Resumen reconocen ingresos y gastos cuando se registra la operación, aun pendiente; la sección Pendientes muestra lo que falta cobrar/pagar. Saldar un pendiente registra el importe completo (no incluye abonos parciales). El movimiento neto de dinero reúne entradas y salidas registradas; no es un saldo bancario real ni incluye un saldo inicial. El módulo es contabilidad de gestión: no incluye IVA separado, depreciación, inventario, conciliación bancaria ni presentación fiscal. Los insumos se tratan como gasto de consumo.

**Escanear comprobante:** el formulario acepta JPG/PNG/WebP de hasta 10 MB, incluyendo cámara del móvil. Tesseract.js lee la foto localmente y sugiere total y fecha; no envía ni conserva la foto. La primera carga necesita internet para descargar el lector/modelo de español desde los CDN del paquete. Los datos siempre son editables y requieren confirmación. No se reconoce PDF; una foto borrosa o un fallo de descarga mantiene disponible el ingreso manual.

Validación: `npm test` cubre asientos, separación de capital/ganancia, pendientes y extracción de datos; `npm run test:finance` prueba operaciones y restricciones contra servidor y BD **locales**, con limpieza automática de datos de prueba. `npm run test:smoke` verifica reservas/agenda y que una cita completada no genere ingresos duplicados.

### Reportes contables, IVA y correcciones

En **Registrar operación** aparece el estado de resultados mensual, su desglose,
el balance general de los registros y el balance de comprobación. Los asientos
se calculan por devengo: pagar una deuda no vuelve a generar un gasto.

El panel autenticado del dueño aplica automáticamente esta actualización al
entrar, bajo bloqueo y en una transacción, utilizando la conexión existente.
No se modifica la agenda ni las reservas, y la actualización es repetible. Si el
rol de base de datos no tiene permisos para crear tablas, se conserva la instalación
existente y se puede aplicar manualmente.

En una base Supabase existente, como alternativa ejecutar **prisma/actualizar-contabilidad.sql**
completo en SQL Editor. Es una actualización repetible que conserva los datos y
activa tanto el libro diario como los documentos tributarios. Para bases nuevas,
las migraciones habituales incluyen las mismas tablas. Si falta esta actualización,
la reserva pública sigue funcionando; el registro documental de IVA se deshabilita.

**Documentar o corregir una operación** permite asociar folio, RUT y el importe
real de IVA que figura en el documento. No se presume que el negocio esté afecto
al IVA: su régimen permanece por confirmar. El crédito fiscal requiere factura,
RUT válido y confirmación explícita de elegibilidad por el dueño. El IVA no
recuperable permanece dentro del costo; el IVA recuperable se registra como activo
y el débito de ventas como pasivo. Los respaldos sin IVA confirmado siguen
marcados para revisión. Honorarios, retenciones, remanentes anteriores, proporcionalidad,
depreciaciones, inventario y saldos iniciales necesitan tratamiento y revisión
profesional antes de cerrar una contabilidad tributaria completa.

**Anular operación y su pago** crea asientos inversos en las fechas originales y
conserva el motivo y la fecha de creación de la corrección. Es idempotente; revierte
también el pago de un pendiente y el IVA. No borra el historial ni modifica el
estado de una cita completada, ni anula documentos emitidos ante el SII. Después de
anular se puede registrar la operación correcta. No debe usarse para alterar un
período ya declarado sin la revisión del contador.

El **Excel (.xlsx)** protegido por sesión incluye instrucciones, estado de
resultados, balance general, IVA, balance de comprobación, libro diario y documentos.
Los importes son números en la moneda indicada, y los textos se exportan como texto,
no como fórmulas. Es un respaldo para el contador: **no es un archivo oficial para
cargar al SII, ni una declaración F29/F22, DTE o reemplazo del RCV**. Comparar los
montos con el Registro de Compras y Ventas antes de declarar. La diferencia de IVA
mostrada no calcula por sí sola el impuesto final a pagar.

Validación local adicional: `npm run test:reports` comprueba los asientos de IVA,
RUT inválidos, anulaciones repetidas con pagos asociados y la apertura del Excel
generado. Todas las pruebas HTTP rechazan bases o aplicaciones remotas.

La página pública incorpora ilustraciones originales en SVG de una silla, tijeras
y poste de barbería rojo/blanco/azul, junto a la galería de Instagram existente.
Las ilustraciones no representan fotografías reales del local.

### Uso sencillo para el dueño

La pantalla principal **Mi dinero** muestra ventas, gastos y ganancia estimada,
además de entradas/salidas de dinero y compras/cobros pendientes al mes elegido.
Aclara que la ganancia incluye importes pendientes y no es el saldo bancario.
Los registros anulados no vuelven a aparecer como entradas o salidas reales.
Para anotar algo hay tres opciones principales: venta, insumos u otro gasto;
equipos, dinero personal y préstamos quedan en opciones adicionales.
El IVA, los balances y el libro contable se consultan en secciones opcionales.
El Excel conserva todos los informes para revisión contable.
