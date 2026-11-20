-- Store private team notes separately from audit metadata. The composite
-- foreign key makes it impossible to attach a note to feedback in another workspace.
CREATE UNIQUE INDEX "Feedback_workspaceId_id_key" ON "Feedback"("workspaceId", "id");

CREATE TABLE "FeedbackNote" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "feedbackId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FeedbackNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeedbackNote_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FeedbackNote_workspaceId_feedbackId_fkey"
    FOREIGN KEY ("workspaceId", "feedbackId") REFERENCES "Feedback"("workspaceId", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FeedbackNote_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "FeedbackNote_workspaceId_feedbackId_createdAt_idx"
  ON "FeedbackNote"("workspaceId", "feedbackId", "createdAt");
CREATE INDEX "FeedbackNote_authorUserId_createdAt_idx"
  ON "FeedbackNote"("authorUserId", "createdAt");
