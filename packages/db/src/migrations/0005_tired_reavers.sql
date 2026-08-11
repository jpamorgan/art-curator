CREATE TABLE `art_submission` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`canonical_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`review_note` text,
	`resolved_artwork_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`reviewed_at` integer,
	FOREIGN KEY (`resolved_artwork_id`) REFERENCES `artwork`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "art_submission_kind_check" CHECK("art_submission"."kind" in ('artwork', 'artist', 'collection')),
	CONSTRAINT "art_submission_status_check" CHECK("art_submission"."status" in ('pending', 'reviewing', 'accepted', 'rejected')),
	CONSTRAINT "art_submission_url_length_check" CHECK(length("art_submission"."url") between 1 and 2048 and length("art_submission"."canonical_url") between 1 and 2048),
	CONSTRAINT "art_submission_review_note_length_check" CHECK("art_submission"."review_note" is null or length("art_submission"."review_note") between 1 and 500),
	CONSTRAINT "art_submission_resolution_state_check" CHECK((
        "art_submission"."status" = 'accepted' and "art_submission"."resolved_artwork_id" is not null and "art_submission"."reviewed_at" is not null
      ) or (
        "art_submission"."status" = 'rejected' and "art_submission"."resolved_artwork_id" is null and "art_submission"."reviewed_at" is not null
      ) or (
        "art_submission"."status" in ('pending', 'reviewing') and "art_submission"."resolved_artwork_id" is null and "art_submission"."reviewed_at" is null
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `art_submission_canonical_url_unique` ON `art_submission` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `art_submission_status_created_idx` ON `art_submission` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `catalog_import_guard` (
	`id` integer PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "catalog_import_guard_singleton_check" CHECK("catalog_import_guard"."id" = 1),
	CONSTRAINT "catalog_import_guard_valid_check" CHECK("catalog_import_guard"."valid" = 1)
);
--> statement-breakpoint
CREATE TABLE `catalog_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	CONSTRAINT "catalog_state_singleton_check" CHECK("catalog_state"."id" = 1),
	CONSTRAINT "catalog_state_version_check" CHECK("catalog_state"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `catalog_state` (`id`, `version`) VALUES (1, 1);
--> statement-breakpoint
CREATE TABLE `submission_rate_limit` (
	`client_hash` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`count` integer NOT NULL,
	CONSTRAINT "submission_rate_limit_hash_check" CHECK(length("submission_rate_limit"."client_hash") = 64),
	CONSTRAINT "submission_rate_limit_count_check" CHECK("submission_rate_limit"."count" between 1 and 6)
);
