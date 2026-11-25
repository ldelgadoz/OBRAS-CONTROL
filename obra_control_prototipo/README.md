# OBRA CONTROL — prototipo (Fases 1 y 2)

Prototipo web local para el seguimiento personal de obras. No necesita cuenta, servidor ni conexión a Internet.

## Cómo abrirlo
1. Descarga o clona el repositorio.
2. Abre `obra_control_prototipo/index.html` con doble clic (Chrome, Edge o Firefox). Funciona en ordenador y móvil.
3. Todo se carga desde esta carpeta (incluido el lector de Excel en `vendor/`), así que **ya no hace falta Internet**.

## Cómo probar el importador (5 minutos)
1. Entra en **Planning**, pulsa «Eliminar datos de ejemplo» (aviso morado) y crea tu obra en **Mis obras**.
2. En **Planning → Importar Excel / CSV**, elige `ejemplos/planning_ejemplo_v1.xlsx`. Verás el asistente de 3 pasos: columnas → revisar datos → confirmar. Se crea la **versión 1 (línea base)**.
3. En la tabla, cambia el avance de «Demoliciones» a 50 % y añade una observación (Editar).
4. Importa `ejemplos/planning_ejemplo_v2_revision.xlsx`: cambian fechas, aparece «Fontanería», desaparece «Climatización» y se renombra «Remates…». El asistente muestra **todas las diferencias** y pide confirmación. Tu avance y tus observaciones no cambian.
5. Mira **Versiones del planning**: lista de versiones, comparación v1 ↔ v2 y botón **Deshacer** de la última importación.
6. En **Datos y copias** descarga una copia de seguridad (JSON).

También puedes importar tu propio Excel: el asistente detecta la fila de encabezados, las columnas y el formato de fechas, y te deja corregirlo todo antes de confirmar.

## Modelo de planning (cada actividad tiene tres capas separadas)
| Capa | Campos | Quién la cambia |
|---|---|---|
| **Línea base** | `baseStart`, `baseEnd` | Nadie: se fija cuando la actividad entra en el plan |
| **Plan actual** | `start`, `end` | Solo una reimportación **confirmada** por ti o una edición manual (queda en el historial de la actividad) |
| **Seguimiento real** | `actualStart`, `actualEnd`, `progress`, `status`, `notes` | Solo tú. Una importación **nunca** lo toca |

Cada importación confirmada crea una **versión** con la foto del plan y la lista de cambios aplicados. Las actividades que no aparecen en un archivo nuevo **no se borran ni se marcan solas**: tú decides si salen del plan, y conservan todo su seguimiento.

## Qué incluye
- **Importación Excel (.xlsx/.xls) y CSV:** detección automática de hoja, fila de encabezados, columnas, separador (`;` `,` tab), codificación (UTF-8 / Windows-1252) y formato de fechas (día/mes por defecto; las fechas de celdas Excel se leen del valor real, no del texto mostrado). Capítulos y jerarquía por código (`1`, `1.1`…), por títulos sin fechas, por columna «Capítulo» o por columna «Nivel»; hitos; duración → fecha de fin (laborables o naturales); avisos por fila.
- **Reimportación segura:** nuevas / modificadas / sin cambios / no están en el archivo / reaparecen, con antes → después y selección fila a fila. Emparejado por código + descripción, por descripción y, como último recurso, por código con descripción parecida (nunca se traspasa seguimiento entre actividades distintas).
- **Gantt:** previsto con relleno de avance real, línea base original, ejecución real, capítulos, hitos, línea de «hoy», escala en días/semanas/meses.
- **Tabla de actividades:** desviación del plan respecto a la base, avance real frente a avance previsto hoy, retrasos.
- **Exportar** el planning a Excel o CSV (se puede volver a importar y no genera cambios).
- **Copias de seguridad** completas (JSON) y restauración validada. Si los datos del navegador se dañan, se conserva una copia aparte en lugar de sobrescribirlos.
- **Migración automática** de los datos del prototipo anterior (v1); la copia original no se borra.
- Obras con tipo y observaciones, edición/borrado, edición de subcontratas/pedidos/diario/actas, datos de ejemplo claramente marcados («Ejemplo») y eliminables de una vez.

## Estructura
```
obra_control_prototipo/
├── index.html            Estructura de la página
├── css/styles.css
├── js/
│   ├── util.js           Fechas (sin zonas horarias), texto, ids
│   ├── csv.js            Lectura/escritura CSV
│   ├── importer.js       Excel/CSV → filas normalizadas
│   ├── planning.js       Modelo, diferencias, versiones, deshacer, métricas
│   ├── exporter.js       Exportar a Excel/CSV
│   ├── store.js          Persistencia, migración, copias de seguridad
│   └── ui-*.js, app.js   Pantallas
├── vendor/               SheetJS (lector de Excel) en local
├── ejemplos/             Excel de ejemplo v1 y revisión v2
└── tests/                Pruebas
```
La lógica (`util`, `csv`, `importer`, `planning`, `exporter`, `store`) no depende del navegador: se prueba en Node y está preparada para reutilizarse con Next.js/Supabase.

## Pruebas
```
cd obra_control_prototipo
node --test tests/*.test.js          # 41 pruebas de lógica (Node 20+, sin dependencias)
python3 tests/ui_smoke.py            # 49 comprobaciones en Chrome real (necesita playwright y Chrome)
node tests/make_examples.js          # regenera los Excel de ejemplo
```

## Limitaciones conocidas
- Los datos viven en `localStorage` de **un** navegador: sin sincronización entre dispositivos, sin cuentas y sin copias automáticas. Descarga copias con frecuencia. No introduzcas datos confidenciales hasta migrar a base de datos con acceso privado.
- Las duraciones laborables cuentan de lunes a viernes; **no hay calendarios de festivos** todavía.
- La jerarquía de capítulos es estructural; el Gantt aún no tiene dependencias entre actividades ni ruta crítica.
- Hay que probar el importador con **tu** Excel real para ajustar sinónimos de columnas, capítulos, hitos y convenciones propias.
- El lector de Excel incluido es SheetJS 0.18.5 (`vendor/`), la última versión publicada en npm. Tiene vulnerabilidades conocidas que solo afectan al abrir archivos manipulados a propósito; importa únicamente archivos tuyos o de confianza. Se puede sustituir por la 0.20.x oficial de cdn.sheetjs.com copiándola a `vendor/xlsx.full.min.js`.
- Subcontratas, compras, diario, actas y agenda siguen siendo los módulos simples del prototipo (Fases 4–6).
- Las alertas se calculan al abrir la aplicación; no hay avisos en segundo plano.
