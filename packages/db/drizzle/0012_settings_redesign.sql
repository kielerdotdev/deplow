ALTER TABLE `organizations` ADD COLUMN `icon_url` text;
--> statement-breakpoint
ALTER TABLE `organizations` ADD COLUMN `timezone` text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint
ALTER TABLE `mcp_tokens` ADD COLUMN `scopes_json` text DEFAULT '["*"]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `mcp_tokens` ADD COLUMN `expires_at` integer;
--> statement-breakpoint
ALTER TABLE `message_channels` ADD COLUMN `last_tested_at` integer;
--> statement-breakpoint
ALTER TABLE `message_channels` ADD COLUMN `last_test_ok` integer;
--> statement-breakpoint
ALTER TABLE `message_channels` ADD COLUMN `last_delivery_at` integer;
--> statement-breakpoint
ALTER TABLE `message_channels` ADD COLUMN `last_delivery_ok` integer;
--> statement-breakpoint
ALTER TABLE `message_channels` ADD COLUMN `last_error` text;
