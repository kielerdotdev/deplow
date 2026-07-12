ALTER TABLE `user` ADD `instance_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_idx` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_members_org_user_idx` ON `organization_members` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `organization_members_user_idx` ON `organization_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `organization_members_org_idx` ON `organization_members` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organization_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`token_hash` text NOT NULL,
	`invited_by_user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_invites_token_hash_unique` ON `organization_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `organization_invites_org_idx` ON `organization_invites` (`organization_id`);--> statement-breakpoint
CREATE INDEX `organization_invites_email_idx` ON `organization_invites` (`email`);--> statement-breakpoint
ALTER TABLE `projects` ADD `organization_id` text REFERENCES `organizations`(`id`) ON DELETE cascade;--> statement-breakpoint
DROP INDEX IF EXISTS `projects_name_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `projects_slug_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_org_name_idx` ON `projects` (`organization_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_org_slug_idx` ON `projects` (`organization_id`,`slug`);--> statement-breakpoint
CREATE INDEX `projects_org_idx` ON `projects` (`organization_id`);
