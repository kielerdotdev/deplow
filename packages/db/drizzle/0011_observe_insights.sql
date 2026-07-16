CREATE TABLE IF NOT EXISTS `observe_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`observe_project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`spec_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`observe_project_id`) REFERENCES `observe_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `observe_insights_project_idx` ON `observe_insights` (`observe_project_id`);
