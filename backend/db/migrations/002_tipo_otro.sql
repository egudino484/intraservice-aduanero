ALTER TABLE tramites DROP CONSTRAINT tramites_tipo_check;
ALTER TABLE tramites ADD CONSTRAINT tramites_tipo_check CHECK (tipo IN ('Importación', 'Exportación', 'Otro'));
