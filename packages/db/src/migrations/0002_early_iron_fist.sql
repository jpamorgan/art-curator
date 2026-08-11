-- Additive upgrade from the historical normalized artwork schema.
ALTER TABLE `artwork` ADD `image_source_url` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `artwork` ADD `image_attribution` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `artwork` ADD `image_r2_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `artwork` ADD `thumbnail_r2_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);
--> statement-breakpoint
CREATE INDEX `artwork_gallery_recent_idx` ON `artwork` (`gallery_id`,`curated_at`,`id`);
