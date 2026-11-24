OBRA CONTROL

Plataforma web para la gestión, planificación y seguimiento integral de obras de reforma y edificación.

Descripción

OBRA CONTROL es una aplicación privada orientada al control técnico y operativo de proyectos de construcción y reforma (locales comerciales, viviendas y rehabilitación). Reemplaza el seguimiento distribuido en hojas de cálculo por una interfaz centralizada y accesible tanto desde escritorio como desde dispositivos móviles.

El sistema permite supervisar la ejecución de las obras, la contratación de gremios, el aprovisionamiento de materiales, partes de trabajo diarios, actas de reunión y la gestión de compromisos técnicos con sus fechas límite.

Características principales

Dashboard operativo: Métricas globales de obras activas, desviaciones de calendario, compras pendientes y alertas de contrato.

Gestión de obras: Fichas individuales con datos clave, estado y documentación asociada.

Planning y diagrama Gantt:

Importación y mapeo de archivos Excel (.xlsx, .xls) y CSV.

Separación entre planificación base y seguimiento real de la ejecución.

Historial de versiones y previsualización de diferencias en la reimportación para evitar sobreescritura accidental.

Subcontratas y gremios: Control de presupuestos, adjudicación y fechas de incorporación de empresas.

Compras y materiales: Seguimiento de plazos de pedido, fechas de necesidad en obra y estado de recepción vinculados a actividades.

Diario de obra: Registro rápido de jornadas de trabajo, empresas presentes e incidencias.

Actas y compromisos: Generación de actas de reunión y seguimiento de tareas derivadas.

Agenda y sistema de alertas: Centralización de compromisos vencidos y avisos de planning.

Stack tecnológico

Frontend: Next.js, React, TypeScript

Estilos: Tailwind CSS (diseño responsive)

Base de datos / Backend: Supabase (PostgreSQL)

Almacenamiento: Supabase Storage

Despliegue objetivo: Vercel

Estructura del repositorio

obra-control/
├── docs/                 # Documentación técnica, especificaciones y prototipo inicial
├── src/
│   ├── app/              # Rutas y páginas de la aplicación (Next.js App Router)
│   ├── components/       # Componentes de UI, tablas, modales y Gantt
│   ├── lib/              # Lógica de procesamiento de Excel, cliente Supabase y utilidades
│   └── types/            # Definiciones de tipos TypeScript
├── public/               # Recursos estáticos
├── README.md
└── package.json


Estado del desarrollo

Fase 0 (Completada): Prototipo inicial en HTML/JS local.

Fase 1 (En curso): Auditoría técnica, reestructuración y definición de arquitectura.

Fase 2: Importador de Excel/CSV con detección de cambios y control de versiones.

Fase 3: Fichas de obra completas y visualización Gantt avanzada.

Fase 4: Integración de subcontratas y compras.

Fase 5: Diario de obra y generación de actas en PDF.

Fase 6: Centralización de agenda y persistencia en Supabase.

Fase 7: Pruebas de integración y estabilización.

Licencia

Proyecto privado. Todos los derechos reservados.
