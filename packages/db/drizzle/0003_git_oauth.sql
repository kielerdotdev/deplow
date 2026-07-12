ALTER TABLE `projects` ADD `git_auth_method` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_installation_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_access_token_encrypted` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_remote_webhook_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `git_repo_full_name` text;--> statement-breakpoint
CREATE TABLE `git_provider_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text,
	`login` text,
	`avatar_url` text,
	`access_token_encrypted` text,
	`refresh_token_encrypted` text,
	`expires_at` integer,
	`github_installation_id` text,
	`scopes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `git_provider_links_user_idx` ON `git_provider_links` (`user_id`);--> statement-breakpoint
CREATE INDEX `git_provider_links_user_provider_idx` ON `git_provider_links` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `github_app_installations` (
	`installation_id` text PRIMARY KEY NOT NULL,
	`account_login` text NOT NULL,
	`account_type` text DEFAULT 'User' NOT NULL,
	`linked_user_id` text,
	`suspended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`linked_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `github_app_installations_user_idx` ON `github_app_installations` (`linked_user_id`);--> statement-breakpoint
CREATE TABLE `platform_integrations` (
	`provider` text PRIMARY KEY NOT NULL,
	`config_encrypted` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`return_to` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
