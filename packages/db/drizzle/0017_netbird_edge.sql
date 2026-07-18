ALTER TABLE `platform_ingress` ADD `netbird_management_url` text DEFAULT 'https://api.netbird.io';--> statement-breakpoint
ALTER TABLE `platform_ingress` ADD `netbird_pat_encrypted` text;--> statement-breakpoint
ALTER TABLE `platform_ingress` ADD `netbird_setup_key_id` text;--> statement-breakpoint
ALTER TABLE `platform_ingress` ADD `netbird_peer_id` text;--> statement-breakpoint
ALTER TABLE `platform_ingress` ADD `netbird_peer_name` text;--> statement-breakpoint
ALTER TABLE `platform_ingress` ADD `netbird_domain_mode` text DEFAULT 'managed';--> statement-breakpoint
ALTER TABLE `platform_ingress` ADD `netbird_status` text DEFAULT 'disconnected' NOT NULL;--> statement-breakpoint
ALTER TABLE `platform_ingress` ADD `netbird_status_message` text;--> statement-breakpoint
CREATE TABLE `netbird_services` (
	`id` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`service_id` text,
	`netbird_service_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `netbird_services_hostname_idx` ON `netbird_services` (`hostname`);
