CREATE TABLE `observe_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`sentry_id` integer NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`retention_max_event_count` integer DEFAULT 10000 NOT NULL,
	`retention_max_age_days` integer DEFAULT 30 NOT NULL,
	`span_retention_days` integer DEFAULT 7 NOT NULL,
	`quota_per_5m` integer DEFAULT 1000 NOT NULL,
	`quota_per_hour` integer DEFAULT 5000 NOT NULL,
	`quota_per_month` integer DEFAULT 1000000 NOT NULL,
	`grouping_mechanism` text DEFAULT 'hostrig-v1' NOT NULL,
	`digest_counter` integer DEFAULT 0 NOT NULL,
	`stored_event_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observe_projects_project_idx` ON `observe_projects` (`project_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `observe_projects_sentry_id_idx` ON `observe_projects` (`sentry_id`);
--> statement-breakpoint
CREATE TABLE `observe_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`observe_project_id` text NOT NULL,
	`public_key` text NOT NULL,
	`name` text DEFAULT 'default' NOT NULL,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`observe_project_id`) REFERENCES `observe_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observe_keys_public_key_idx` ON `observe_keys` (`public_key`);
--> statement-breakpoint
CREATE INDEX `observe_keys_observe_project_idx` ON `observe_keys` (`observe_project_id`);
--> statement-breakpoint
CREATE TABLE `observe_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`observe_project_id` text NOT NULL,
	`title` text NOT NULL,
	`culprit` text DEFAULT '' NOT NULL,
	`level` text DEFAULT 'error' NOT NULL,
	`status` text DEFAULT 'unresolved' NOT NULL,
	`digested_event_count` integer DEFAULT 0 NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`last_event_id` text,
	`last_trace_id` text,
	`is_deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`observe_project_id`) REFERENCES `observe_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `observe_issues_project_idx` ON `observe_issues` (`observe_project_id`);
--> statement-breakpoint
CREATE INDEX `observe_issues_status_idx` ON `observe_issues` (`observe_project_id`,`status`);
--> statement-breakpoint
CREATE TABLE `observe_groupings` (
	`id` text PRIMARY KEY NOT NULL,
	`observe_project_id` text NOT NULL,
	`mechanism` text NOT NULL,
	`grouping_key` text NOT NULL,
	`grouping_key_hash` text NOT NULL,
	`issue_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`observe_project_id`) REFERENCES `observe_projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`issue_id`) REFERENCES `observe_issues`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observe_groupings_hash_idx` ON `observe_groupings` (`observe_project_id`,`mechanism`,`grouping_key_hash`);
--> statement-breakpoint
CREATE INDEX `observe_groupings_issue_idx` ON `observe_groupings` (`issue_id`);
--> statement-breakpoint
CREATE TABLE `observe_event_counts_hourly` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`scope_id` text NOT NULL,
	`hour` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observe_event_counts_hourly_uidx` ON `observe_event_counts_hourly` (`scope`,`scope_id`,`hour`);
