ALTER TABLE `nodes` ADD COLUMN `mesh_provider` text;
ALTER TABLE `nodes` ADD COLUMN `mesh_status` text;
ALTER TABLE `nodes` ADD COLUMN `mesh_ip` text;
ALTER TABLE `nodes` ADD COLUMN `mesh_hostname` text;
ALTER TABLE `nodes` ADD COLUMN `edge_mode` text;
ALTER TABLE `nodes` ADD COLUMN `local_proxy_ready` integer DEFAULT 0 NOT NULL;
ALTER TABLE `platform_ingress` ADD COLUMN `edge_mode` text DEFAULT 'local' NOT NULL;
