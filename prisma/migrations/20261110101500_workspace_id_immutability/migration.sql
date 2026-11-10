-- Tenant-owned records cannot be reassigned to another workspace in place.
-- A future tenant transfer must be an explicit audited migration, not an ordinary update.

CREATE OR REPLACE FUNCTION merit_prevent_workspace_reassignment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."workspaceId" IS DISTINCT FROM NEW."workspaceId" THEN
    RAISE EXCEPTION 'workspace reassignment blocked for %', TG_TABLE_NAME
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER member_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "Member"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER branch_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "Branch"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER customer_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "Customer"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER service_event_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "ServiceEvent"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER feedback_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "Feedback"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER invitation_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "Invitation"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER webhook_endpoint_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "WebhookEndpoint"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER audit_log_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER follow_up_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "FollowUp"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER feedback_reply_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "FeedbackReply"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER insight_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "Insight"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();

CREATE TRIGGER file_asset_workspace_immutable
BEFORE UPDATE OF "workspaceId" ON "FileAsset"
FOR EACH ROW EXECUTE FUNCTION merit_prevent_workspace_reassignment();
