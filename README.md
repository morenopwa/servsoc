# Control de Atenciones - Servicio Social (con base de datos en la nube)

Versión 3: los datos ya no se guardan en archivos del servidor, sino en una
base de datos Postgres gratuita en **Supabase**. Esto significa que, si
publicas la app en un hosting gratuito (como Render), los datos **no se
pierden** aunque el servidor se reinicie o se "duerma" — porque ya no viven
en el servidor, viven en Supabase.

El resto del sistema (sesiones por DNI, contraseñas encriptadas, informe
mensual, acta de entrega, etc.) funciona exactamente igual que antes.

## Paso 1: crear la base de datos en Supabase (gratis)
1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (no pide
   tarjeta para el plan gratis).
2. Crea un proyecto nuevo ("New Project"). Elige una contraseña de base de
   datos y guárdala en un lugar seguro (no la necesitarás para esta app,
   pero es buena práctica).
3. Cuando el proyecto termine de crearse, ve a **SQL Editor** (en el menú de
   la izquierda) → **New query**.
4. Abre el archivo `db/schema.sql` de esta carpeta, copia todo su contenido,
   pégalo ahí, y dale **Run**. Esto crea las tablas `ss_users` y
   `ss_records`.
5. Ve a **Project Settings** (ícono de engranaje) → **API**. Ahí encontrarás:
   - **Project URL** → esto es tu `SUPABASE_URL`
   - **service_role key** (bajo "Project API keys") → esto es tu
     `SUPABASE_SERVICE_ROLE_KEY`

   ⚠️ **Importante:** la `service_role key` puede leer y escribir todo, sin
   restricciones. Es distinta de la clave `anon` (esa NO sirve para esta
   app). Nunca la pongas en el código del navegador ni la subas a un
   repositorio público — solo va como variable de entorno del servidor.

## Paso 2: probar que la conexión funciona
```
cd control-servicio-social
SUPABASE_URL=https://tu-proyecto.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key \
node scripts/check-db.js
```
Si todo está bien, verás "Todo listo. Ya puedes correr: node server.js". Si
falla, el mensaje te dice qué revisar.

## Paso 3: correr el servidor

### En tu propia PC
```
SUPABASE_URL=https://tu-proyecto.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key \
node server.js
```
Abre `http://localhost:3000`. La terminal te muestra el DNI/contraseña del
administrador inicial la primera vez (por defecto `00000000` / `00000000`).

