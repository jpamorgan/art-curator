CREATE TABLE `a2a_task` (
	`task_id` text PRIMARY KEY NOT NULL,
	`tenant` text DEFAULT '' NOT NULL,
	`owner` text DEFAULT 'anonymous' NOT NULL,
	`context_id` text NOT NULL,
	`status` integer NOT NULL,
	`status_timestamp` text NOT NULL,
	`task_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `a2a_task_scope_status_timestamp_idx` ON `a2a_task` (`tenant`,`owner`,`status`,`status_timestamp`);--> statement-breakpoint
CREATE INDEX `a2a_task_expires_at_idx` ON `a2a_task` (`expires_at`);