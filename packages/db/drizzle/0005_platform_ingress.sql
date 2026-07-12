CREATE TABLE `platform_ingress` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`base_domain` text DEFAULT '' NOT NULL,
	`public_protocol` text DEFAULT 'https' NOT NULL,
	`auto_domains_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `service_hostnames` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`hostname` text NOT NULL,
	`kind` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`preview_key` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_hostnames_hostname_idx` ON `service_hostnames` (`hostname`);
--> statement-breakpoint
CREATE INDEX `service_hostnames_service_idx` ON `service_hostnames` (`service_id`);
