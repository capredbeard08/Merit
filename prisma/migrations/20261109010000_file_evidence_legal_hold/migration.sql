ALTER TABLE "FileAsset"
  ADD COLUMN "legalHoldAt" TIMESTAMP(3),
  ADD COLUMN "legalHoldById" TEXT,
  ADD COLUMN "legalHoldReason" TEXT;

CREATE INDEX "FileAsset_workspaceId_legalHoldAt_idx"
  ON "FileAsset"("workspaceId", "legalHoldAt");

ALTER TABLE "FileAsset"
  ADD CONSTRAINT "FileAsset_legal_hold_fields_check"
  CHECK (
    ("legalHoldAt" IS NULL AND "legalHoldById" IS NULL AND "legalHoldReason" IS NULL)
    OR
    ("legalHoldAt" IS NOT NULL AND "legalHoldById" IS NOT NULL AND "legalHoldReason" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION merit_prevent_held_file_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."legalHoldAt" IS NOT NULL THEN
    RAISE EXCEPTION 'FILE_LEGAL_HOLD_ACTIVE: physical deletion is blocked while a legal hold is active'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "FileAsset_prevent_held_delete"
BEFORE DELETE ON "FileAsset"
FOR EACH ROW
EXECUTE FUNCTION merit_prevent_held_file_deletion();
