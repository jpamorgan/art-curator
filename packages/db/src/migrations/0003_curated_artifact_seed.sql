-- Upgrade the historical AIC-only seed without replaying applied migrations.
-- Three equivalent saved works are remapped before legacy rows are removed. Other historical
-- seed favorites are intentionally removed because those blocked IIIF objects have no durable,
-- verified licensed replacement in this release.
CREATE TABLE IF NOT EXISTS `_migration_0003_favorite_map` (
  `user_id` text NOT NULL,
  `artwork_id` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `artwork_id`)
);
--> statement-breakpoint
DELETE FROM `_migration_0003_favorite_map`;
--> statement-breakpoint
INSERT OR IGNORE INTO `_migration_0003_favorite_map` (`user_id`, `artwork_id`, `created_at`)
SELECT
  `user_id`,
  CASE `artwork_id`
    WHEN 'aic-27992' THEN 'aic-grande-jatte'
    WHEN 'aic-16568' THEN 'aic-water-lilies'
    WHEN 'aic-24645' THEN 'met-great-wave'
  END,
  `created_at`
FROM `favorite`
WHERE `artwork_id` IN ('aic-27992', 'aic-16568', 'aic-24645');
--> statement-breakpoint
DELETE FROM `favorite` WHERE `artwork_id` IN ('aic-27992', 'aic-20684', 'aic-16568', 'aic-28560', 'aic-24645', 'aic-14655', 'aic-111442', 'aic-80607', 'aic-61128', 'aic-111436', 'aic-11723', 'aic-111318', 'aic-94841', 'aic-81558', 'aic-25865', 'aic-87479', 'aic-14586', 'aic-44892', 'aic-56905', 'aic-90048', 'aic-72801', 'aic-185905', 'aic-151358', 'aic-210511');
--> statement-breakpoint
DELETE FROM `artwork_category` WHERE `artwork_id` IN ('aic-27992', 'aic-20684', 'aic-16568', 'aic-28560', 'aic-24645', 'aic-14655', 'aic-111442', 'aic-80607', 'aic-61128', 'aic-111436', 'aic-11723', 'aic-111318', 'aic-94841', 'aic-81558', 'aic-25865', 'aic-87479', 'aic-14586', 'aic-44892', 'aic-56905', 'aic-90048', 'aic-72801', 'aic-185905', 'aic-151358', 'aic-210511');
--> statement-breakpoint
DELETE FROM `artwork_style` WHERE `artwork_id` IN ('aic-27992', 'aic-20684', 'aic-16568', 'aic-28560', 'aic-24645', 'aic-14655', 'aic-111442', 'aic-80607', 'aic-61128', 'aic-111436', 'aic-11723', 'aic-111318', 'aic-94841', 'aic-81558', 'aic-25865', 'aic-87479', 'aic-14586', 'aic-44892', 'aic-56905', 'aic-90048', 'aic-72801', 'aic-185905', 'aic-151358', 'aic-210511');
--> statement-breakpoint
DELETE FROM `artwork` WHERE `id` IN ('aic-27992', 'aic-20684', 'aic-16568', 'aic-28560', 'aic-24645', 'aic-14655', 'aic-111442', 'aic-80607', 'aic-61128', 'aic-111436', 'aic-11723', 'aic-111318', 'aic-94841', 'aic-81558', 'aic-25865', 'aic-87479', 'aic-14586', 'aic-44892', 'aic-56905', 'aic-90048', 'aic-72801', 'aic-185905', 'aic-151358', 'aic-210511');
--> statement-breakpoint
DELETE FROM `category`
WHERE `id` IN ('category-works-on-paper', 'category-sculpture', 'category-decorative-arts')
  AND NOT EXISTS (
    SELECT 1 FROM `artwork_category` WHERE `category_id` = `category`.`id`
  );
--> statement-breakpoint
DELETE FROM `style`
WHERE `id` IN (
  'style-hudson-river-school', 'style-mannerism', 'style-arts-and-crafts',
  'style-african-art', 'style-south-asian'
)
  AND NOT EXISTS (
    SELECT 1 FROM `artwork_style` WHERE `style_id` = `style`.`id`
  );
