-- Teacher-controlled switch: whether parents must enter an access code with the e-mail.
-- Secure default for new installations; the teacher can turn it off from «معلومات المدرسة».
ALTER TABLE app_settings ADD COLUMN require_access_code INTEGER NOT NULL DEFAULT 1 CHECK (require_access_code IN (0, 1));
