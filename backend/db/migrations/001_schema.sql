-- ============================================================
-- Sistema Aduanero Intraservice — Schema inicial
-- ============================================================

-- USUARIOS
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  initials    TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'operador' CHECK (role IN ('admin', 'operador', 'visor')),
  password_hash TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TRÁMITES
CREATE TABLE tramites (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero                TEXT NOT NULL UNIQUE,           -- IMP-2026-042
  tipo                  TEXT NOT NULL CHECK (tipo IN ('Importación', 'Exportación')),
  cliente               TEXT NOT NULL,
  fecha_arribo          DATE,
  bl                    TEXT,                           -- guía de embarque
  naviera               TEXT,
  da                    TEXT,                           -- declaración aduanera
  factura_comercial     TEXT,
  factura_intraservice  TEXT,
  factura_agente        TEXT,
  observaciones         TEXT,
  estado                TEXT NOT NULL DEFAULT 'En proceso'
                          CHECK (estado IN ('En proceso', 'Pendiente documentación', 'Concluido', 'Cancelado')),
  created_by            UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- GASTOS
CREATE TABLE gastos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id      UUID NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  concepto        TEXT NOT NULL,
  proveedor       TEXT,
  n_factura       TEXT,
  monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
  categoria       TEXT NOT NULL CHECK (categoria IN ('Agente', 'Puerto', 'Transporte', 'Intraservice', 'Varios')),
  comprobante_url TEXT,                                 -- URL en R2
  comprobante_key TEXT,                                 -- key en R2 para borrar
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ANTICIPOS
CREATE TABLE anticipos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id      UUID NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL,
  descripcion     TEXT NOT NULL,
  n_comprobante   TEXT,
  monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
  forma_pago      TEXT NOT NULL CHECK (forma_pago IN ('Transferencia', 'Depósito', 'Cheque', 'Efectivo', 'Otro')),
  documento_url   TEXT,
  documento_key   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DOCUMENTOS GENERALES DEL EXPEDIENTE
CREATE TABLE documentos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id  UUID NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  tipo        TEXT,                                     -- BL, DA, Factura, Otro
  file_url    TEXT NOT NULL,
  file_key    TEXT NOT NULL,
  size_bytes  INT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HISTORIAL DE ESTADOS
CREATE TABLE tramite_estados (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id      UUID NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
  estado_anterior TEXT,
  estado_nuevo    TEXT NOT NULL,
  motivo          TEXT,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AUDITORÍA GENERAL
CREATE TABLE auditoria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tramite_id  UUID REFERENCES tramites(id) ON DELETE SET NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  accion      TEXT NOT NULL,  -- 'estado_cambiado', 'gasto_agregado', 'documento_cargado', 'liquidacion_enviada'
  detalle     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ÍNDICES
CREATE INDEX idx_tramites_estado     ON tramites(estado);
CREATE INDEX idx_tramites_cliente    ON tramites(cliente);
CREATE INDEX idx_tramites_created_at ON tramites(created_at);
CREATE INDEX idx_gastos_tramite      ON gastos(tramite_id);
CREATE INDEX idx_anticipos_tramite   ON anticipos(tramite_id);
CREATE INDEX idx_documentos_tramite  ON documentos(tramite_id);
CREATE INDEX idx_auditoria_tramite   ON auditoria(tramite_id);
CREATE INDEX idx_auditoria_created   ON auditoria(created_at);

-- AUTO-UPDATE updated_at en tramites
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tramites_updated_at
  BEFORE UPDATE ON tramites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