--> statement-breakpoint
-- Curated starter collection of 24 public-domain artworks across 15 museums.
-- Per-artwork source records point to official museum pages; embeddable images and licenses
-- are recorded from Wikimedia Commons because the Art Institute IIIF host is challenge-gated.
INSERT INTO `source` (
  `id`, `slug`, `name`, `kind`, `url`, `attribution`, `terms_url`
) VALUES
('moma', 'moma', 'The Museum of Modern Art', 'museum', 'https://www.moma.org/', 'Artwork metadata based on The Museum of Modern Art collection records; image provenance is recorded per artwork.', 'https://www.moma.org/about/about-this-site/'),
('louvre', 'louvre', 'Musée du Louvre', 'museum', 'https://www.louvre.fr/en', 'Artwork metadata based on Musée du Louvre collection records; image provenance is recorded per artwork.', 'https://www.louvre.fr/en/legal-information'),
('mauritshuis', 'mauritshuis', 'Mauritshuis', 'museum', 'https://www.mauritshuis.nl/en/', 'Artwork metadata based on Mauritshuis collection records; image provenance is recorded per artwork.', 'https://www.mauritshuis.nl/en/'),
('metropolitan-museum-of-art', 'metropolitan-museum-of-art', 'The Metropolitan Museum of Art', 'museum', 'https://www.metmuseum.org/', 'Artwork metadata based on The Metropolitan Museum of Art collection records; image provenance is recorded per artwork.', 'https://www.metmuseum.org/policies/terms-and-conditions'),
('art-institute-chicago', 'art-institute-chicago', 'Art Institute of Chicago', 'museum', 'https://www.artic.edu/', 'Artwork metadata based on Art Institute of Chicago collection records; image provenance is recorded per artwork.', 'https://www.artic.edu/terms'),
('belvedere', 'belvedere', 'Belvedere', 'museum', 'https://www.belvedere.at/en', 'Artwork metadata based on Belvedere collection records; image provenance is recorded per artwork.', 'https://www.belvedere.at/en/imprint'),
('uffizi-galleries', 'uffizi-galleries', 'Uffizi Galleries', 'museum', 'https://www.uffizi.it/en', 'Artwork metadata based on Uffizi Galleries collection records; image provenance is recorded per artwork.', 'https://www.uffizi.it/en/pages/legal-notes'),
('rijksmuseum', 'rijksmuseum', 'Rijksmuseum', 'museum', 'https://www.rijksmuseum.nl/en', 'Artwork metadata based on Rijksmuseum collection records; image provenance is recorded per artwork.', 'https://www.rijksmuseum.nl/en/footer/terms-and-conditions'),
('museo-del-prado', 'museo-del-prado', 'Museo Nacional del Prado', 'museum', 'https://www.museodelprado.es/en', 'Artwork metadata based on Museo Nacional del Prado collection records; image provenance is recorded per artwork.', 'https://www.museodelprado.es/en/legal-notice'),
('hamburger-kunsthalle', 'hamburger-kunsthalle', 'Hamburger Kunsthalle', 'museum', 'https://www.hamburger-kunsthalle.de/en', 'Artwork metadata based on Hamburger Kunsthalle collection records; image provenance is recorded per artwork.', 'https://www.hamburger-kunsthalle.de/en/imprint'),
('musee-orsay', 'musee-orsay', 'Musée d''Orsay', 'museum', 'https://www.musee-orsay.fr/en', 'Artwork metadata based on Musée d''Orsay collection records; image provenance is recorded per artwork.', 'https://www.musee-orsay.fr/en/legal-information'),
('national-gallery-london', 'national-gallery-london', 'The National Gallery', 'museum', 'https://www.nationalgallery.org.uk/', 'Artwork metadata based on The National Gallery collection records; image provenance is recorded per artwork.', 'https://www.nationalgallery.org.uk/terms-of-use'),
('musee-marmottan-monet', 'musee-marmottan-monet', 'Musée Marmottan Monet', 'museum', 'https://www.marmottan.fr/en/', 'Artwork metadata based on Musée Marmottan Monet collection records; image provenance is recorded per artwork.', 'https://www.marmottan.fr/en/'),
('wallace-collection', 'wallace-collection', 'The Wallace Collection', 'museum', 'https://www.wallacecollection.org/', 'Artwork metadata based on The Wallace Collection collection records; image provenance is recorded per artwork.', 'https://www.wallacecollection.org/'),
('vatican-museums', 'vatican-museums', 'Vatican Museums', 'museum', 'https://www.museivaticani.va/', 'Artwork metadata based on Vatican Museums collection records; image provenance is recorded per artwork.', 'https://www.museivaticani.va/')
ON CONFLICT(`id`) DO UPDATE SET
  `slug` = excluded.`slug`,
  `name` = excluded.`name`,
  `kind` = excluded.`kind`,
  `url` = excluded.`url`,
  `attribution` = excluded.`attribution`,
  `terms_url` = excluded.`terms_url`;
--> statement-breakpoint
INSERT INTO `gallery` (
  `id`, `source_id`, `slug`, `name`, `location`, `description`, `url`
) VALUES
('moma', 'moma', 'moma', 'The Museum of Modern Art', 'New York, New York, United States', 'Modern and contemporary art museum founded in 1929 in New York.', 'https://www.moma.org/'),
('louvre', 'louvre', 'louvre', 'Musée du Louvre', 'Paris, France', 'National museum in Paris spanning art and material culture from antiquity through the nineteenth century.', 'https://www.louvre.fr/en'),
('mauritshuis', 'mauritshuis', 'mauritshuis', 'Mauritshuis', 'The Hague, Netherlands', 'Museum of Dutch and Flemish painting housed in a seventeenth-century residence in The Hague.', 'https://www.mauritshuis.nl/en/'),
('metropolitan-museum-of-art', 'metropolitan-museum-of-art', 'metropolitan-museum-of-art', 'The Metropolitan Museum of Art', 'New York, New York, United States', 'Encyclopedic art museum presenting works from cultures across five millennia.', 'https://www.metmuseum.org/'),
('art-institute-chicago', 'art-institute-chicago', 'art-institute-chicago', 'Art Institute of Chicago', 'Chicago, Illinois, United States', 'Museum founded in 1879 with a global collection spanning ancient objects through contemporary art.', 'https://www.artic.edu/'),
('belvedere', 'belvedere', 'belvedere', 'Belvedere', 'Vienna, Austria', 'Vienna museum centered on Austrian art and housed in the historic Belvedere palace complex.', 'https://www.belvedere.at/en'),
('uffizi-galleries', 'uffizi-galleries', 'uffizi-galleries', 'Uffizi Galleries', 'Florence, Italy', 'Florentine museum complex holding a landmark collection of Italian Renaissance art.', 'https://www.uffizi.it/en'),
('rijksmuseum', 'rijksmuseum', 'rijksmuseum', 'Rijksmuseum', 'Amsterdam, Netherlands', 'National museum of the Netherlands devoted to Dutch art and history.', 'https://www.rijksmuseum.nl/en'),
('museo-del-prado', 'museo-del-prado', 'museo-del-prado', 'Museo Nacional del Prado', 'Madrid, Spain', 'Spain''s national art museum, renowned for European painting from the twelfth through early twentieth centuries.', 'https://www.museodelprado.es/en'),
('hamburger-kunsthalle', 'hamburger-kunsthalle', 'hamburger-kunsthalle', 'Hamburger Kunsthalle', 'Hamburg, Germany', 'Hamburg art museum whose collection ranges from medieval painting to contemporary art.', 'https://www.hamburger-kunsthalle.de/en'),
('musee-orsay', 'musee-orsay', 'musee-orsay', 'Musée d''Orsay', 'Paris, France', 'Paris museum focused on art made from 1848 to 1914, with a leading Impressionist collection.', 'https://www.musee-orsay.fr/en'),
('national-gallery-london', 'national-gallery-london', 'national-gallery-london', 'The National Gallery', 'London, United Kingdom', 'London''s national collection of Western European painting from the thirteenth to early twentieth century.', 'https://www.nationalgallery.org.uk/'),
('musee-marmottan-monet', 'musee-marmottan-monet', 'musee-marmottan-monet', 'Musée Marmottan Monet', 'Paris, France', 'Paris museum holding the world''s largest collection of works by Claude Monet.', 'https://www.marmottan.fr/en/'),
('wallace-collection', 'wallace-collection', 'wallace-collection', 'The Wallace Collection', 'London, United Kingdom', 'Fine and decorative arts collection displayed at Hertford House in London.', 'https://www.wallacecollection.org/'),
('vatican-museums', 'vatican-museums', 'vatican-museums', 'Vatican Museums', 'Vatican City', 'Museums of the Holy See preserving art and archaeology assembled across centuries.', 'https://www.museivaticani.va/')
ON CONFLICT(`id`) DO UPDATE SET
  `source_id` = excluded.`source_id`,
  `slug` = excluded.`slug`,
  `name` = excluded.`name`,
  `location` = excluded.`location`,
  `description` = excluded.`description`,
  `url` = excluded.`url`;
