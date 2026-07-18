CREATE TABLE `clusters` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`name` text DEFAULT 'default' NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`source` text,
	`server_url` text,
	`external_ip` text,
	`kubeconfig_encrypted` text,
	`node_token_encrypted` text,
	`error_message` text,
	`bootstrap_token_hash` text,
	`bootstrap_token_expires_at` integer,
	`spawned_server_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
