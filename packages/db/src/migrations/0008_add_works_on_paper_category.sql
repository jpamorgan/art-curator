INSERT INTO `category` (`id`, `slug`, `name`, `description`, `sort_order`)
VALUES (
  'category-works-on-paper',
  'works-on-paper',
  'Works on Paper',
  'Drawings, watercolors, and other works whose primary support is paper.',
  3
)
ON CONFLICT (`id`) DO UPDATE SET
  `slug` = excluded.`slug`,
  `name` = excluded.`name`,
  `description` = excluded.`description`,
  `sort_order` = excluded.`sort_order`;
