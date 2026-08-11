-- Historical public-domain starter collection sourced from the Art Institute of Chicago API.
-- Reconstructed from the persisted D1 state; keep this applied migration immutable.
INSERT INTO source VALUES('art-institute-chicago','art-institute-chicago','Art Institute of Chicago','museum','https://www.artic.edu/','Public-domain artwork images and CC0 metadata provided by the Art Institute of Chicago.','https://www.artic.edu/terms',1786403182366);
--> statement-breakpoint
INSERT INTO gallery VALUES('art-institute-chicago','art-institute-chicago','art-institute-chicago','Art Institute of Chicago','Chicago, Illinois, United States','A museum founded in 1879 with a global collection spanning ancient objects through contemporary art.','https://www.artic.edu/',1786403182366);
--> statement-breakpoint
INSERT INTO category VALUES('category-painting','painting','Painting','Works made primarily with pigment applied to a prepared surface.',1);
--> statement-breakpoint
INSERT INTO category VALUES('category-print','print','Print','Images produced by transferring ink from a matrix to paper or another surface.',2);
--> statement-breakpoint
INSERT INTO category VALUES('category-works-on-paper','works-on-paper','Works on Paper','Drawings, watercolors, and other works whose primary support is paper.',3);
--> statement-breakpoint
INSERT INTO category VALUES('category-sculpture','sculpture','Sculpture','Three-dimensional works shaped, carved, assembled, cast, or modeled.',4);
--> statement-breakpoint
INSERT INTO category VALUES('category-decorative-arts','decorative-arts','Decorative Arts','Functional objects distinguished by exceptional material and visual design.',5);
--> statement-breakpoint
INSERT INTO style VALUES('style-impressionism','impressionism','Impressionism','Modern painting centered on changing light, direct observation, and visibly handled color.',1);
--> statement-breakpoint
INSERT INTO style VALUES('style-post-impressionism','post-impressionism','Post-Impressionism','Diverse approaches that extended Impressionism through structure, symbolism, and heightened color.',2);
--> statement-breakpoint
INSERT INTO style VALUES('style-pointillism','pointillism','Pointillism','Color applied in distinct marks intended to combine optically at viewing distance.',3);
--> statement-breakpoint
INSERT INTO style VALUES('style-realism','realism','Realism','Close attention to contemporary life, labor, people, and observed material detail.',4);
--> statement-breakpoint
INSERT INTO style VALUES('style-modernism','modernism','Modernism','Art that foregrounds experiment, medium, and new ways of representing modern experience.',5);
--> statement-breakpoint
INSERT INTO style VALUES('style-romanticism','romanticism','Romanticism','Art emphasizing imagination, emotion, sublimity, and the power of nature.',6);
--> statement-breakpoint
INSERT INTO style VALUES('style-hudson-river-school','hudson-river-school','Hudson River School','Nineteenth-century American landscape painting shaped by detailed observation and idealized grandeur.',7);
--> statement-breakpoint
INSERT INTO style VALUES('style-mannerism','mannerism','Mannerism','Elongated form, complex space, and heightened elegance following the High Renaissance.',8);
--> statement-breakpoint
INSERT INTO style VALUES('style-renaissance','renaissance','Renaissance','European art grounded in revived classical models, perspective, and humanist observation.',9);
--> statement-breakpoint
INSERT INTO style VALUES('style-japanese-ukiyo-e','japanese-ukiyo-e','Japanese Ukiyo-e','Japanese woodblock prints and paintings depicting the floating world, landscapes, and everyday culture.',10);
--> statement-breakpoint
INSERT INTO style VALUES('style-art-nouveau','art-nouveau','Art Nouveau','Decorative art defined by organic contour, natural motifs, and integrated craftsmanship.',11);
--> statement-breakpoint
INSERT INTO style VALUES('style-arts-and-crafts','arts-and-crafts','Arts and Crafts','Design joining skilled making, honest materials, and beauty in useful objects.',12);
--> statement-breakpoint
INSERT INTO style VALUES('style-african-art','african-art','African Art','Works from the many artistic traditions and cultural contexts of the African continent.',13);
--> statement-breakpoint
INSERT INTO style VALUES('style-south-asian','south-asian','South Asian','Art from the varied courtly, religious, and regional traditions of South Asia.',14);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-27992','art-institute-chicago','art-institute-chicago','27992','a-sunday-on-la-grande-jatte-1884','A Sunday on La Grande Jatte — 1884','Georges Seurat','1884–86, border added 1888–89','Seurat built this riverside scene from thousands of distinct color marks, letting the viewer''s eye blend them at a distance. Its monumental calm turns an ordinary Sunday crowd into a study of modern life.','Oil on canvas','207.5 × 308.1 cm (81 3/4 × 121 1/4 in.)','Helen Birch Bartlett Memorial Collection','https://www.artic.edu/artworks/27992','2d484387-2509-5e8e-2c43-22f9981972eb','https://www.artic.edu/iiif/2/2d484387-2509-5e8e-2c43-22f9981972eb/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/2d484387-2509-5e8e-2c43-22f9981972eb/full/843,/0/default.jpg',9310,6237,'Large painting of people in a crowded park, brushstrokes are dots.',1,1786400000000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-20684','art-institute-chicago','art-institute-chicago','20684','paris-street-rainy-day','Paris Street; Rainy Day','Gustave Caillebotte','1877','Caillebotte stages a newly rebuilt Paris intersection with the sharp geometry and abrupt cropping of modern photography. Wet cobblestones and isolated figures make the spacious boulevard feel both immediate and anonymous.','Oil on canvas','212.2 × 276.2 cm (83 1/2 × 108 3/4 in.); Framed: 241.3 × 306.1 × 10.2 cm (95 × 120 1/2 × 4 in.)','Charles H. and Mary F. S. Worcester Collection','https://www.artic.edu/artworks/20684','f8fd76e9-c396-5678-36ed-6a348c904d27','https://www.artic.edu/iiif/2/f8fd76e9-c396-5678-36ed-6a348c904d27/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/f8fd76e9-c396-5678-36ed-6a348c904d27/full/843,/0/default.jpg',9987,7755,'Life-size painting of an urban scene in Paris. A man in a top hat holding an umbrella and a woman in a long fashionable dark dress walk arm in arm toward the viewer as other city dwellers with umbrellas walk in various directions across cobblestone roads and sidewalks.',1,1786396400000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-16568','art-institute-chicago','art-institute-chicago','16568','water-lilies-1906','Water Lilies','Claude Monet','1906','Monet crops away the horizon so the pond becomes a field of reflected light, submerged color, and floating blossoms. The dense surface anticipates the immersive water-lily paintings of his later years.','Oil on canvas','89.9 × 94.1 cm (35 3/8 × 37 1/16 in.); Framed: 103.2 × 107 × 5.8 cm (40 5/8 × 42 1/8 × 2 1/4 in.)','Mr. and Mrs. Martin A. Ryerson Collection','https://www.artic.edu/artworks/16568','3c27b499-af56-f0d5-93b5-a7f2f1ad5813','https://www.artic.edu/iiif/2/3c27b499-af56-f0d5-93b5-a7f2f1ad5813/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/3c27b499-af56-f0d5-93b5-a7f2f1ad5813/full/843,/0/default.jpg',8808,8460,'Painting of a pond seen up close spotted with thickly painted pink and white water lilies and a shadow across the top third of the picture.',1,1786392800000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-28560','art-institute-chicago','art-institute-chicago','28560','the-bedroom','The Bedroom','Vincent van Gogh','1889','Van Gogh used tilted perspective, broad outlines, and emphatic complementary colors to recast his room in Arles as a place of vivid psychological presence. This is one of three painted versions of the composition.','Oil on canvas','73.6 × 92.3 cm (29 × 36 5/8 in.); Framed: 88.9 × 108 × 8.9 cm (35 × 42 1/2 × 3 1/2 in.)','Helen Birch Bartlett Memorial Collection','https://www.artic.edu/artworks/28560','6644829f-f292-c5c4-a73c-0356a6fdbf0d','https://www.artic.edu/iiif/2/6644829f-f292-c5c4-a73c-0356a6fdbf0d/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/6644829f-f292-c5c4-a73c-0356a6fdbf0d/full/843,/0/default.jpg',12614,9875,'Painting of bedroom, blue walls, green window, tan bed, red bedding.',1,1786389200000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-24645','art-institute-chicago','art-institute-chicago','24645','the-great-wave','Under the Wave off Kanagawa (Kanagawa oki nami ura), also known as The Great Wave, from the series "Thirty-Six Views of Mount Fuji (Fugaku sanjūrokkei)"','Katsushika Hokusai','1830/33','Hokusai suspends a cresting wave above three narrow boats while Mount Fuji appears small and still in the distance. Bold contour and Prussian blue make it an enduring image of ukiyo-e.','Color woodblock print; oban','25.4 × 37.6 cm (10 × 14 3/4 in.)','Clarence Buckingham Collection','https://www.artic.edu/artworks/24645','b3974542-b9b4-7568-fc4b-966738f61d78','https://www.artic.edu/iiif/2/b3974542-b9b4-7568-fc4b-966738f61d78/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/b3974542-b9b4-7568-fc4b-966738f61d78/full/843,/0/default.jpg',6679,4577,'A crashing wave looms over two small ships, Mount Fuji in the background.',1,1786385600000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-14655','art-institute-chicago','art-institute-chicago','14655','two-sisters-on-the-terrace','Two Sisters (On the Terrace)','Pierre-Auguste Renoir','1881','Renoir balances carefully modeled figures against a loosely brushed riverside garden. Bright hats, flowers, fruit, and yarn form a concentrated palette within the airy setting.','Oil on canvas','100.4 × 80.9 cm (39 1/2 × 31 7/8 in.); Framed: 119.1 × 100.1 × 7.7 cm (46 7/8 × 39 3/8 × 3 in.)','Mr. and Mrs. Lewis Larned Coburn Memorial Collection','https://www.artic.edu/artworks/14655','3a608f55-d76e-fa96-d0b1-0789fbc48f1e','https://www.artic.edu/iiif/2/3a608f55-d76e-fa96-d0b1-0789fbc48f1e/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/3a608f55-d76e-fa96-d0b1-0789fbc48f1e/full/843,/0/default.jpg',19848,24629,'Impressionist painting of two girls on balcony, bright flower hat, knitting basket.',1,1786382000000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-111442','art-institute-chicago','art-institute-chicago','111442','the-childs-bath','The Child''s Bath','Mary Cassatt','1893','Cassatt observes an ordinary act of care from a steep viewpoint, arranging patterned fabrics and interlocking bodies into a compact composition shaped by her study of Japanese prints.','Oil on canvas','101.3 × 67.3 cm (39 15/16 × 26 1/2 in.)','Robert A. Waller Fund','https://www.artic.edu/artworks/111442','3b885ae0-4d46-5fe4-d70a-00474827f02c','https://www.artic.edu/iiif/2/3b885ae0-4d46-5fe4-d70a-00474827f02c/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/3b885ae0-4d46-5fe4-d70a-00474827f02c/full/843,/0/default.jpg',8470,12853,'Painting of mother in blue, purple, and green-stripped dress washing child''s feet.',1,1786378400000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-80607','art-institute-chicago','art-institute-chicago','80607','self-portrait-van-gogh-1887','Self-Portrait','Vincent van Gogh','1887','Short, opposing strokes animate Van Gogh''s face and the surrounding field with equal intensity. Painted in Paris, the portrait shows his experiments with complementary color and pointillist technique.','Oil on artist''s board, mounted on cradled panel','41 × 32.5 cm (16 1/8 × 12 13/16 in.); Framed: 61.6 × 53.4 × 8.9 cm (24 1/4 × 21 × 3 1/2 in.)','Joseph Winterbotham Collection','https://www.artic.edu/artworks/80607','47c5bcb8-62ef-e5d7-55e7-f5121f409a30','https://www.artic.edu/iiif/2/47c5bcb8-62ef-e5d7-55e7-f5121f409a30/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/47c5bcb8-62ef-e5d7-55e7-f5121f409a30/full/843,/0/default.jpg',6116,7794,'Painting of a red-haired, bearded man with light skin, painted in short brushstrokes and multicolored dots. The background is likewise a mass of small, closely spaced colored dots, these in green, blue, and red-orange.',1,1786374800000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-61128','art-institute-chicago','art-institute-chicago','61128','at-the-moulin-rouge','At the Moulin Rouge','Henri de Toulouse-Lautrec','1892–95','Toulouse-Lautrec assembles performers, patrons, and his own small silhouette inside the famous Paris nightclub. Acidic light and oblique cropping turn the social scene uncanny.','Oil on canvas','123 × 141 cm (48 7/16 × 55 1/2 in.); Framed: 136.9 × 154.7 × 8.5 cm (53 7/8 × 60 7/8 × 3 5/16 in.)','Helen Birch Bartlett Memorial Collection','https://www.artic.edu/artworks/61128','defb4004-b500-218d-3d9b-9a02423f097d','https://www.artic.edu/iiif/2/defb4004-b500-218d-3d9b-9a02423f097d/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/defb4004-b500-218d-3d9b-9a02423f097d/full/843,/0/default.jpg',7788,6807,'Painting, heavy in tones of blue-green and burnt orange, depicting a bar scene at night. The men wear top hats and many are bearded; the women are dressed in voluminous gowns and decorative hats. Five people converse in the center of the composition and a woman with a green face dominates the right foreground.',1,1786371200000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-111436','art-institute-chicago','art-institute-chicago','111436','the-basket-of-apples','The Basket of Apples','Paul Cezanne','c. 1893','Cezanne deliberately bends the table, bottle, basket, and plate into competing viewpoints. The unstable geometry makes the still life feel constructed rather than merely observed.','Oil on canvas','65 × 80 cm (25 7/16 × 31 1/2 in.); Framed: 88 × 104.2 × 9.6 cm (34 5/8 × 41 × 3 3/4 in.)','Helen Birch Bartlett Memorial Collection','https://www.artic.edu/artworks/111436','52ac8996-3460-cf71-cb42-5c4d0aa29b74','https://www.artic.edu/iiif/2/52ac8996-3460-cf71-cb42-5c4d0aa29b74/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/52ac8996-3460-cf71-cb42-5c4d0aa29b74/full/843,/0/default.jpg',12640,10094,'Painting of a basket of green and red-yellow apples spilling over into a white cloth placed on a wooden table, with a dark green bottle and a plate of pale biscuits behind.',1,1786367600000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-11723','art-institute-chicago','art-institute-chicago','11723','woman-at-her-toilette','Woman at Her Toilette','Berthe Morisot','1875–80','Morisot uses feathery silver, lavender, and rose strokes to suggest a woman and her reflection without fixing either in hard detail.','Oil on canvas','60.3 × 80.4 cm (23 3/4 × 31 5/8 in.); Framed: 85.8 × 105.5 × 10.5 cm (33 3/4 × 41 1/2 × 4 1/8 in.)','Stickney Fund','https://www.artic.edu/artworks/11723','78c80988-6524-cec7-c661-a4c0a706d06f','https://www.artic.edu/iiif/2/78c80988-6524-cec7-c661-a4c0a706d06f/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/78c80988-6524-cec7-c661-a4c0a706d06f/full/843,/0/default.jpg',4946,3703,'Painted portrait dominated by loose, large brushstrokes of a woman, seen from the back, wearing a gauzy white off-the-shoulder dress and black choker, blond hair swept up, examining herself in a mirror at left. The background is a feathered swirl suggesting floral pattern in cool pale tones of gray, purple, pink, and blue.',1,1786364000000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-111318','art-institute-chicago','art-institute-chicago','111318','stack-of-wheat','Stack of Wheat','Claude Monet','1890–91','One of Monet''s Giverny stack paintings, this winter view studies how snow, dusk, and reflected warmth transform a stable rural form.','Oil on canvas','65.8 × 92.3 cm (25 15/16 × 36 3/8 in.); Framed: 82.6 × 109.6 × 6.7 cm (32 1/2 × 43 1/8 × 2 5/8 in.)','Purchased with funds provided by the Searle Family Trust; Major Acquisitions Centennial Endowment; through prior acquisitions of the Mr. and Mrs. Martin A. Ryerson and Potter Palmer collections; through prior bequest of Jerome Friedman','https://www.artic.edu/artworks/111318','27c1d720-8ca5-79a4-5e51-530bf75c1591','https://www.artic.edu/iiif/2/27c1d720-8ca5-79a4-5e51-530bf75c1591/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/27c1d720-8ca5-79a4-5e51-530bf75c1591/full/843,/0/default.jpg',6700,4716,'A snowy landscape in cool tones featuring a prominent, snow-dusted haystack in reddish brown in front of a row of red-brown trees and low, blue mountains, all beheath a pink-gray strip of sky.',1,1786360400000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-94841','art-institute-chicago','art-institute-chicago','94841','the-song-of-the-lark','The Song of the Lark','Jules Breton','1884','A young field worker pauses at dawn, sickle in hand, as a lark rises beyond the frame. Breton joins close rural observation with luminous idealization.','Oil on canvas','110.6 × 85.8 cm (43 1/2 × 33 3/4 in.); Framed: 142.3 × 116.9 cm (56 × 46 in.)','Henry Field Memorial Collection','https://www.artic.edu/artworks/94841','48b2de88-ba73-8e19-f448-d1cef4a1c847','https://www.artic.edu/iiif/2/48b2de88-ba73-8e19-f448-d1cef4a1c847/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/48b2de88-ba73-8e19-f448-d1cef4a1c847/full/843,/0/default.jpg',4724,6127,'A work made of oil on canvas.',1,1786356800000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-81558','art-institute-chicago','art-institute-chicago','81558','acrobats-at-the-cirque-fernando','Acrobats at the Cirque Fernando (Francisca and Angelina Wartenberg)','Pierre-Auguste Renoir','1879','Renoir portrays Francisca and Angelina Wartenberg in circus costumes, holding oranges tossed by spectators. Studio staging and soft light blur portrait and performance.','Oil on canvas','131.2 × 99.2 cm (51 1/2 × 39 1/16 in.); Framed: 160.1 × 129 × 10.2 cm (63 × 50 3/4 × 4 in.)','Potter Palmer Collection','https://www.artic.edu/artworks/81558','321c45f5-22a3-84a2-44cc-cf66642d4cf2','https://www.artic.edu/iiif/2/321c45f5-22a3-84a2-44cc-cf66642d4cf2/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/321c45f5-22a3-84a2-44cc-cf66642d4cf2/full/843,/0/default.jpg',24170,32315,'Two girls in acrobatic uniforms stand in an arena, one holds oranges.',1,1786353200000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-25865','art-institute-chicago','art-institute-chicago','25865','the-herring-net','The Herring Net','Winslow Homer','1885','Two fishermen steady a small boat while hauling a heavy net through rough water. Homer''s compressed horizon and forceful diagonals bind labor to the sea''s power.','Oil on canvas','76.5 × 122.9 cm (30 1/8 × 48 3/8 in.)','Mr. and Mrs. Martin A. Ryerson Collection','https://www.artic.edu/artworks/25865','5dca7347-c6dc-24dd-d073-d705b9cdc575','https://www.artic.edu/iiif/2/5dca7347-c6dc-24dd-d073-d705b9cdc575/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/5dca7347-c6dc-24dd-d073-d705b9cdc575/full/843,/0/default.jpg',9953,6124,'Painting of two fishermen in small wooden boat on rocky seas.',1,1786349600000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-87479','art-institute-chicago','art-institute-chicago','87479','the-assumption-of-the-virgin','The Assumption of the Virgin','Domenico Theotokópoulos, called El Greco','1577–79','El Greco divides this immense altarpiece between astonished apostles and the Virgin''s ascending figure. Elongated forms, saturated color, and surging movement announce his mature Spanish style.','Oil on canvas','403.2 × 211.8 cm (158 3/4 × 83 7/16 in.); Framed: 461.6 × 256.5 × 14 cm (181 3/4 × 101 × 5 9/16 in.)','Gift of Nancy Atwood Sprague in memory of Albert Arnold Sprague','https://www.artic.edu/artworks/87479','47fd1564-93f5-f30b-7786-013421133b4a','https://www.artic.edu/iiif/2/47fd1564-93f5-f30b-7786-013421133b4a/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/47fd1564-93f5-f30b-7786-013421133b4a/full/843,/0/default.jpg',3990,7631,'Painting of the Virgin Mary ascending to heaven amongst multitude of angels.',1,1786346000000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-14586','art-institute-chicago','art-institute-chicago','14586','the-poets-garden','The Poet''s Garden','Vincent van Gogh','1888','Van Gogh transforms a public garden in Arles into a dense rhythm of grasses, trees, and yellow sky, imagining the setting as a poet''s retreat.','Oil on canvas','73 × 92.1 cm (28 3/4 × 36 1/4 in.); Framed: 96.6 × 116.9 cm (38 × 46 in.)','Mr. and Mrs. Lewis Larned Coburn Memorial Collection','https://www.artic.edu/artworks/14586','d4bc1723-7cbc-d36d-a9cb-f84553f2a6f6','https://www.artic.edu/iiif/2/d4bc1723-7cbc-d36d-a9cb-f84553f2a6f6/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/d4bc1723-7cbc-d36d-a9cb-f84553f2a6f6/full/843,/0/default.jpg',12637,9982,'Lush tall grasses with small white flowers foreground a grove of bushy trees of varying types and heights, their leaves ranging from deep green to golden. Beneath a dense and heavy yellow sky, a small blue triangle suggesting a mountain peak crests above the treeline at far left.',1,1786342400000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-44892','art-institute-chicago','art-institute-chicago','44892','fish-still-life','Fish (Still Life)','Édouard Manet','1864','Manet revisits Dutch still-life tradition with a direct, visibly worked surface. Silvery fish, open oysters, lemon, and cloth are joined by energetic brushwork.','Oil on canvas','73.5 × 92.4 cm (28 15/16 × 36 3/8 in.); Framed: 108.6 × 127 × 12.7 cm (42 3/4 × 50 × 5 in.)','Mr. and Mrs. Lewis Larned Coburn Memorial Collection','https://www.artic.edu/artworks/44892','0cbe27e8-2fec-3445-bc48-ce40a8f2dc25','https://www.artic.edu/iiif/2/0cbe27e8-2fec-3445-bc48-ce40a8f2dc25/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/0cbe27e8-2fec-3445-bc48-ce40a8f2dc25/full/843,/0/default.jpg',16704,13234,'Still-life painting, fish, open oysters, eel, lemon on tablecloth.',1,1786338800000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-56905','art-institute-chicago','art-institute-chicago','56905','nocturne-blue-and-gold','Nocturne: Blue and Gold—Southampton Water','James McNeill Whistler','1872','Whistler reduces Southampton Water to deep blue, faint ships, scattered lights, and a low moon. The musical title emphasizes atmosphere over narrative.','Oil on canvas','51 × 76.7 cm (20 1/16 × 30 3/16 in.)','Stickney Fund','https://www.artic.edu/artworks/56905','50034c7f-ce51-00f1-430e-a6f7efc233fc','https://www.artic.edu/iiif/2/50034c7f-ce51-00f1-430e-a6f7efc233fc/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/50034c7f-ce51-00f1-430e-a6f7efc233fc/full/843,/0/default.jpg',6442,4256,'A sparsely painted waterside scene in dark tones with minimal ghostly shapes suggesting ships, yellow glitches of paint for light reflections, and the orb of an orange moon overhead.',1,1786335200000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-90048','art-institute-chicago','art-institute-chicago','90048','distant-view-of-niagara-falls','Distant View of Niagara Falls','Thomas Cole','1830','A distant cascade breaks through an autumn valley, framed by two tiny figures on a cliff. Cole turns Niagara into an idealized emblem of the American landscape.','Oil on wood panel','47.9 × 60.6 cm (18 7/8 × 23 7/8 in.)','Friends of American Art Collection','https://www.artic.edu/artworks/90048','18092196-50ae-3ff1-9205-1b3110e966c3','https://www.artic.edu/iiif/2/18092196-50ae-3ff1-9205-1b3110e966c3/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/18092196-50ae-3ff1-9205-1b3110e966c3/full/843,/0/default.jpg',10490,8127,'Painting of a vast autumn scene with two very small figures in Indigenous clothing standing on a cliff overlooking a massive waterfall in the distance.',1,1786331600000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-72801','art-institute-chicago','art-institute-chicago','72801','icebound','Icebound','John Henry Twachtman','c. 1889','Twachtman reduces a Connecticut winter landscape to pale veils of snow, water, and muted trees. The nearly square composition favors tonal harmony over topographic detail.','Oil on canvas','64.2 × 76.6 cm (25 5/16 × 30 3/16 in.)','Friends of American Art Collection','https://www.artic.edu/artworks/72801','3ae75415-0551-ae17-c478-3b8687a6f246','https://www.artic.edu/iiif/2/3ae75415-0551-ae17-c478-3b8687a6f246/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/3ae75415-0551-ae17-c478-3b8687a6f246/full/843,/0/default.jpg',4707,3938,'Winter landscape painting with rocky stream lined by orange leafed trees.',1,1786328000000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-185905','art-institute-chicago','art-institute-chicago','185905','dragonfly-lamp','Lamp with Hanging Head Dragonfly Shade and Mosaic and Turtleback Base','Clara Driscoll','By 1906','Clara Driscoll''s dragonfly design wraps luminous Favrile glass around a bronze structure. The lamp is a defining achievement of Tiffany Studios and American Art Nouveau.','Favrile glass and bronze','86.4 × 57.2 cm (34 × 22 1/2 in.)','Roger and J. Peter McCormick Endowments, Robert Allerton Purchase Fund, Goodman Endowment for the Collection of the Friends of American Art, Pauline S. Armstrong Endowment, Edward E. Ayer Endowment in memory of Charles L. Hutchinson; purchased with funds provided by the Antiquarian Society in memory of Helen Richman Gilbert and Lena Turnbull Gilbert, Sandra van den Broek, Mr. and Mrs. Henry M. Buchbinder, Quinn E. Delaney, Mr. and Mrs. Wesley M. Dixon, Jamee J. and Marshall Field, Celia and David Hilliard, Elizabeth Souder Louis, Mrs. Herbert A. Vance, and Mr. and Mrs. Morris S. Weeden','https://www.artic.edu/artworks/185905','1f36143a-1591-b2a0-f757-20f92438ee5a','https://www.artic.edu/iiif/2/1f36143a-1591-b2a0-f757-20f92438ee5a/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/1f36143a-1591-b2a0-f757-20f92438ee5a/full/843,/0/default.jpg',3043,4000,'Lamp with stained glass shade featuring dragonflies and shades of green, purple, brown.',1,1786324400000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-151358','art-institute-chicago','art-institute-chicago','151358','male-figure-nkisi-nkondi','Male Figure (Nkisi Nkondi)','Vili','Probably early to mid-19th century','Made by a Vili artist, this power figure joins carved form with metal, glass, fiber, shells, and spiritually charged materials. Inserted blades and nails record appeals, agreements, and acts of activation.','Wood, metal, glass, fabric, fiber, cowrie shells, bone, leather, gourd, and feathers','73.7 × 33.1 × 28 cm (29 × 13 × 11 in.)','Ada Turnbull Hertle Endowment','https://www.artic.edu/artworks/151358','c3f36398-eee0-77a9-17f4-204f3252f6f9','https://www.artic.edu/iiif/2/c3f36398-eee0-77a9-17f4-204f3252f6f9/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/c3f36398-eee0-77a9-17f4-204f3252f6f9/full/843,/0/default.jpg',3476,6179,'A wooden carving of a male figure. The figure has a distinctive face, with oval-shaped eyes and mouth, and wears a cap on his head. His body is covered in various shells, bones, feathers, fabric, and metal nails, and he holds a mirror-sealed resin packet over his stomach.',1,1786320800000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork VALUES('aic-210511','art-institute-chicago','art-institute-chicago','210511','monumental-portrait-of-a-monkey','A Monumental Portrait of a Monkey','Unknown artist','c. 1705–1710','Rendered in opaque watercolor and gold, the alert monkey fills the page with a scale and presence usually reserved for courtly portraiture.','Opaque watercolor and gold on paper','Outermost border: 48.5 × 58.7 cm (19 × 23 in.); Image: 45 × 56 cm (17 3/4 × 22 in.)','Lacy Armour Fund, James and Marilynn Alsdorf Acquisition Fund','https://www.artic.edu/artworks/210511','4c44ca9b-ed2f-154a-2d2e-c3f25ff9e7a2','https://www.artic.edu/iiif/2/4c44ca9b-ed2f-154a-2d2e-c3f25ff9e7a2/full/1686,/0/default.jpg','https://www.artic.edu/iiif/2/4c44ca9b-ed2f-154a-2d2e-c3f25ff9e7a2/full/843,/0/default.jpg',10145,8319,'A work made of opaque watercolor and gold on paper.',1,1786317200000,1786403182366,1786403182366);
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-27992','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-20684','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-16568','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-28560','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-24645','category-print');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-14655','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-111442','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-80607','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-61128','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-111436','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-11723','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-111318','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-94841','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-81558','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-25865','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-87479','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-14586','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-44892','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-56905','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-90048','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-72801','category-painting');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-185905','category-decorative-arts');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-151358','category-sculpture');
--> statement-breakpoint
INSERT INTO artwork_category VALUES('aic-210511','category-works-on-paper');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-27992','style-pointillism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-27992','style-post-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-27992','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-20684','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-20684','style-realism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-16568','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-28560','style-post-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-24645','style-japanese-ukiyo-e');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-14655','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-111442','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-111442','style-modernism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-80607','style-post-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-80607','style-pointillism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-61128','style-post-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-111436','style-post-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-11723','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-111318','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-94841','style-realism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-81558','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-25865','style-realism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-25865','style-modernism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-87479','style-mannerism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-87479','style-renaissance');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-14586','style-post-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-44892','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-44892','style-realism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-56905','style-modernism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-56905','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-90048','style-romanticism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-90048','style-hudson-river-school');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-72801','style-impressionism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-185905','style-art-nouveau');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-185905','style-arts-and-crafts');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-185905','style-modernism');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-151358','style-african-art');
--> statement-breakpoint
INSERT INTO artwork_style VALUES('aic-210511','style-south-asian');
