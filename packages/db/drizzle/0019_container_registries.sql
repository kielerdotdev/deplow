CREATE TABLE `container_registries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`server` text NOT NULL,
	`image_prefix` text NOT NULL,
	`username` text,
	`password_encrypted` text,
	`is_default_build` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `container_registries_default_idx` ON `container_registries` (`is_default_build`);
