CREATE TABLE `artist` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_slug_unique` ON `artist` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `artist_name_unique` ON `artist` (`name`);--> statement-breakpoint
CREATE INDEX `artist_name_idx` ON `artist` (`name`,`id`);--> statement-breakpoint
CREATE TABLE `artwork_artist` (
	`artwork_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`artwork_id`, `artist_id`),
	FOREIGN KEY (`artwork_id`) REFERENCES `artwork`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artwork_artist_artist_idx` ON `artwork_artist` (`artist_id`,`artwork_id`);--> statement-breakpoint
CREATE INDEX `artwork_artist_artwork_position_idx` ON `artwork_artist` (`artwork_id`,`position`);--> statement-breakpoint
INSERT INTO `artist` (`id`, `slug`, `name`) VALUES
('artist-caspar-david-friedrich', 'caspar-david-friedrich', 'Caspar David Friedrich'),
('artist-claude-monet', 'claude-monet', 'Claude Monet'),
('artist-diego-velazquez', 'diego-velazquez', 'Diego Velázquez'),
('artist-eugene-delacroix', 'eugene-delacroix', 'Eugène Delacroix'),
('artist-francisco-de-goya', 'francisco-de-goya', 'Francisco de Goya'),
('artist-georges-seurat', 'georges-seurat', 'Georges Seurat'),
('artist-gustav-klimt', 'gustav-klimt', 'Gustav Klimt'),
('artist-j-m-w-turner', 'j-m-w-turner', 'J. M. W. Turner'),
('artist-james-mcneill-whistler', 'james-mcneill-whistler', 'James McNeill Whistler'),
('artist-jan-van-eyck', 'jan-van-eyck', 'Jan van Eyck'),
('artist-jean-francois-millet', 'jean-francois-millet', 'Jean-François Millet'),
('artist-jean-honore-fragonard', 'jean-honore-fragonard', 'Jean-Honoré Fragonard'),
('artist-johannes-vermeer', 'johannes-vermeer', 'Johannes Vermeer'),
('artist-john-constable', 'john-constable', 'John Constable'),
('artist-katsushika-hokusai', 'katsushika-hokusai', 'Katsushika Hokusai'),
('artist-leonardo-da-vinci', 'leonardo-da-vinci', 'Leonardo da Vinci'),
('artist-pierre-auguste-renoir', 'pierre-auguste-renoir', 'Pierre-Auguste Renoir'),
('artist-raphael', 'raphael', 'Raphael'),
('artist-rembrandt-van-rijn', 'rembrandt-van-rijn', 'Rembrandt van Rijn'),
('artist-sandro-botticelli', 'sandro-botticelli', 'Sandro Botticelli'),
('artist-vincent-van-gogh', 'vincent-van-gogh', 'Vincent van Gogh'),
('artist-edouard-manet', 'edouard-manet', 'Édouard Manet');
--> statement-breakpoint
INSERT OR IGNORE INTO `artist` (`id`, `slug`, `name`)
WITH `legacy_artist` AS (
  SELECT `artwork`.`artist` AS `name`,
         row_number() OVER (ORDER BY `artwork`.`artist`) AS `position`
  FROM `artwork`
  GROUP BY `artwork`.`artist`
)
SELECT printf('artist-legacy-%08d', `position`),
       printf('artist-legacy-%08d', `position`),
       `name`
FROM `legacy_artist`;
--> statement-breakpoint
INSERT INTO `artwork_artist` (`artwork_id`, `artist_id`, `position`)
SELECT `artwork`.`id`, `artist`.`id`, 0
FROM `artwork`
INNER JOIN `artist` ON `artist`.`name` = `artwork`.`artist`;
--> statement-breakpoint
CREATE TABLE `artwork_enrichment` (
	`artwork_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`source_mode` text NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`vision_model` text NOT NULL,
	`embedding_model` text NOT NULL,
	`embedding_dimensions` integer DEFAULT 512 NOT NULL,
	`prompt_version` text NOT NULL,
	`content_fingerprint` text NOT NULL,
	`canonical_text` text DEFAULT '' NOT NULL,
	`visual_facets` text DEFAULT '{}' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`vector_mutation_id` text,
	`queued_at` integer,
	`processed_at` integer,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`artwork_id`) REFERENCES `artwork`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "artwork_enrichment_dimensions_check" CHECK("artwork_enrichment"."embedding_dimensions" > 0),
	CONSTRAINT "artwork_enrichment_attempts_check" CHECK("artwork_enrichment"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX `artwork_enrichment_status_updated_idx` ON `artwork_enrichment` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `followed_artist` (
	`user_id` text NOT NULL,
	`artist_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `artist_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artist_id`) REFERENCES `artist`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `followed_artist_user_recent_idx` ON `followed_artist` (`user_id`,`created_at`,`artist_id`);--> statement-breakpoint
CREATE TABLE `followed_gallery` (
	`user_id` text NOT NULL,
	`gallery_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `gallery_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gallery_id`) REFERENCES `gallery`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `followed_gallery_user_recent_idx` ON `followed_gallery` (`user_id`,`created_at`,`gallery_id`);--> statement-breakpoint
CREATE TABLE `followed_style` (
	`user_id` text NOT NULL,
	`style_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `style_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`style_id`) REFERENCES `style`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `followed_style_user_recent_idx` ON `followed_style` (`user_id`,`created_at`,`style_id`);--> statement-breakpoint
CREATE TABLE `hidden_artwork` (
	`user_id` text NOT NULL,
	`artwork_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `artwork_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_id`) REFERENCES `artwork`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `hidden_artwork_user_recent_idx` ON `hidden_artwork` (`user_id`,`created_at`,`artwork_id`);--> statement-breakpoint
CREATE TABLE `taste_profile` (
	`user_id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`embedding` text,
	`embedding_dimensions` integer DEFAULT 512 NOT NULL,
	`artwork_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "taste_profile_revision_check" CHECK("taste_profile"."revision" >= 0),
	CONSTRAINT "taste_profile_dimensions_check" CHECK("taste_profile"."embedding_dimensions" > 0),
	CONSTRAINT "taste_profile_artwork_count_check" CHECK("taste_profile"."artwork_count" >= 0)
);
