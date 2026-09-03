'use strict';
/**
 * Verifica que las variables de entorno SUPABASE_URL y
 * SUPABASE_SERVICE_ROLE_KEY estén bien configuradas y que las tablas
 * ss_users / ss_records existan (es decir, que ya corriste db/schema.sql).
 *
 * Uso:
 *   SUPABASE_URL=https://tu-proyecto.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key \
 *   node scripts/check-db.js
 */
const db = require('../db');

(async () => {
  console.log('Verificando conexión con Supabase...');
  try {
    const users = await db.listUsers();
    console.log(`✔ Conexión OK. Tabla ss_users encontrada (${users.length} usuario[s]).`);
  } catch (err) {
    console.log('✘ No se pudo leer la tabla ss_users.');
    console.log('  Detalle: ' + err.message);
    console.log('  Revisa: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, y que hayas corrido db/schema.sql en Supabase.');
    process.exit(1);
  }
  try {
    const records = await db.listRecords();
    console.log(`✔ Tabla ss_records encontrada (${records.length} registro[s]).`);
  } catch (err) {
    console.log('✘ No se pudo leer la tabla ss_records.');
    console.log('  Detalle: ' + err.message);
    process.exit(1);
  }
  console.log('Todo listo. Ya puedes correr: node server.js');
})();
