CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text DEFAULT 'postgres' NOT NULL,
	`storage_key` text NOT NULL,
	`size_bytes` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `backups_project_idx` ON `backups` (`project_id`);--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`node_id` text NOT NULL,
	`service_name` text NOT NULL,
	`image` text,
	`docker_compose` text,
	`build_strategy` text,
	`build_logs` text,
	`source_path` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`container_id` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deployments_project_idx` ON `deployments` (`project_id`);--> statement-breakpoint
CREATE INDEX `deployments_node_idx` ON `deployments` (`node_id`);--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text DEFAULT 'docker' NOT NULL,
	`host` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text,
	`ssh_key_encrypted` text,
	`labels_json` text,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nodes_name_unique` ON `nodes` (`name`);--> statement-breakpoint
CREATE INDEX `nodes_provider_idx` ON `nodes` (`provider`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'provisioning' NOT NULL,
	`credentials_encrypted` text,
	`secrets_yaml` text,
	`error_message` text,
	`backup_interval_ms` integer DEFAULT 86400000 NOT NULL,
	`last_backup_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_name_unique` ON `projects` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_unique` ON `projects` (`slug`);--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE TABLE `spawned_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`external_id` text,
	`ip` text,
	`status` text DEFAULT 'starting' NOT NULL,
	`metadata_json` text,
	`expires_at` integer,
	`created_at` integer NOT NULL
);
