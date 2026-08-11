CREATE TABLE `artwork` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`gallery_id` text NOT NULL,
	`source_external_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`date_display` text NOT NULL,
	`description` text NOT NULL,
	`medium` text NOT NULL,
	`dimensions` text NOT NULL,
	`credit_line` text NOT NULL,
	`source_url` text NOT NULL,
	`image_id` text NOT NULL,
	`image_url` text NOT NULL,
	`thumbnail_url` text NOT NULL,
	`image_width` integer NOT NULL,
	`image_height` integer NOT NULL,
	`alt` text NOT NULL,
	`is_public_domain` integer DEFAULT false NOT NULL,
	`curated_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gallery_id`) REFERENCES `gallery`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "artwork_image_width_check" CHECK("artwork"."image_width" > 0),
	CONSTRAINT "artwork_image_height_check" CHECK("artwork"."image_height" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artwork_slug_unique` ON `artwork` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `artwork_source_external_unique` ON `artwork` (`source_id`,`source_external_id`);--> statement-breakpoint
CREATE INDEX `artwork_source_idx` ON `artwork` (`source_id`);--> statement-breakpoint
CREATE INDEX `artwork_gallery_idx` ON `artwork` (`gallery_id`);--> statement-breakpoint
CREATE INDEX `artwork_recent_idx` ON `artwork` (`curated_at`,`id`);--> statement-breakpoint
CREATE INDEX `artwork_title_idx` ON `artwork` (`title`,`id`);--> statement-breakpoint
CREATE INDEX `artwork_artist_idx` ON `artwork` (`artist`,`id`);--> statement-breakpoint
CREATE TABLE `artwork_category` (
	`artwork_id` text NOT NULL,
	`category_id` text NOT NULL,
	PRIMARY KEY(`artwork_id`, `category_id`),
	FOREIGN KEY (`artwork_id`) REFERENCES `artwork`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artwork_category_category_idx` ON `artwork_category` (`category_id`,`artwork_id`);--> statement-breakpoint
CREATE TABLE `artwork_style` (
	`artwork_id` text NOT NULL,
	`style_id` text NOT NULL,
	PRIMARY KEY(`artwork_id`, `style_id`),
	FOREIGN KEY (`artwork_id`) REFERENCES `artwork`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`style_id`) REFERENCES `style`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artwork_style_style_idx` ON `artwork_style` (`style_id`,`artwork_id`);--> statement-breakpoint
CREATE TABLE `category` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE INDEX `category_sort_idx` ON `category` (`sort_order`,`name`);--> statement-breakpoint
CREATE TABLE `favorite` (
	`user_id` text NOT NULL,
	`artwork_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `artwork_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `artwork`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `favorite_user_recent_idx` ON `favorite` (`user_id`,`created_at`,`artwork_id`);--> statement-breakpoint
CREATE INDEX `favorite_artwork_idx` ON `favorite` (`artwork_id`);--> statement-breakpoint
CREATE TABLE `gallery` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`description` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `source`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_slug_unique` ON `gallery` (`slug`);--> statement-breakpoint
CREATE INDEX `gallery_source_idx` ON `gallery` (`source_id`);--> statement-breakpoint
CREATE TABLE `source` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`attribution` text NOT NULL,
	`terms_url` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "source_kind_check" CHECK("source"."kind" in ('museum', 'gallery', 'curation', 'social'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_slug_unique` ON `source` (`slug`);--> statement-breakpoint
CREATE TABLE `style` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `style_slug_unique` ON `style` (`slug`);--> statement-breakpoint
CREATE INDEX `style_sort_idx` ON `style` (`sort_order`,`name`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
