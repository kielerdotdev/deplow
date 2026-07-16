ALTER TABLE `nodes` ADD COLUMN `agent_token_hash` text;
--> statement-breakpoint
ALTER TABLE `nodes` ADD COLUMN `advertise_host` text;
--> statement-breakpoint
ALTER TABLE `nodes` ADD COLUMN `agent_version` text;
--> statement-breakpoint
ALTER TABLE `nodes` ADD COLUMN `capabilities_json` text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `nodes_agent_token_idx` ON `nodes` (`agent_token_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `node_join_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`label` text,
	`expires_at` integer NOT NULL,
	`redeemed_at` integer,
	`created_by` text,
	`node_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `node_join_tokens_token_hash_unique` ON `node_join_tokens` (`token_hash`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `node_join_tokens_hash_idx` ON `node_join_tokens` (`token_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `node_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`operation_id` text,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`claimed_at` integer,
	`lease_expires_at` integer,
	`result_json` text,
	`error_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `node_jobs_node_status_idx` ON `node_jobs` (`node_id`, `status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `node_jobs_operation_idx` ON `node_jobs` (`operation_id`);
