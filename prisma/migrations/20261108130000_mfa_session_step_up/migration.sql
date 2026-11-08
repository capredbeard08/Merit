ALTER TABLE "User"
ADD COLUMN "twoFactorEnabledAt" TIMESTAMP(3);

-- Existing enabled accounts must re-authenticate after this migration.
UPDATE "User"
SET "twoFactorEnabledAt" = CURRENT_TIMESTAMP
WHERE "twoFactorEnabled" = true;

CREATE OR REPLACE FUNCTION "set_user_two_factor_enabled_at"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."twoFactorEnabled" IS TRUE THEN
      NEW."twoFactorEnabledAt" := CURRENT_TIMESTAMP;
    ELSE
      NEW."twoFactorEnabledAt" := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."twoFactorEnabled" IS DISTINCT FROM OLD."twoFactorEnabled" THEN
    IF NEW."twoFactorEnabled" IS TRUE THEN
      NEW."twoFactorEnabledAt" := CURRENT_TIMESTAMP;
    ELSE
      NEW."twoFactorEnabledAt" := NULL;
    END IF;
  ELSE
    -- Do not allow application updates to forge or move the MFA enrollment time.
    NEW."twoFactorEnabledAt" := OLD."twoFactorEnabledAt";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "User_twoFactorEnabledAt_guard"
BEFORE INSERT OR UPDATE OF "twoFactorEnabled", "twoFactorEnabledAt"
ON "User"
FOR EACH ROW
EXECUTE FUNCTION "set_user_two_factor_enabled_at"();
