# OBRA CONTROL — prototipo funcional

Prototipo web local para seguimiento personal de obras. No requiere cuenta ni backend para probarlo.

## Cómo abrirlo
1. Descomprime `obra_control_prototipo.zip`.
2. Abre `index.html` con Chrome, Edge o Firefox.
3. La interfaz funciona en ordenador y móvil (diseño responsive).

**Importación Excel:** el lector de `.xlsx` utiliza SheetJS desde un CDN, por lo que para importar archivos Excel necesitas conexión a Internet al abrir la aplicación. También admite `.csv`. El resto de la aplicación funciona localmente.

## Qué incluye
- Dashboard general con obras, avance y alertas.
- Alta y edición de obras.
- Planning en tabla y Gantt simplificado.
- Importación Excel/CSV con asignación de columnas, previsualización y confirmación.
- Actualización de planificación separada del seguimiento real: en coincidencias conserva avance, fechas reales y observaciones.
- Registro básico de subcontratas.
- Pedidos y materiales.
- Diario de obra.
- Actas y compromisos.
- Agenda de alertas internas.
- Exportación del planning a CSV y descarga de CSV de ejemplo.

## Datos y privacidad
- Los datos se guardan en `localStorage` del navegador en el dispositivo donde se utiliza.
- No hay servidor, sincronización entre dispositivos, autenticación real ni copias de seguridad automáticas.
- No introduzcas datos personales o confidenciales en este prototipo.
- Usa la función de exportación o conserva una copia de los datos antes de borrar los datos del navegador.

## Datos de demostración
La aplicación se inicia con una obra y registros ficticios para mostrar el funcionamiento. Están marcados como datos de ejemplo. Puedes editarlos o eliminarlos.

## Limitaciones conocidas
- El Gantt es una visualización inicial simplificada por semanas; todavía no tiene dependencias, ruta crítica ni líneas base/versiones.
- La importación está pensada para una hoja tabular con una fila de encabezados. Hay que probarla con un Excel real para ajustar formatos, jerarquías y columnas.
- La reimportación empareja actividades por código o descripción. Antes de importar, revisa la previsualización. Las nuevas filas se añaden y las coincidentes solo actualizan código, descripción y fechas previstas.
- Las alertas se calculan al abrir la aplicación; no envía avisos en segundo plano.
- No hay gestión avanzada de permisos, documentos, PDF de actas, presupuestos ni contabilidad.

## Siguiente paso recomendado
Facilitar un Excel real de planning (puede estar anonimizado). Se adaptará el importador a sus columnas, capítulos, hitos, calendarios y convenciones de fechas. Después conviene migrar el prototipo a Next.js + Supabase para disponer de acceso privado, base de datos central, sincronización entre dispositivos y copias de seguridad.
