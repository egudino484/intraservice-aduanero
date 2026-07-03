# Tareas pendientes

- [ ] **N° trámite consecutivo (T26-001)** — En "Nuevo trámite", el campo N° TRÁMITE debe sugerir automáticamente el siguiente número consecutivo del año (ej: T26-001, T26-002...) basado en el último trámite creado. Poblarse por default al abrir el form, pero el campo sigue editable — es solo sugerencia, no forzado.

- [ ] **Tipo trámite "Otro" con especificación** — En el selector de tipo de trámite (Importación/Exportación/Otro), al elegir "Otro" debe aparecer un campo de texto para especificar el tipo. El valor ingresado debe agregarse a la lista de opciones del dropdown para uso futuro (persistido, similar a etiquetas custom).

- [ ] **Fecha de trámite default = fecha actual** — En "Nuevo trámite", el campo de fecha debe poblarse por default con la fecha actual del sistema al abrir el form. Debe seguir siendo editable.

- [ ] **Popup "nuevo cliente" con RUC, nombre, descripción, teléfono** — En el campo Cliente del form de trámite, agregar opción para crear cliente nuevo vía popup/modal. Campos: RUC, nombre, descripción, teléfono. El cliente creado debe agregarse a la lista de clientes seleccionables (similar a persistencia de etiquetas/custom props ya existente).

- [x] **Botón de feedback por pantalla + pantalla admin para verlo** — Botón flotante (💬) visible en toda la app, abre modal para escribir feedback de la pantalla activa. Se guarda en tabla `feedback` (Postgres, no JSON plano — ver nota abajo). Pantalla "Feedback" (solo admin, bajo Auditoría) lista todo el feedback filtrable por pantalla/fecha.
