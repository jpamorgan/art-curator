CREATE TABLE `art_inbox` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "art_inbox_url_length_check" CHECK(length("art_inbox"."url") between 1 and 2048)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `art_inbox_url_unique` ON `art_inbox` (`url`);--> statement-breakpoint
CREATE INDEX `art_inbox_created_idx` ON `art_inbox` (`created_at`,`id`);