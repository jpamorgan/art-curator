CREATE TABLE `oauth_agent_access_token_revocation` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oauth_agent_access_token_revocation_expires_at_idx` ON `oauth_agent_access_token_revocation` (`expires_at`);