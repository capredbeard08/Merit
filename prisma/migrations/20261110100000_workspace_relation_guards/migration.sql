-- Enforce workspace consistency for tenant-owned foreign-key relations.
-- These guards complement application predicates; they do not replace authorization or RLS.

-- Refuse to install guards over inconsistent historical tenant relations.
DO $
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Customer" c JOIN "Branch" b ON b."id" = c."branchId"
    WHERE c."branchId" IS NOT NULL AND c."workspaceId" IS DISTINCT FROM b."workspaceId"
  ) THEN RAISE EXCEPTION 'Existing Customer.branch cross-workspace relation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM "ServiceEvent" e
    JOIN "Branch" b ON b."id" = e."branchId"
    JOIN "Customer" c ON c."id" = e."customerId"
    WHERE e."workspaceId" IS DISTINCT FROM b."workspaceId"
       OR e."workspaceId" IS DISTINCT FROM c."workspaceId"
  ) THEN RAISE EXCEPTION 'Existing ServiceEvent cross-workspace relation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM "Feedback" f
    JOIN "Branch" b ON b."id" = f."branchId"
    JOIN "Customer" c ON c."id" = f."customerId"
    JOIN "ServiceEvent" e ON e."id" = f."serviceEventId"
    WHERE f."workspaceId" IS DISTINCT FROM b."workspaceId"
       OR f."workspaceId" IS DISTINCT FROM c."workspaceId"
       OR f."workspaceId" IS DISTINCT FROM e."workspaceId"
  ) THEN RAISE EXCEPTION 'Existing Feedback cross-workspace relation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM "FollowUp" u JOIN "Feedback" f ON f."id" = u."feedbackId"
    WHERE u."workspaceId" IS DISTINCT FROM f."workspaceId"
  ) THEN RAISE EXCEPTION 'Existing FollowUp cross-workspace relation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM "FeedbackReply" r JOIN "Feedback" f ON f."id" = r."feedbackId"
    WHERE r."workspaceId" IS DISTINCT FROM f."workspaceId"
  ) THEN RAISE EXCEPTION 'Existing FeedbackReply cross-workspace relation detected'; END IF;

  IF EXISTS (
    SELECT 1 FROM "WebhookEndpoint" w JOIN "Branch" b ON b."id" = w."branchId"
    WHERE w."branchId" IS NOT NULL AND w."workspaceId" IS DISTINCT FROM b."workspaceId"
  ) THEN RAISE EXCEPTION 'Existing WebhookEndpoint.branch cross-workspace relation detected'; END IF;
END;
$;

CREATE OR REPLACE FUNCTION merit_assert_workspace_parent(
  parent_table text,
  parent_id text,
  child_workspace_id text,
  relation_name text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  parent_workspace_id text;
BEGIN
  EXECUTE format(
    'SELECT "workspaceId" FROM %I WHERE "id" = $1 FOR SHARE',
    parent_table
  )
  INTO parent_workspace_id
  USING parent_id;

  IF parent_workspace_id IS DISTINCT FROM child_workspace_id THEN
    RAISE EXCEPTION 'cross-workspace relation blocked: %', relation_name
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION merit_enforce_workspace_relations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'Customer' THEN
    IF NEW."branchId" IS NOT NULL THEN
      PERFORM merit_assert_workspace_parent('Branch', NEW."branchId", NEW."workspaceId", 'Customer.branch');
    END IF;
  ELSIF TG_TABLE_NAME = 'ServiceEvent' THEN
    PERFORM merit_assert_workspace_parent('Branch', NEW."branchId", NEW."workspaceId", 'ServiceEvent.branch');
    PERFORM merit_assert_workspace_parent('Customer', NEW."customerId", NEW."workspaceId", 'ServiceEvent.customer');
  ELSIF TG_TABLE_NAME = 'Feedback' THEN
    PERFORM merit_assert_workspace_parent('Branch', NEW."branchId", NEW."workspaceId", 'Feedback.branch');
    PERFORM merit_assert_workspace_parent('Customer', NEW."customerId", NEW."workspaceId", 'Feedback.customer');
    PERFORM merit_assert_workspace_parent('ServiceEvent', NEW."serviceEventId", NEW."workspaceId", 'Feedback.serviceEvent');
  ELSIF TG_TABLE_NAME = 'FollowUp' THEN
    PERFORM merit_assert_workspace_parent('Feedback', NEW."feedbackId", NEW."workspaceId", 'FollowUp.feedback');
  ELSIF TG_TABLE_NAME = 'FeedbackReply' THEN
    PERFORM merit_assert_workspace_parent('Feedback', NEW."feedbackId", NEW."workspaceId", 'FeedbackReply.feedback');
  ELSIF TG_TABLE_NAME = 'WebhookEndpoint' THEN
    IF NEW."branchId" IS NOT NULL THEN
      PERFORM merit_assert_workspace_parent('Branch', NEW."branchId", NEW."workspaceId", 'WebhookEndpoint.branch');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER customer_workspace_relation_guard
BEFORE INSERT OR UPDATE ON "Customer"
FOR EACH ROW EXECUTE FUNCTION merit_enforce_workspace_relations();

CREATE TRIGGER service_event_workspace_relation_guard
BEFORE INSERT OR UPDATE ON "ServiceEvent"
FOR EACH ROW EXECUTE FUNCTION merit_enforce_workspace_relations();

CREATE TRIGGER feedback_workspace_relation_guard
BEFORE INSERT OR UPDATE ON "Feedback"
FOR EACH ROW EXECUTE FUNCTION merit_enforce_workspace_relations();

CREATE TRIGGER follow_up_workspace_relation_guard
BEFORE INSERT OR UPDATE ON "FollowUp"
FOR EACH ROW EXECUTE FUNCTION merit_enforce_workspace_relations();

CREATE TRIGGER feedback_reply_workspace_relation_guard
BEFORE INSERT OR UPDATE ON "FeedbackReply"
FOR EACH ROW EXECUTE FUNCTION merit_enforce_workspace_relations();

CREATE TRIGGER webhook_endpoint_workspace_relation_guard
BEFORE INSERT OR UPDATE ON "WebhookEndpoint"
FOR EACH ROW EXECUTE FUNCTION merit_enforce_workspace_relations();
