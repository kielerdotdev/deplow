-- Collapse all node providers to agent (docker / ssh / hetzner removed).
UPDATE `nodes` SET `provider` = 'agent' WHERE `provider` != 'agent';
