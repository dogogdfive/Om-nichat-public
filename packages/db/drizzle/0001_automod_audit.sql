CREATE TYPE "public"."automod_rule" AS ENUM('wallet');
CREATE TYPE "public"."automod_action" AS ENUM('timeout', 'mute', 'skipped', 'failed');
CREATE TABLE "automod_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"rule" "automod_rule" DEFAULT 'wallet' NOT NULL,
	"target_user_id" text NOT NULL,
	"target_display_name" text NOT NULL,
	"matched_pattern" text NOT NULL,
	"action" "automod_action" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "automod_audit" ADD CONSTRAINT "automod_audit_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
