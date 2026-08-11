ALTER TABLE `artwork` ADD `image_source_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `artwork` ADD `thumbnail_source_version` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `artwork` ADD `image_fingerprint` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `artwork` ADD `thumbnail_fingerprint` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `artwork`
SET
  `image_source_version` = 'seed-2026-08-10-v1',
  `thumbnail_source_version` = 'seed-2026-08-10-v1',
  `image_fingerprint` = CASE `id`
    WHEN 'moma-starry-night' THEN 'f12990b1a730cd1063ef7ba7e35e7b07af0a99739e76f92e0a9d0e5c6a1aea92'
    WHEN 'louvre-mona-lisa' THEN '94f7a9a66a94b8d9c43be29633ca16c3607b60a36f22583e6d3f1f8a191a70c1'
    WHEN 'mauritshuis-girl-pearl-earring' THEN '5740303968e1779adaebce778926661a56fcc1aedd543d598d64dbf58086ec71'
    WHEN 'met-great-wave' THEN 'ee47206d1366f754aea23facf0511d326c2b10c69d4e493599522693a6eda08a'
    WHEN 'aic-water-lilies' THEN '11b57c1347dd5bf54f7ce4a15990525fab4502d377f683c32792fa455adb7d49'
    WHEN 'aic-grande-jatte' THEN '76181e21e575e61a394741c575795953cd06aa57259edee7223b9c9fe56aa311'
    WHEN 'belvedere-the-kiss' THEN '8ad2375d956dd3c94f9d576fcca837aaa18becf29d7dfc05e8bb760f083b6ead'
    WHEN 'uffizi-birth-venus' THEN 'd883b6257cd2a825d4bd9c143b14ecebe17b4ec6fe99e9a54000a1208e2eb682'
    WHEN 'rijksmuseum-night-watch' THEN '32e9303897c624a93c1bf0dacff0959cce42df82f65a5424d82a20d903adefa2'
    WHEN 'rijksmuseum-milkmaid' THEN '7de2d9a44805f511a1eb8d111a4855ac0ec8a19c017131858fcd95b971300e43'
    WHEN 'prado-las-meninas' THEN '9f40c1ef3b5b780f72e2fc7fa32419c3c6785059854bd04ab9333d84e0aadff1'
    WHEN 'prado-third-may' THEN '0ddfdb4280c095fd789867a4054fcf177b925ef6d28271169a56e1f2c2916628'
    WHEN 'hamburg-wanderer' THEN '5e80001826fe382817d12c7a20ac019220859dc4badd2e11f9af08e4092a1810'
    WHEN 'louvre-liberty' THEN 'c12d15f7091a1fabc5126976b112ee4ad0cf9d6837f561ad1cf59ab10578a8ac'
    WHEN 'orsay-whistlers-mother' THEN '749713e58f18f1aa319a29bca882055d2c1891a53b0aa365dd6152f5a03eb661'
    WHEN 'orsay-olympia' THEN '6b0bc74daabf7dd350d0511980d62b8704014dcc84e0977c26a5087683abef5f'
    WHEN 'orsay-moulin-galette' THEN '20301817756ddc6528b6351d6f138f3d6255d837227fb0a0cd5a8df9ecf3725e'
    WHEN 'orsay-gleaners' THEN '2bac81a46a554211f1537e25823ee6ebe4125b49e28fd8722dbad7d90f7b7d83'
    WHEN 'national-gallery-arnolfini' THEN '01826989d4ffc6335f2638efea0b2ce5edbb2989c431b1c22935de5d894c0f0c'
    WHEN 'national-gallery-temeraire' THEN '2834a428c96b079f9153cbc529e44c793ac93bc16cdf692d99ed2bef58c52fd6'
    WHEN 'national-gallery-hay-wain' THEN '968bcb2bf8a5b89fac17a8f8fd00842a6bf7ad658273fe09e8304f040f186e17'
    WHEN 'marmottan-impression-sunrise' THEN '96c7d9c7a5448d68c5cda660f6ab7c7ab848f98e5129c0f1ec2f03f2fe6cd838'
    WHEN 'wallace-the-swing' THEN 'f81aea4b1358b6dce05efb3655d0748c71a348b669906589f765085ff6d30736'
    WHEN 'vatican-school-athens' THEN 'df640bd87b12ec844c1f44d83af9c2402549a7ef251e1d19bbe5d74f3b710ca0'
    ELSE `image_fingerprint`
  END,
  `thumbnail_fingerprint` = CASE `id`
    WHEN 'moma-starry-night' THEN '39c729ac423db74f12005e239b8340c0b9b8a6da3f879c000b83c1ed9a23ca05'
    WHEN 'louvre-mona-lisa' THEN 'aebc44653e500074ac753d61f4301532627ce2a38c445675cdeb3ae7acaa5372'
    WHEN 'mauritshuis-girl-pearl-earring' THEN '9b2bbb73803e823a2536c2d13ccbc897a653f43bb06c75578a1aad2584e4959f'
    WHEN 'met-great-wave' THEN '87c3d2fb744d09bcca5d99de15ff5b87e72633bbdfb517715f2143e067cb2412'
    WHEN 'aic-water-lilies' THEN 'c12bb65c01587f38ce03a21942e6f3526a68f62b686c883b218f3eccc2933819'
    WHEN 'aic-grande-jatte' THEN '724b0dba0d55f4d88213e1bce5cd378fe873fbeaea0788655ed491105be64d1e'
    WHEN 'belvedere-the-kiss' THEN 'dd259df6130fc454eacb2e1a9d931c301ecc8c789bb7eb81abdf54aff1d422c1'
    WHEN 'uffizi-birth-venus' THEN '00f33992e9d43f3075dcff97f479c546fad8ff6f3734b2d1da33542a8a239b01'
    WHEN 'rijksmuseum-night-watch' THEN '2427a2576f9bb93fde141177a57132d465cc2c800e04068d2e09f2b5a70ede80'
    WHEN 'rijksmuseum-milkmaid' THEN '91b7da14a3409dbaf0fde250b2430352c441e108d1915c68b2a3d23acb0f45ba'
    WHEN 'prado-las-meninas' THEN 'bfcf2f76d42b37eb355bff06b2957c85b0536d4a500aa7e48fb5cc217331131b'
    WHEN 'prado-third-may' THEN 'd01e15cbe636800750afebea85480593d83b30e2051fa31c8ad613d86473263f'
    WHEN 'hamburg-wanderer' THEN '8fb3c0dbc4cceff679a31dd83a961c1ca1111b45bf743971b2a01fde4ef48f01'
    WHEN 'louvre-liberty' THEN '001c2d4dce04b22de3c91d08adb580da9f2565d047f5807e20e8b8e9c382412d'
    WHEN 'orsay-whistlers-mother' THEN '43f73ebeeb8d4b2c58f219d50bc4aad3823dee2c32f04c2d1c009f15c45bf986'
    WHEN 'orsay-olympia' THEN '1964f409284da0195223dc23e2783b9d94c2b4587baac7368fe4f8f1d4a88ebc'
    WHEN 'orsay-moulin-galette' THEN '716f690edb85b7d07372c3056549890bb5916226290d13a4b3f5fc24fd867843'
    WHEN 'orsay-gleaners' THEN '5358ec55b3ce7e7aca81acb82caf9e2b79e1828d8b732a733deecedf6efe55b1'
    WHEN 'national-gallery-arnolfini' THEN '50e5c569b8b64e6b053b1811e37722ac9388ec25381e388613bd94a63acae707'
    WHEN 'national-gallery-temeraire' THEN 'e039ec7621eec53f649d48765e5fb10f591eb72d743b16da940c533fcb58505b'
    WHEN 'national-gallery-hay-wain' THEN '62e0bcea3c7c34ab3fdf8ceea74501795f20f0325cd212a6af3b67111d0900f3'
    WHEN 'marmottan-impression-sunrise' THEN 'a1d16d73484223a023c43a2516751594401dd290978a371130a6fafaac5203cf'
    WHEN 'wallace-the-swing' THEN 'bb2e1eb369350f212cce84caa79394baeb8383bb8375cef7ebe8435d1e7a57eb'
    WHEN 'vatican-school-athens' THEN '3ba28eb53c865051c078cd946b0f358a57b6d7b0c84f84f7eb7712fb5456274e'
    ELSE `thumbnail_fingerprint`
  END;
--> statement-breakpoint
UPDATE `artwork`
SET
  `image_r2_key` = 'artworks/v2/' || `id` || '/' || `image_fingerprint` || '/full.jpg',
  `thumbnail_r2_key` = 'artworks/v2/' || `id` || '/' || `thumbnail_fingerprint` || '/thumbnail.jpg'
WHERE `image_fingerprint` <> '' AND `thumbnail_fingerprint` <> '';