--> statement-breakpoint
INSERT INTO `category` (`id`, `slug`, `name`, `description`, `sort_order`) VALUES
('category-painting', 'painting', 'Painting', 'Works made primarily with pigment applied to a prepared surface.', 1),
('category-print', 'print', 'Print', 'Images produced by transferring ink from a matrix to paper or another surface.', 2),
('category-fresco', 'fresco', 'Fresco', 'Wall paintings made by applying pigment to fresh plaster.', 3)
ON CONFLICT(`id`) DO UPDATE SET
  `slug` = excluded.`slug`,
  `name` = excluded.`name`,
  `description` = excluded.`description`,
  `sort_order` = excluded.`sort_order`;
--> statement-breakpoint
INSERT INTO `style` (`id`, `slug`, `name`, `description`, `sort_order`) VALUES
('style-impressionism', 'impressionism', 'Impressionism', 'Painting centered on changing light, direct observation, and visibly handled color.', 1),
('style-post-impressionism', 'post-impressionism', 'Post-Impressionism', 'Approaches extending Impressionism through structure, symbolism, and heightened color.', 2),
('style-pointillism', 'pointillism', 'Pointillism', 'Color applied in distinct marks intended to combine optically at viewing distance.', 3),
('style-realism', 'realism', 'Realism', 'Close attention to contemporary life, labor, people, and observed material detail.', 4),
('style-romanticism', 'romanticism', 'Romanticism', 'Art emphasizing imagination, emotion, history, sublimity, and the power of nature.', 5),
('style-renaissance', 'renaissance', 'Renaissance', 'European art grounded in revived classical models, perspective, and humanist observation.', 6),
('style-northern-renaissance', 'northern-renaissance', 'Northern Renaissance', 'Renaissance art north of the Alps distinguished by oil technique and exacting material detail.', 7),
('style-baroque', 'baroque', 'Baroque', 'Dramatic seventeenth-century art shaped by movement, light, and spatial complexity.', 8),
('style-spanish-baroque', 'spanish-baroque', 'Spanish Baroque', 'Seventeenth-century Spanish art combining courtly representation, realism, and dramatic space.', 9),
('style-dutch-golden-age', 'dutch-golden-age', 'Dutch Golden Age', 'Seventeenth-century Dutch art spanning portraiture, daily life, landscape, and civic culture.', 10),
('style-japanese-ukiyo-e', 'japanese-ukiyo-e', 'Japanese Ukiyo-e', 'Japanese woodblock prints and paintings depicting landscapes and the floating world.', 11),
('style-vienna-secession', 'vienna-secession', 'Vienna Secession', 'Turn-of-the-century Viennese art joining symbolism, ornament, and modern design.', 12),
('style-art-nouveau', 'art-nouveau', 'Art Nouveau', 'Decorative art defined by organic contour, natural motifs, and integrated craftsmanship.', 13),
('style-aestheticism', 'aestheticism', 'Aestheticism', 'Art organized around beauty, tonal harmony, and formal arrangement rather than narrative.', 14),
('style-modernism', 'modernism', 'Modernism', 'Art that foregrounds experiment, medium, and new ways of representing modern experience.', 15),
('style-rococo', 'rococo', 'Rococo', 'Eighteenth-century art marked by elegance, asymmetry, play, and ornamental color.', 16)
ON CONFLICT(`id`) DO UPDATE SET
  `slug` = excluded.`slug`,
  `name` = excluded.`name`,
  `description` = excluded.`description`,
  `sort_order` = excluded.`sort_order`;
