-- MERIT composite tenant-integrity constraints (REVIEW CANDIDATE ONLY)
-- This file is intentionally under docs/, not prisma/migrations/.
-- Do not execute against production. Run preflight on a disposable database
-- copy and review every reported row before promoting any DDL to a migration.

-- 1) Preflight: every relation must remain inside the same workspace.
SELECT 'Customer.branch' AS relation, c.id AS child_id, c.workspaceId AS child_workspace,
       b.workspaceId AS parent_workspace, c.branchId AS parent_id
FROM "Customer" c JOIN "Branch" b ON b.id = c."branchId"
WHERE c."branchId" IS NOT NULL AND c."workspaceId" <> b."workspaceId"
UNION ALL
SELECT 'ServiceEvent.branch', e.id, e."workspaceId", b."workspaceId", e."branchId"
FROM "ServiceEvent" e JOIN "Branch" b ON b.id = e."branchId"
WHERE e."workspaceId" <> b."workspaceId"
UNION ALL
SELECT 'ServiceEvent.customer', e.id, e."workspaceId", c."workspaceId", e."customerId"
FROM "ServiceEvent" e JOIN "Customer" c ON c.id = e."customerId"
WHERE e."workspaceId" <> c."workspaceId"
UNION ALL
SELECT 'Feedback.branch', f.id, f."workspaceId", b."workspaceId", f."branchId"
FROM "Feedback" f JOIN "Branch" b ON b.id = f."branchId"
WHERE f."workspaceId" <> b."workspaceId"
UNION ALL
SELECT 'Feedback.customer', f.id, f."workspaceId", c."workspaceId", f."customerId"
FROM "Feedback" f JOIN "Customer" c ON c.id = f."customerId"
WHERE f."workspaceId" <> c."workspaceId"
UNION ALL
SELECT 'Feedback.serviceEvent', f.id, f."workspaceId", e."workspaceId", f."serviceEventId"
FROM "Feedback" f JOIN "ServiceEvent" e ON e.id = f."serviceEventId"
WHERE f."workspaceId" <> e."workspaceId"
UNION ALL
SELECT 'FollowUp.feedback', u.id, u."workspaceId", f."workspaceId", u."feedbackId"
FROM "FollowUp" u JOIN "Feedback" f ON f.id = u."feedbackId"
WHERE u."workspaceId" <> f."workspaceId"
UNION ALL
SELECT 'FeedbackReply.feedback', r.id, r."workspaceId", f."workspaceId", r."feedbackId"
FROM "FeedbackReply" r JOIN "Feedback" f ON f.id = r."feedbackId"
WHERE r."workspaceId" <> f."workspaceId"
UNION ALL
SELECT 'WebhookEndpoint.branch', w.id, w."workspaceId", b."workspaceId", w."branchId"
FROM "WebhookEndpoint" w JOIN "Branch" b ON b.id = w."branchId"
WHERE w."branchId" IS NOT NULL AND w."workspaceId" <> b."workspaceId"
UNION ALL
SELECT 'GuestQrCode.branch', q.id, q."workspaceId", b."workspaceId", q."branchId"
FROM "GuestQrCode" q JOIN "Branch" b ON b.id = q."branchId"
WHERE q."workspaceId" <> b."workspaceId"
UNION ALL
SELECT 'GuestFeedback.branch', g.id, g."workspaceId", b."workspaceId", g."branchId"
FROM "GuestFeedback" g JOIN "Branch" b ON b.id = g."branchId"
WHERE g."workspaceId" <> b."workspaceId"
UNION ALL
SELECT 'GuestFeedback.qrCode', g.id, g."workspaceId", q."workspaceId", g."qrCodeId"
FROM "GuestFeedback" g JOIN "GuestQrCode" q ON q.id = g."qrCodeId"
WHERE g."workspaceId" <> q."workspaceId"
   OR g."branchId" <> q."branchId";

-- 2) Candidate DDL only. Review Prisma composite relation definitions,
-- on-delete semantics, PostgreSQL version, and all preflight results first.
CREATE UNIQUE INDEX "Branch_workspaceId_id_key" ON "Branch" ("workspaceId", id);
CREATE UNIQUE INDEX "Customer_workspaceId_id_key" ON "Customer" ("workspaceId", id);
CREATE UNIQUE INDEX "ServiceEvent_workspaceId_id_key" ON "ServiceEvent" ("workspaceId", id);
CREATE UNIQUE INDEX "Feedback_workspaceId_id_key" ON "Feedback" ("workspaceId", id);
CREATE UNIQUE INDEX "GuestQrCode_workspace_branch_id_key"
  ON "GuestQrCode" ("workspaceId", "branchId", id);

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_workspace_branch_fkey"
  FOREIGN KEY ("workspaceId", "branchId")
  REFERENCES "Branch" ("workspaceId", id)
  ON DELETE SET NULL ("branchId") ON UPDATE CASCADE;

ALTER TABLE "ServiceEvent"
  ADD CONSTRAINT "ServiceEvent_workspace_branch_fkey"
  FOREIGN KEY ("workspaceId", "branchId")
  REFERENCES "Branch" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ServiceEvent_workspace_customer_fkey"
  FOREIGN KEY ("workspaceId", "customerId")
  REFERENCES "Customer" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Feedback"
  ADD CONSTRAINT "Feedback_workspace_branch_fkey"
  FOREIGN KEY ("workspaceId", "branchId")
  REFERENCES "Branch" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Feedback_workspace_customer_fkey"
  FOREIGN KEY ("workspaceId", "customerId")
  REFERENCES "Customer" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "Feedback_workspace_service_event_fkey"
  FOREIGN KEY ("workspaceId", "serviceEventId")
  REFERENCES "ServiceEvent" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FollowUp"
  ADD CONSTRAINT "FollowUp_workspace_feedback_fkey"
  FOREIGN KEY ("workspaceId", "feedbackId")
  REFERENCES "Feedback" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedbackReply"
  ADD CONSTRAINT "FeedbackReply_workspace_feedback_fkey"
  FOREIGN KEY ("workspaceId", "feedbackId")
  REFERENCES "Feedback" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookEndpoint"
  ADD CONSTRAINT "WebhookEndpoint_workspace_branch_fkey"
  FOREIGN KEY ("workspaceId", "branchId")
  REFERENCES "Branch" ("workspaceId", id)
  ON DELETE SET NULL ("branchId") ON UPDATE CASCADE;

ALTER TABLE "GuestQrCode"
  ADD CONSTRAINT "GuestQrCode_workspace_branch_fkey"
  FOREIGN KEY ("workspaceId", "branchId")
  REFERENCES "Branch" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestFeedback"
  ADD CONSTRAINT "GuestFeedback_workspace_branch_fkey"
  FOREIGN KEY ("workspaceId", "branchId")
  REFERENCES "Branch" ("workspaceId", id)
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "GuestFeedback_workspace_branch_qr_fkey"
  FOREIGN KEY ("workspaceId", "branchId", "qrCodeId")
  REFERENCES "GuestQrCode" ("workspaceId", "branchId", id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Add automated negative tests proving cross-workspace inserts and updates
-- are rejected. Confirm PostgreSQL 15+ before using column-list SET NULL.
-- This candidate is documentation, not executable migration material.
