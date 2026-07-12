CREATE TABLE `platform_operator_webhook` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`secret_encrypted` text,
	`on_failure` integer DEFAULT true NOT NULL,
	`on_success` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
