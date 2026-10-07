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
