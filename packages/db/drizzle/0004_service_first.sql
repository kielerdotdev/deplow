-- Service-first: operations, bindings, data-service columns, deploy metadata

CREATE TABLE IF NOT EXISTS `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`service_id` text,
	`type` text NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`stage` text,
	`idempotency_key` text,
	`triggered_by` text DEFAULT 'manual',
	`input_json` text,
	`result_json` text,
	`error_message` text,
	`error_code` text,
	`root_cause` text,
	`symptom` text,
	`logs_text` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `operations_project_idx` ON `operations` (`project_id`);
CREATE INDEX IF NOT EXISTS `operations_service_idx` ON `operations` (`service_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `operations_idempotency_idx` ON `operations` (`idempotency_key`);

CREATE TABLE IF NOT EXISTS `service_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`consumer_service_id` text NOT NULL,
	`provider_service_id` text NOT NULL,
	`env_key` text NOT NULL,
	`principal` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consumer_service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `service_bindings_project_idx` ON `service_bindings` (`project_id`);
CREATE INDEX IF NOT EXISTS `service_bindings_consumer_idx` ON `service_bindings` (`consumer_service_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `service_bindings_consumer_env_idx` ON `service_bindings` (`consumer_service_id`,`env_key`);
