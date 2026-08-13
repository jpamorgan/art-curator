INSERT OR IGNORE INTO `art_inbox` (`id`, `url`, `created_at`)
SELECT `id`, `canonical_url`, `created_at`
FROM `art_submission`
WHERE `status` IN ('pending', 'reviewing');--> statement-breakpoint
DROP TABLE `art_submission`;--> statement-breakpoint
DROP TABLE `submission_rate_limit`;
