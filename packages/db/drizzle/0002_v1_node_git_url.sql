ALTER TABLE `projects` ADD `node_id` text REFERENCES nodes(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `public_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_provider` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_repo_url` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_branch` text DEFAULT 'main';--> statement-breakpoint
ALTER TABLE `projects` ADD `git_webhook_secret_encrypted` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_last_delivery_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_last_delivery_status` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_last_delivery_error` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_connected_at` integer;--> statement-breakpoint
CREATE INDEX `projects_node_idx` ON `projects` (`node_id`);--> statement-breakpoint
ALTER TABLE `deployments` ADD `triggered_by` text DEFAULT 'manual';