--> statement-breakpoint
INSERT INTO `artwork` (
  `id`, `source_id`, `gallery_id`, `source_external_id`, `slug`, `title`,
  `artist`, `date_display`, `description`, `medium`, `dimensions`, `credit_line`,
  `source_url`, `image_id`, `image_url`, `thumbnail_url`, `image_source_url`,
  `image_attribution`, `image_width`, `image_height`, `alt`,
  `is_public_domain`, `curated_at`
) VALUES
('moma-starry-night', 'moma', 'moma', '472.1941', 'the-starry-night', 'The Starry Night', 'Vincent van Gogh', '1889', 'Van Gogh turns the view from Saint-Rémy into a rhythmic night of spiraling sky, radiant stars, and a village held beneath a dark cypress.', 'Oil on canvas', '73.7 × 92.1 cm', 'Acquired through the Lillie P. Bliss Bequest', 'https://www.moma.org/collection/works/79802', 'File:Van Gogh - Starry Night - Google Art Project.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Van%20Gogh%20-%20Starry%20Night%20-%20Google%20Art%20Project.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Van%20Gogh%20-%20Starry%20Night%20-%20Google%20Art%20Project.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg', 'Image via Wikimedia Commons, Public domain.', 44567, 35291, 'A blue night landscape with a swirling sky, bright stars, a crescent moon, and a tall dark cypress.', 1, 1786400000000),
('louvre-mona-lisa', 'louvre', 'louvre', 'INV 779', 'mona-lisa', 'Mona Lisa', 'Leonardo da Vinci', 'c. 1503–1519', 'Leonardo unites a quietly turning figure with an invented landscape through subtle tonal transitions and a famously elusive expression.', 'Oil on poplar panel', '77 × 53 cm', 'Collection of the Musée du Louvre', 'https://collections.louvre.fr/en/ark:/53355/cl010062370', 'File:Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Mona%20Lisa%2C%20by%20Leonardo%20da%20Vinci%2C%20from%20C2RMF%20retouched.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Mona%20Lisa%2C%20by%20Leonardo%20da%20Vinci%2C%20from%20C2RMF%20retouched.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg', 'Image via Wikimedia Commons, Public domain.', 7479, 11146, 'Portrait of a seated woman with folded hands before a hazy river and mountain landscape.', 1, 1786396400000),
('mauritshuis-girl-pearl-earring', 'mauritshuis', 'mauritshuis', '670', 'girl-with-a-pearl-earring', 'Girl with a Pearl Earring', 'Johannes Vermeer', 'c. 1665', 'A young figure turns into the light against a dark ground, her glance and suspended expression giving this imagined character unusual immediacy.', 'Oil on canvas', '44.5 × 39 cm', 'Collection of the Mauritshuis', 'https://www.mauritshuis.nl/en/our-collection/artworks/670-girl-with-a-pearl-earring/', 'File:Meisje met de parel.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Meisje%20met%20de%20parel.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Meisje%20met%20de%20parel.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Meisje_met_de_parel.jpg', 'Image via Wikimedia Commons, Public domain.', 4095, 4794, 'A young woman in a blue and yellow head covering looks over her shoulder, wearing a large pearl earring.', 1, 1786392800000),
('met-great-wave', 'metropolitan-museum-of-art', 'metropolitan-museum-of-art', 'JP1847', 'the-great-wave', 'Under the Wave off Kanagawa (The Great Wave)', 'Katsushika Hokusai', 'c. 1830–1832', 'Hokusai suspends a cresting wave above three narrow boats while Mount Fuji appears small and still in the distance.', 'Polychrome woodblock print; ink and color on paper', '25.7 × 37.9 cm', 'The Howard Mansfield Collection, Purchase, Rogers Fund, 1936', 'https://www.metmuseum.org/art/collection/search/45434', 'File:Tsunami by hokusai 19th century.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Tsunami%20by%20hokusai%2019th%20century.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Tsunami%20by%20hokusai%2019th%20century.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg', 'Image via Wikimedia Commons, Public domain.', 3859, 2594, 'A towering blue wave curls over three boats with snowcapped Mount Fuji in the distance.', 1, 1786389200000),
('aic-water-lilies', 'art-institute-chicago', 'art-institute-chicago', '1933.1157', 'water-lilies-1906', 'Water Lilies', 'Claude Monet', '1906', 'Monet crops away the horizon so the pond becomes a field of reflected light, submerged color, and floating blossoms.', 'Oil on canvas', '89.9 × 94.1 cm', 'Mr. and Mrs. Martin A. Ryerson Collection', 'https://www.artic.edu/artworks/16568', 'File:Claude Monet - Water Lilies - 1933.1157 - Art Institute of Chicago.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Claude%20Monet%20-%20Water%20Lilies%20-%201933.1157%20-%20Art%20Institute%20of%20Chicago.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Claude%20Monet%20-%20Water%20Lilies%20-%201933.1157%20-%20Art%20Institute%20of%20Chicago.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1933.1157_-_Art_Institute_of_Chicago.jpg', 'Image via Wikimedia Commons, Public domain.', 3000, 2887, 'A close view of a pond filled with blue reflections and pale pink and white water lilies.', 1, 1786385600000),
('aic-grande-jatte', 'art-institute-chicago', 'art-institute-chicago', '1926.224', 'a-sunday-on-la-grande-jatte-1884', 'A Sunday on La Grande Jatte — 1884', 'Georges Seurat', '1884–1886', 'Seurat built this riverside crowd from distinct color marks, letting the viewer''s eye combine them into a monumental image of modern leisure.', 'Oil on canvas', '207.5 × 308.1 cm', 'Helen Birch Bartlett Memorial Collection', 'https://www.artic.edu/artworks/27992', 'File:A Sunday on La Grande Jatte, Georges Seurat, 1884.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/A%20Sunday%20on%20La%20Grande%20Jatte%2C%20Georges%20Seurat%2C%201884.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/A%20Sunday%20on%20La%20Grande%20Jatte%2C%20Georges%20Seurat%2C%201884.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg', 'Image via Wikimedia Commons, Public domain.', 20000, 13313, 'A large park scene of people relaxing beside the Seine, painted from countless small color marks.', 1, 1786382000000),
('belvedere-the-kiss', 'belvedere', 'belvedere', '912', 'the-kiss', 'The Kiss', 'Gustav Klimt', '1908–1909', 'Klimt encloses an embracing couple in a square field of gold, contrasting geometric pattern with flowers, skin, and soft ground.', 'Oil and gold leaf on canvas', '180 × 180 cm', 'Collection of the Belvedere', 'https://www.belvedere.at/en/kiss-gustav-klimt', 'File:The Kiss - Gustav Klimt - Google Cultural Institute.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Kiss%20-%20Gustav%20Klimt%20-%20Google%20Cultural%20Institute.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Kiss%20-%20Gustav%20Klimt%20-%20Google%20Cultural%20Institute.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg', 'Image via Wikimedia Commons, Public domain.', 7376, 7401, 'An embracing couple wrapped in richly patterned gold robes kneels in a flower-filled meadow.', 1, 1786378400000),
('uffizi-birth-venus', 'uffizi-galleries', 'uffizi-galleries', '1890 no. 878', 'the-birth-of-venus', 'The Birth of Venus', 'Sandro Botticelli', 'c. 1485', 'Venus arrives at the shore on a shell as wind-driven figures and a waiting attendant create a flowing, linear rhythm.', 'Tempera on canvas', '172.5 × 278.9 cm', 'Collection of the Uffizi Galleries', 'https://www.uffizi.it/en/artworks/birth-of-venus', 'File:Sandro Botticelli - La nascita di Venere - Google Art Project - edited.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sandro%20Botticelli%20-%20La%20nascita%20di%20Venere%20-%20Google%20Art%20Project%20-%20edited.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Sandro%20Botticelli%20-%20La%20nascita%20di%20Venere%20-%20Google%20Art%20Project%20-%20edited.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg', 'Image via Wikimedia Commons, Public domain.', 30000, 18840, 'Venus stands on a shell at the shore while winds blow from the left and an attendant approaches with a floral cloak.', 1, 1786374800000),
('rijksmuseum-night-watch', 'rijksmuseum', 'rijksmuseum', 'SK-C-5', 'the-night-watch', 'The Night Watch', 'Rembrandt van Rijn', '1642', 'Rembrandt turns a civic guard portrait into a charged procession through dramatic light, overlapping gestures, and forward movement.', 'Oil on canvas', '379.5 × 453.5 cm', 'On loan from the City of Amsterdam', 'https://www.rijksmuseum.nl/en/collection/SK-C-5', 'File:The Nightwatch by Rembrandt - Rijksmuseum.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Nightwatch%20by%20Rembrandt%20-%20Rijksmuseum.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Nightwatch%20by%20Rembrandt%20-%20Rijksmuseum.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:The_Nightwatch_by_Rembrandt_-_Rijksmuseum.jpg', 'Image via Wikimedia Commons, Public domain.', 14168, 11528, 'A large civic guard company emerges from shadow as two central officers stride forward.', 1, 1786371200000),
('rijksmuseum-milkmaid', 'rijksmuseum', 'rijksmuseum', 'SK-A-2344', 'the-milkmaid', 'The Milkmaid', 'Johannes Vermeer', 'c. 1660', 'A kitchen maid pours milk in a quiet room where precise light, worn surfaces, and concentrated attention give daily labor gravity.', 'Oil on canvas', '45.5 × 41 cm', 'Purchased with the support of the Vereniging Rembrandt', 'https://www.rijksmuseum.nl/en/collection/SK-A-2344', 'File:Johannes Vermeer - Het melkmeisje - Google Art Project.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Johannes%20Vermeer%20-%20Het%20melkmeisje%20-%20Google%20Art%20Project.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Johannes%20Vermeer%20-%20Het%20melkmeisje%20-%20Google%20Art%20Project.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg', 'Image via Wikimedia Commons, Public domain.', 4000, 4485, 'A woman in a blue apron pours milk beside bread on a table in a sunlit room.', 1, 1786367600000),
('prado-las-meninas', 'museo-del-prado', 'museo-del-prado', 'P001174', 'las-meninas', 'Las Meninas', 'Diego Velázquez', '1656', 'Velázquez places the royal household, painter, viewers, and reflected monarchs in a complex exchange of gazes and spaces.', 'Oil on canvas', '320.5 × 281.5 cm', 'Royal Collection; Museo Nacional del Prado', 'https://www.museodelprado.es/en/the-collection/art-work/las-meninas/2cd3eccf-4551-4a43-ac72-cef090a05bd7', 'File:Las Meninas, by Diego Velázquez, from Prado in Google Earth.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Las%20Meninas%2C%20by%20Diego%20Vel%C3%A1zquez%2C%20from%20Prado%20in%20Google%20Earth.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Las%20Meninas%2C%20by%20Diego%20Vel%C3%A1zquez%2C%20from%20Prado%20in%20Google%20Earth.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Las_Meninas,_by_Diego_Vel%C3%A1zquez,_from_Prado_in_Google_Earth.jpg', 'Image via Wikimedia Commons, Public domain.', 26065, 30000, 'The young Infanta stands among attendants in a palace studio while Velázquez paints at a large canvas.', 1, 1786364000000),
('prado-third-may', 'museo-del-prado', 'museo-del-prado', 'P000749', 'the-third-of-may-1808', 'The Third of May 1808', 'Francisco de Goya', '1814', 'A lantern isolates a man facing a firing squad, transforming a historical execution into an indictment of mechanized violence.', 'Oil on canvas', '268 × 347 cm', 'Museo Nacional del Prado', 'https://www.museodelprado.es/en/the-collection/art-work/the-3rd-of-may-1808-in-madrid-or-the-executions/5e177409-2993-4240-97fb-847a02c6496c', 'File:El Tres de Mayo, by Francisco de Goya, from Prado in Google Earth.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/El%20Tres%20de%20Mayo%2C%20by%20Francisco%20de%20Goya%2C%20from%20Prado%20in%20Google%20Earth.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/El%20Tres%20de%20Mayo%2C%20by%20Francisco%20de%20Goya%2C%20from%20Prado%20in%20Google%20Earth.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:El_Tres_de_Mayo,_by_Francisco_de_Goya,_from_Prado_in_Google_Earth.jpg', 'Image via Wikimedia Commons, Public domain.', 30000, 23131, 'A man in a white shirt raises his arms before a firing squad at night as bodies lie nearby.', 1, 1786360400000),
('hamburg-wanderer', 'hamburger-kunsthalle', 'hamburger-kunsthalle', 'HK-5161', 'wanderer-above-the-sea-of-fog', 'Wanderer above the Sea of Fog', 'Caspar David Friedrich', 'c. 1818', 'A solitary figure seen from behind surveys peaks rising through fog, making landscape both an external vista and a space for inward reflection.', 'Oil on canvas', '94.8 × 74.8 cm', 'Collection of the Hamburger Kunsthalle', 'https://online-sammlung.hamburger-kunsthalle.de/en/objekt/HK-5161/wanderer-ueber-dem-nebelmeer', 'File:Caspar David Friedrich - Wanderer above the sea of fog.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Caspar%20David%20Friedrich%20-%20Wanderer%20above%20the%20sea%20of%20fog.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Caspar%20David%20Friedrich%20-%20Wanderer%20above%20the%20sea%20of%20fog.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg', 'Image via Wikimedia Commons, Public domain.', 2327, 2980, 'A man with a walking stick stands on a rocky summit above a vast landscape filled with fog.', 1, 1786356800000),
('louvre-liberty', 'louvre', 'louvre', 'RF 129', 'liberty-leading-the-people', 'Liberty Leading the People', 'Eugène Delacroix', '1830', 'An allegorical Liberty advances over a barricade with citizens from different social classes, joining history painting to revolutionary urgency.', 'Oil on canvas', '260 × 325 cm', 'Collection of the Musée du Louvre', 'https://collections.louvre.fr/en/ark:/53355/cl010065872', 'File:Eugène Delacroix - La liberté guidant le peuple.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Eug%C3%A8ne%20Delacroix%20-%20La%20libert%C3%A9%20guidant%20le%20peuple.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Eug%C3%A8ne%20Delacroix%20-%20La%20libert%C3%A9%20guidant%20le%20peuple.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Eug%C3%A8ne_Delacroix_-_La_libert%C3%A9_guidant_le_peuple.jpg', 'Image via Wikimedia Commons, Public domain.', 3133, 2480, 'A woman carrying the French tricolor leads armed citizens forward across a barricade.', 1, 1786353200000),
('orsay-whistlers-mother', 'musee-orsay', 'musee-orsay', 'RF 699', 'arrangement-in-grey-and-black-no-1', 'Arrangement in Grey and Black No. 1', 'James McNeill Whistler', '1871', 'Whistler reduces the seated profile of his mother to a restrained arrangement of neutral tones, firm horizontals, and spare detail.', 'Oil on canvas', '144.3 × 163 cm', 'Purchased from the artist by the French state, 1891', 'https://www.musee-orsay.fr/en/artworks/arrangement-en-gris-et-noir-ndeg1-974', 'File:Whistlers Mother high res.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Whistlers%20Mother%20high%20res.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Whistlers%20Mother%20high%20res.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Whistlers_Mother_high_res.jpg', 'Image via Wikimedia Commons, Public domain.', 5897, 5247, 'An elderly woman in a black dress and white cap sits in profile against a gray wall.', 1, 1786349600000),
('orsay-olympia', 'musee-orsay', 'musee-orsay', 'RF 644', 'olympia', 'Olympia', 'Édouard Manet', '1863', 'Manet confronts conventions of the reclining nude with flat light, abrupt contrasts, modern details, and the sitter''s direct gaze.', 'Oil on canvas', '130.5 × 190 cm', 'Given to the French state by public subscription, 1890', 'https://www.musee-orsay.fr/en/artworks/olympia-712', 'File:Edouard Manet - Olympia - Google Art Project 3.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Edouard%20Manet%20-%20Olympia%20-%20Google%20Art%20Project%203.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Edouard%20Manet%20-%20Olympia%20-%20Google%20Art%20Project%203.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Edouard_Manet_-_Olympia_-_Google_Art_Project_3.jpg', 'Image via Wikimedia Commons, Public domain.', 3510, 2391, 'A reclining nude woman looks directly outward while a servant presents flowers behind her.', 1, 1786346000000),
('orsay-moulin-galette', 'musee-orsay', 'musee-orsay', 'RF 2739', 'bal-du-moulin-de-la-galette', 'Bal du moulin de la Galette', 'Pierre-Auguste Renoir', '1876', 'Renoir fills a Montmartre dance garden with moving figures and patches of natural and artificial light, capturing urban leisure as a shifting atmosphere.', 'Oil on canvas', '131.5 × 176.5 cm', 'Gustave Caillebotte Bequest, 1896', 'https://www.musee-orsay.fr/en/artworks/bal-du-moulin-de-la-galette-497', 'File:Renoir, Pierre-Auguste - Dance at Le Moulin de la Galette, 1876.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Renoir%2C%20Pierre-Auguste%20-%20Dance%20at%20Le%20Moulin%20de%20la%20Galette%2C%201876.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Renoir%2C%20Pierre-Auguste%20-%20Dance%20at%20Le%20Moulin%20de%20la%20Galette%2C%201876.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Renoir,_Pierre-Auguste_-_Dance_at_Le_Moulin_de_la_Galette,_1876.jpg', 'Image via Wikimedia Commons, Public domain.', 40869, 30379, 'A crowded outdoor dance in Montmartre, with couples and friends gathered under trees and strings of lights.', 1, 1786342400000),
('orsay-gleaners', 'musee-orsay', 'musee-orsay', 'RF 592', 'the-gleaners', 'The Gleaners', 'Jean-François Millet', '1857', 'Three women bend to gather leftover grain while distant abundance and a mounted overseer sharpen the painting''s social contrast.', 'Oil on canvas', '83.5 × 110 cm', 'Collection of the Musée d''Orsay', 'https://www.musee-orsay.fr/en/artworks/des-glaneuses-342', 'File:Jean-François Millet - Gleaners - Google Art Project 2.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Jean-Fran%C3%A7ois%20Millet%20-%20Gleaners%20-%20Google%20Art%20Project%202.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Jean-Fran%C3%A7ois%20Millet%20-%20Gleaners%20-%20Google%20Art%20Project%202.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Jean-Fran%C3%A7ois_Millet_-_Gleaners_-_Google_Art_Project_2.jpg', 'Image via Wikimedia Commons, Public domain.', 5354, 4006, 'Three women stoop to gather grain in a harvested field while large haystacks rise in the distance.', 1, 1786338800000),
('national-gallery-arnolfini', 'national-gallery-london', 'national-gallery-london', 'NG186', 'the-arnolfini-portrait', 'The Arnolfini Portrait', 'Jan van Eyck', '1434', 'Van Eyck records a richly furnished interior with microscopic clarity while mirror, gestures, and paired objects invite layered readings.', 'Oil on oak', '82.2 × 60 cm', 'Bought, 1842; The National Gallery', 'https://www.nationalgallery.org.uk/paintings/jan-van-eyck-the-arnolfini-portrait', 'File:Van Eyck - Arnolfini Portrait.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Van%20Eyck%20-%20Arnolfini%20Portrait.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Van%20Eyck%20-%20Arnolfini%20Portrait.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Van_Eyck_-_Arnolfini_Portrait.jpg', 'Image via Wikimedia Commons, Public domain.', 4386, 6000, 'A richly dressed couple stands in a bedroom, reflected with two other figures in a small convex mirror.', 1, 1786335200000),
('national-gallery-temeraire', 'national-gallery-london', 'national-gallery-london', 'NG524', 'the-fighting-temeraire', 'The Fighting Temeraire', 'J. M. W. Turner', '1839', 'A small steam tug pulls a pale veteran warship toward its final berth beneath a blazing sunset, setting old power against industrial change.', 'Oil on canvas', '90.7 × 121.6 cm', 'Turner Bequest, 1856; The National Gallery', 'https://www.nationalgallery.org.uk/paintings/joseph-mallord-william-turner-the-fighting-temeraire', 'File:The Fighting Temeraire, JMW Turner, National Gallery.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Fighting%20Temeraire%2C%20JMW%20Turner%2C%20National%20Gallery.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Fighting%20Temeraire%2C%20JMW%20Turner%2C%20National%20Gallery.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:The_Fighting_Temeraire,_JMW_Turner,_National_Gallery.jpg', 'Image via Wikimedia Commons, Public domain.', 5684, 4223, 'A dark steam tug tows a pale sailing warship across calm water beneath a glowing sunset.', 1, 1786331600000),
('national-gallery-hay-wain', 'national-gallery-london', 'national-gallery-london', 'NG1207', 'the-hay-wain', 'The Hay Wain', 'John Constable', '1821', 'Constable places a wagon crossing the River Stour within a closely observed working landscape animated by weather, water, and foliage.', 'Oil on canvas', '130.2 × 185.4 cm', 'Gift of Henry Vaughan, 1886; The National Gallery', 'https://www.nationalgallery.org.uk/paintings/john-constable-the-hay-wain', 'File:John-constable-the-hay-wain.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/John-constable-the-hay-wain.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/John-constable-the-hay-wain.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:John-constable-the-hay-wain.jpg', 'Image via Wikimedia Commons, CC0.', 6128, 4226, 'A horse-drawn wagon crosses a shallow river beside a cottage beneath a broad cloud-filled sky.', 1, 1786328000000),
('marmottan-impression-sunrise', 'musee-marmottan-monet', 'musee-marmottan-monet', 'Inv. 4014', 'impression-sunrise', 'Impression, Sunrise', 'Claude Monet', '1872', 'Monet sketches Le Havre harbor in blue-gray haze, with a small orange sun and its reflection anchoring the rapidly worked surface.', 'Oil on canvas', '48 × 63 cm', 'Musée Marmottan Monet collection', 'https://www.marmottan.fr/en/collections/claude-monet/', 'File:Monet - Impression, Sunrise.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Monet%20-%20Impression%2C%20Sunrise.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Monet%20-%20Impression%2C%20Sunrise.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Monet_-_Impression,_Sunrise.jpg', 'Image via Wikimedia Commons, Public domain.', 5773, 4478, 'A hazy harbor at dawn with small boats, distant masts, and a bright orange sun reflected on blue water.', 1, 1786324400000),
('wallace-the-swing', 'wallace-collection', 'wallace-collection', 'P430', 'the-swing', 'The Swing', 'Jean-Honoré Fragonard', 'c. 1767–1768', 'Fragonard stages a secretive garden encounter around the arc of a pink dress, a flying slipper, and lush theatrical foliage.', 'Oil on canvas', '81 × 64.2 cm', 'The Wallace Collection', 'https://www.wallacecollection.org/explore/collection/search-the-collection/les-hazards-heureux-de-lescarpolette-swing/', 'File:Joean Honoré Fragonard - The Swing.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Joean%20Honor%C3%A9%20Fragonard%20-%20The%20Swing.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Joean%20Honor%C3%A9%20Fragonard%20-%20The%20Swing.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:Joean_Honor%C3%A9_Fragonard_-_The_Swing.jpg', 'Image via Wikimedia Commons, Public domain.', 3666, 4685, 'A woman in a pink dress swings through a lush garden while two men watch from below.', 1, 1786320800000),
('vatican-school-athens', 'vatican-museums', 'vatican-museums', 'Stanza della Segnatura', 'the-school-of-athens', 'The School of Athens', 'Raphael', '1509–1511', 'Raphael gathers ancient philosophers in an ideal classical architecture, organizing many distinct gestures around Plato and Aristotle.', 'Fresco', '500 × 770 cm', 'Vatican Museums', 'https://www.museivaticani.va/content/museivaticani/en/collezioni/musei/stanze-di-raffaello/stanza-della-segnatura/scuola-di-atene.html', 'File:The School of Athens-Vatican.jpg', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20School%20of%20Athens-Vatican.jpg?width=1686', 'https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20School%20of%20Athens-Vatican.jpg?width=843', 'https://commons.wikimedia.org/wiki/File:The_School_of_Athens-Vatican.jpg', 'Photograph by Joseolgon via Wikimedia Commons, CC BY 4.0.', 5472, 3648, 'Ancient philosophers gather and debate in a vast classical hall beneath coffered arches.', 1, 1786317200000)
ON CONFLICT(`id`) DO UPDATE SET
  `source_id` = excluded.`source_id`,
  `gallery_id` = excluded.`gallery_id`,
  `source_external_id` = excluded.`source_external_id`,
  `slug` = excluded.`slug`,
  `title` = excluded.`title`,
  `artist` = excluded.`artist`,
  `date_display` = excluded.`date_display`,
  `description` = excluded.`description`,
  `medium` = excluded.`medium`,
  `dimensions` = excluded.`dimensions`,
  `credit_line` = excluded.`credit_line`,
  `source_url` = excluded.`source_url`,
  `image_id` = excluded.`image_id`,
  `image_url` = excluded.`image_url`,
  `thumbnail_url` = excluded.`thumbnail_url`,
  `image_source_url` = excluded.`image_source_url`,
  `image_attribution` = excluded.`image_attribution`,
  `image_width` = excluded.`image_width`,
  `image_height` = excluded.`image_height`,
  `alt` = excluded.`alt`,
  `is_public_domain` = excluded.`is_public_domain`,
  `curated_at` = excluded.`curated_at`;
--> statement-breakpoint
INSERT OR IGNORE INTO `artwork_category` (`artwork_id`, `category_id`) VALUES
('moma-starry-night', 'category-painting'),
('louvre-mona-lisa', 'category-painting'),
('mauritshuis-girl-pearl-earring', 'category-painting'),
('met-great-wave', 'category-print'),
('aic-water-lilies', 'category-painting'),
('aic-grande-jatte', 'category-painting'),
('belvedere-the-kiss', 'category-painting'),
('uffizi-birth-venus', 'category-painting'),
('rijksmuseum-night-watch', 'category-painting'),
('rijksmuseum-milkmaid', 'category-painting'),
('prado-las-meninas', 'category-painting'),
('prado-third-may', 'category-painting'),
('hamburg-wanderer', 'category-painting'),
('louvre-liberty', 'category-painting'),
('orsay-whistlers-mother', 'category-painting'),
('orsay-olympia', 'category-painting'),
('orsay-moulin-galette', 'category-painting'),
('orsay-gleaners', 'category-painting'),
('national-gallery-arnolfini', 'category-painting'),
('national-gallery-temeraire', 'category-painting'),
('national-gallery-hay-wain', 'category-painting'),
('marmottan-impression-sunrise', 'category-painting'),
('wallace-the-swing', 'category-painting'),
('vatican-school-athens', 'category-fresco');
--> statement-breakpoint
INSERT OR IGNORE INTO `artwork_style` (`artwork_id`, `style_id`) VALUES
('moma-starry-night', 'style-post-impressionism'),
('louvre-mona-lisa', 'style-renaissance'),
('mauritshuis-girl-pearl-earring', 'style-dutch-golden-age'),
('mauritshuis-girl-pearl-earring', 'style-baroque'),
('met-great-wave', 'style-japanese-ukiyo-e'),
('aic-water-lilies', 'style-impressionism'),
('aic-grande-jatte', 'style-pointillism'),
('aic-grande-jatte', 'style-post-impressionism'),
('belvedere-the-kiss', 'style-vienna-secession'),
('belvedere-the-kiss', 'style-art-nouveau'),
('uffizi-birth-venus', 'style-renaissance'),
('rijksmuseum-night-watch', 'style-dutch-golden-age'),
('rijksmuseum-night-watch', 'style-baroque'),
('rijksmuseum-milkmaid', 'style-dutch-golden-age'),
('rijksmuseum-milkmaid', 'style-baroque'),
('prado-las-meninas', 'style-spanish-baroque'),
('prado-las-meninas', 'style-baroque'),
('prado-third-may', 'style-romanticism'),
('hamburg-wanderer', 'style-romanticism'),
('louvre-liberty', 'style-romanticism'),
('orsay-whistlers-mother', 'style-aestheticism'),
('orsay-whistlers-mother', 'style-realism'),
('orsay-olympia', 'style-realism'),
('orsay-olympia', 'style-modernism'),
('orsay-moulin-galette', 'style-impressionism'),
('orsay-gleaners', 'style-realism'),
('national-gallery-arnolfini', 'style-northern-renaissance'),
('national-gallery-temeraire', 'style-romanticism'),
('national-gallery-hay-wain', 'style-romanticism'),
('marmottan-impression-sunrise', 'style-impressionism'),
('wallace-the-swing', 'style-rococo'),
('vatican-school-athens', 'style-renaissance');
--> statement-breakpoint
UPDATE `artwork`
SET
  `image_r2_key` = 'artworks/v1/' || `id` || '/full.jpg',
  `thumbnail_r2_key` = 'artworks/v1/' || `id` || '/thumbnail.jpg'
WHERE `id` IN ('moma-starry-night', 'louvre-mona-lisa', 'mauritshuis-girl-pearl-earring', 'met-great-wave', 'aic-water-lilies', 'aic-grande-jatte', 'belvedere-the-kiss', 'uffizi-birth-venus', 'rijksmuseum-night-watch', 'rijksmuseum-milkmaid', 'prado-las-meninas', 'prado-third-may', 'hamburg-wanderer', 'louvre-liberty', 'orsay-whistlers-mother', 'orsay-olympia', 'orsay-moulin-galette', 'orsay-gleaners', 'national-gallery-arnolfini', 'national-gallery-temeraire', 'national-gallery-hay-wain', 'marmottan-impression-sunrise', 'wallace-the-swing', 'vatican-school-athens');
--> statement-breakpoint
INSERT OR IGNORE INTO `favorite` (`user_id`, `artwork_id`, `created_at`)
SELECT `user_id`, `artwork_id`, `created_at`
FROM `_migration_0003_favorite_map`;
--> statement-breakpoint
DROP TABLE `_migration_0003_favorite_map`;
