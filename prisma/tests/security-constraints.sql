BEGIN;

INSERT INTO "Workspace" ("id", "name", "updatedAt")
VALUES ('ci-ws-a', 'CI Workspace A', CURRENT_TIMESTAMP),
       ('ci-ws-b', 'CI Workspace B', CURRENT_TIMESTAMP);

INSERT INTO "Branch" ("id", "workspaceId", "name", "updatedAt")
VALUES ('ci-branch-a', 'ci-ws-a', 'Branch A', CURRENT_TIMESTAMP),
       ('ci-branch-b', 'ci-ws-b', 'Branch B', CURRENT_TIMESTAMP);

INSERT INTO "Customer" ("id", "workspaceId", "branchId", "externalId", "updatedAt")
VALUES ('ci-customer-a', 'ci-ws-a', 'ci-branch-a', 'ci-ext-a', CURRENT_TIMESTAMP);

INSERT INTO "ServiceEvent"
  ("id", "workspaceId", "branchId", "customerId", "completedAt")
VALUES
  ('ci-event-a', 'ci-ws-a', 'ci-branch-a', 'ci-customer-a', CURRENT_TIMESTAMP);

INSERT INTO "Feedback"
  ("id", "workspaceId", "branchId", "customerId", "serviceEventId", "updatedAt")
VALUES
  ('ci-feedback-a', 'ci-ws-a', 'ci-branch-a', 'ci-customer-a', 'ci-event-a', CURRENT_TIMESTAMP);

INSERT INTO "FileAsset"
  ("id", "workspaceId", "uploadedById", "originalName", "pathname", "contentType", "sizeBytes", "legalHoldAt", "legalHoldById", "legalHoldReason", "updatedAt")
VALUES
  ('ci-file-held', 'ci-ws-a', 'ci-user-a', 'held.txt', 'ci/held.txt', 'text/plain', 1, CURRENT_TIMESTAMP, 'ci-user-a', 'CI legal hold test', CURRENT_TIMESTAMP);

DO $$
BEGIN
  BEGIN
    INSERT INTO "Customer" ("id", "workspaceId", "branchId", "externalId", "updatedAt")
    VALUES ('ci-cross-customer', 'ci-ws-a', 'ci-branch-b', 'ci-cross', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'FAIL: cross-workspace Customer.branch relation was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE "Branch" SET "workspaceId" = 'ci-ws-b' WHERE "id" = 'ci-branch-a';
    RAISE EXCEPTION 'FAIL: workspace reassignment was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    DELETE FROM "FileAsset" WHERE "id" = 'ci-file-held';
    RAISE EXCEPTION 'FAIL: legal-held file deletion was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO "FeedbackNote" ("id", "workspaceId", "feedbackId", "content")
    VALUES ('ci-cross-note', 'ci-ws-b', 'ci-feedback-a', 'must not cross tenants');
    RAISE EXCEPTION 'FAIL: cross-workspace feedback note was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "FileAsset" WHERE "id" = 'ci-file-held') THEN
    RAISE EXCEPTION 'FAIL: legal-held file disappeared after blocked deletion';
  END IF;
  IF EXISTS (SELECT 1 FROM "Branch" WHERE "id" = 'ci-branch-a' AND "workspaceId" <> 'ci-ws-a') THEN
    RAISE EXCEPTION 'FAIL: branch workspace changed despite immutable guard';
  END IF;
END;
$$;

ROLLBACK;