### Publicado en internet con HTTPS (Render, gratis para empezar)
1. Sube esta carpeta a un repositorio de GitHub.
2. En [render.com](https://render.com): "New +" → "Web Service" → conecta tu
   repositorio.
3. Configura:
   - **Start command:** `node server.js`
   - **Instance type:** puedes usar el plan **Free** — ya no necesitas pagar
     por un disco persistente, porque los datos viven en Supabase, no en
     Render.
4. En "Environment", agrega las variables:
   - `SUPABASE_URL` = la URL de tu proyecto
   - `SUPABASE_SERVICE_ROLE_KEY` = tu service_role key
   - (Opcional) `ADMIN_DNI` = el DNI que quieras como administrador inicial
5. Al desplegar, Render te da una URL `https://tu-app.onrender.com` con
   HTTPS real, sin configurar nada más.

Railway, Fly.io o un VPS con Caddy/Nginx funcionan igual de bien — el
código no cambia, solo dónde defines las variables de entorno.

## Un límite importante del plan gratis de Supabase
Los proyectos gratis de Supabase se **pausan automáticamente tras 7 días sin
actividad** (los datos no se pierden, pero el proyecto queda inaccesible
hasta que alguien entra al panel de Supabase y le da "Restore"/reanudar).
Para una app de uso diario esto normalmente no pasa, pero si el sistema
puede quedar varios días sin usarse (ej. un feriado largo), considera una de
estas opciones:
- Configurar un "cron" gratuito externo (por ejemplo
  [cron-job.org](https://cron-job.org)) que visite
  `https://tu-app.onrender.com/api/health` una vez cada 2-3 días. Esa ruta
  no requiere iniciar sesión y hace una consulta real a la base de datos,
  así que cuenta como actividad y evita la pausa.
- O, si el proyecto pasa a producción real con pacientes, considerar el plan
  pago de Supabase (desde $25/mes), que no se pausa y agrega respaldos
  automáticos.

## Copias de seguridad
El plan gratis de Supabase **no incluye respaldos automáticos**. Sigue
existiendo el botón "💾 Exportar respaldo (Excel)" en la aplicación —
conviene usarlo periódicamente (por ejemplo, una vez al mes) como respaldo
manual, además de la base de datos en sí.

## Variables de entorno
| Variable | Para qué sirve | Obligatoria |
|---|---|---|
| `SUPABASE_URL` | URL de tu proyecto de Supabase | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta con acceso total (nunca la de "anon") | Sí |
| `PORT` | Puerto donde escucha el servidor | No (por defecto 3000; Render la define solo) |
| `ADMIN_DNI` | DNI del administrador que se crea la primera vez | No (por defecto `00000000`) |
| `CERT_PATH`, `KEY_PATH` | Si quieres que el propio Node sirva HTTPS directamente (no hace falta con Render/Railway/Caddy) | No |

## Usuarios y sesiones
- El primer usuario (administrador) se crea solo, la primera vez que el
  servidor logra conectarse a la base de datos vacía. Su DNI/contraseña
  inicial aparecen en la consola del servidor.
- Desde "🛡️ Usuarios" (solo el administrador la ve) se crea el acceso de
  cada asistenta social: nombre + DNI. Su contraseña inicial es su mismo
  DNI, y ella la cambia luego desde "🔑 Contraseña".
- El administrador puede restablecer la contraseña de alguien (vuelve a ser
  su DNI) o eliminar un usuario.
- Las sesiones duran 8 horas de inactividad. Se guardan en la memoria del
  servidor (no en la base de datos), así que un reinicio del servidor
  cierra las sesiones activas, pero nunca borra los datos guardados.

## Seguridad: qué incluye y qué no
Incluye:
- Contraseñas encriptadas (scrypt + sal única por usuario), nunca en texto
  plano.
- Row Level Security (RLS) activado en las tablas de Supabase sin ninguna
  política — solo la `service_role key` (que usa el servidor) puede
  leer/escribir; ninguna clave pública tiene acceso.
- Cookies de sesión `httpOnly` y `SameSite=Strict`.
- Bloqueo temporal tras 5 intentos fallidos de contraseña (15 minutos).
- Ninguna ruta de datos responde sin sesión activa (excepto `/api/health`,
  que no expone información de pacientes).

No incluye (revísalo con tu área de TI/legal antes de producción real):
- HTTPS real depende de dónde publiques la app (Render/Railway/Caddy lo dan
  automático; el código por sí solo no lo garantiza).
- Respaldos automáticos (ver sección de arriba).
- Auditoría detallada o roles más finos que "administrador" / "asistenta
  social".
- Cumplimiento legal de la Ley de Protección de Datos Personales del Perú
  si van a manejar datos de salud de pacientes reales — esto requiere
  revisión propia, no lo resuelve el código.

## El resto de funciones (igual que en la versión anterior)
- Registro de cada atención con nombre, DNI, N° de cama, fecha de
  nacimiento, edad (años o meses), diagnóstico (con lista de sugerencias) y
  procedencia por provincia y distrito.
- Menú hamburguesa en pantallas angostas, con la sección activa resaltada.
- Informe mensual con subtotales, total general, población atendida por
  edad (hasta 90 años, con un grupo "Otros" para mayores que lista sus
  edades exactas), y por diagnóstico, provincia y distrito. Al imprimir,
  esta sección empieza en una hoja nueva. Puedes elegir orientación vertical
  u horizontal antes de imprimir o guardar el PDF.
- Botón "Acta de entrega": prellenada con los datos ya registrados del
  paciente, editable, con sus propios botones de imprimir/guardar PDF.
- Exportar/Importar respaldo en Excel (la importación completa solo la
  puede hacer un administrador, porque reemplaza todos los datos).

## Estructura del proyecto
```
server.js            Servidor (autenticación, sesiones, rutas)
db.js                 Acceso a Supabase vía su API REST (sin dependencias)
db/schema.sql         SQL para crear las tablas en Supabase
scripts/check-db.js   Verifica la conexión a Supabase
package.json
public/
  index.html
  styles.css
  app.js
```
