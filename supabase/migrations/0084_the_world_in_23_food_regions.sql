-- THE WORLD, IN 23 FOOD REGIONS.
--
-- The country catalogue for the fil rouge (`0083`), which is the only list in
-- it long enough to need rotating. Data and engine are separate migrations on
-- purpose: this list will be argued about for years, and revising it must
-- never mean touching the draw.
--
-- THE SOURCE. The grouping is not geographic and that is the whole point of
-- choosing it: countries are grouped by what they actually COOK WITH — the
-- staple a cuisine is built on — which is the only classification that makes a
-- dinner theme mean anything. A continent tells you nothing about a plate.
-- Taken from objectivelists.com/the-23-food-regions-of-the-world, which sorts
-- 176 countries into 7 macro-groups and 23 micro-groups.
--
-- HYBRIDS RESOLVED TO THE FIRST CODE. The source marks many countries with a
-- second, derived region — the United States as 1-C/1-A, Israel as 1-C/2-B —
-- for cuisines carrying a colonial or diaspora inheritance. Each country is
-- filed here under its FIRST code only, and the second is kept as a comment.
-- Not a simplification for tidiness: a country in two groups would be in two
-- bags, and would come out of the draw twice while another never arrived. One
-- country, one group, one place in the queue.
--
-- TWO DUPLICATES DROPPED. The source lists Slovenia in both 1-B and 1-B/1-C,
-- and Albania in both 2-B and 2-B/1-B. Each is filed once, under the first.
--
-- EIGHTEEN COUNTRIES ADDED, AND MARKED. The source covers 176; there are 193
-- UN members. The missing ones are grouped below by the same staple logic, in
-- their own block so they can be moved or removed without hunting: they are
-- the one part of this file that is NOT from the source. Germany is the
-- conspicuous absence and is filed with its neighbours in 1-C.

insert into fil_rouge_catalogue (category, code, group_code, macro_code) values
  ('COUNTRY', 'FRANCE', '1-A', '1'),
  ('COUNTRY', 'ITALY', '1-A', '1'),
  ('COUNTRY', 'PORTUGAL', '1-A', '1'),
  ('COUNTRY', 'SPAIN', '1-A', '1'),
  ('COUNTRY', 'GREECE', '1-A', '1'),
  ('COUNTRY', 'CYPRUS', '1-A', '1'),
  ('COUNTRY', 'MALTA', '1-A', '1'),
  ('COUNTRY', 'ARMENIA', '1-B', '1'),
  ('COUNTRY', 'BOSNIA', '1-B', '1'),
  ('COUNTRY', 'BULGARIA', '1-B', '1'),
  ('COUNTRY', 'GEORGIA', '1-B', '1'),
  ('COUNTRY', 'NORTH_MACEDONIA', '1-B', '1'),
  ('COUNTRY', 'MONTENEGRO', '1-B', '1'),
  ('COUNTRY', 'ROMANIA', '1-B', '1'),
  ('COUNTRY', 'SERBIA', '1-B', '1'),
  ('COUNTRY', 'SLOVENIA', '1-B', '1'),
  ('COUNTRY', 'RUSSIA', '1-B', '1'),
  ('COUNTRY', 'UKRAINE', '1-B', '1'),
  ('COUNTRY', 'BELARUS', '1-B', '1'),  -- also 1-C
  ('COUNTRY', 'CROATIA', '1-B', '1'),  -- also 1-C
  ('COUNTRY', 'HUNGARY', '1-C', '1'),  -- also 1-B
  ('COUNTRY', 'AUSTRIA', '1-C', '1'),
  ('COUNTRY', 'BELGIUM', '1-C', '1'),
  ('COUNTRY', 'CZECHIA', '1-C', '1'),
  ('COUNTRY', 'DENMARK', '1-C', '1'),
  ('COUNTRY', 'ESTONIA', '1-C', '1'),
  ('COUNTRY', 'FINLAND', '1-C', '1'),
  ('COUNTRY', 'ICELAND', '1-C', '1'),
  ('COUNTRY', 'IRELAND', '1-C', '1'),
  ('COUNTRY', 'LATVIA', '1-C', '1'),
  ('COUNTRY', 'LITHUANIA', '1-C', '1'),
  ('COUNTRY', 'NETHERLANDS', '1-C', '1'),
  ('COUNTRY', 'NORWAY', '1-C', '1'),
  ('COUNTRY', 'POLAND', '1-C', '1'),
  ('COUNTRY', 'SLOVAKIA', '1-C', '1'),
  ('COUNTRY', 'SWEDEN', '1-C', '1'),
  ('COUNTRY', 'UNITED_KINGDOM', '1-C', '1'),
  ('COUNTRY', 'UNITED_STATES', '1-C', '1'),  -- also 1-A
  ('COUNTRY', 'CANADA', '1-C', '1'),  -- also 1-A
  ('COUNTRY', 'NEW_ZEALAND', '1-C', '1'),  -- also 1-A
  ('COUNTRY', 'AUSTRALIA', '1-C', '1'),  -- also 1-A
  ('COUNTRY', 'CHILE', '1-C', '1'),  -- also 1-A
  ('COUNTRY', 'SWITZERLAND', '1-C', '1'),  -- also 1-A
  ('COUNTRY', 'LUXEMBOURG', '1-C', '1'),  -- also 1-A
  ('COUNTRY', 'ARGENTINA', '1-C', '1'),  -- also 6-B
  ('COUNTRY', 'URUGUAY', '1-C', '1'),  -- also 6-B
  ('COUNTRY', 'ISRAEL', '1-C', '1'),  -- also 2-B
  ('COUNTRY', 'SAUDI_ARABIA', '2-A', '2'),
  ('COUNTRY', 'OMAN', '2-A', '2'),
  ('COUNTRY', 'UNITED_ARAB_EMIRATES', '2-A', '2'),
  ('COUNTRY', 'QATAR', '2-A', '2'),
  ('COUNTRY', 'KUWAIT', '2-A', '2'),
  ('COUNTRY', 'BAHRAIN', '2-A', '2'),
  ('COUNTRY', 'EGYPT', '2-A', '2'),  -- also 2-B
  ('COUNTRY', 'PAKISTAN', '2-A', '2'),  -- also 2-B
  ('COUNTRY', 'YEMEN', '2-A', '2'),  -- also 2-B
  ('COUNTRY', 'ALGERIA', '2-B', '2'),
  ('COUNTRY', 'MOROCCO', '2-B', '2'),
  ('COUNTRY', 'TUNISIA', '2-B', '2'),
  ('COUNTRY', 'TURKEY', '2-B', '2'),
  ('COUNTRY', 'ALBANIA', '2-B', '2'),
  ('COUNTRY', 'JORDAN', '2-B', '2'),
  ('COUNTRY', 'LEBANON', '2-B', '2'),
  ('COUNTRY', 'SYRIA', '2-B', '2'),
  ('COUNTRY', 'IRAQ', '2-B', '2'),
  ('COUNTRY', 'IRAN', '2-B', '2'),
  ('COUNTRY', 'LIBYA', '2-B', '2'),
  ('COUNTRY', 'AZERBAIJAN', '2-B', '2'),  -- also 1-B
  ('COUNTRY', 'AFGHANISTAN', '2-C', '2'),
  ('COUNTRY', 'KYRGYZSTAN', '2-C', '2'),
  ('COUNTRY', 'MONGOLIA', '2-C', '2'),
  ('COUNTRY', 'TAJIKISTAN', '2-C', '2'),
  ('COUNTRY', 'TURKMENISTAN', '2-C', '2'),
  ('COUNTRY', 'UZBEKISTAN', '2-C', '2'),
  ('COUNTRY', 'KAZAKHSTAN', '2-C', '2'),  -- also 1-B
  ('COUNTRY', 'MAURITANIA', '2-A', '2'),  -- also 5-B
  ('COUNTRY', 'DJIBOUTI', '2-A', '2'),  -- also 5-B
  ('COUNTRY', 'MALDIVES', '2-A', '2'),  -- also 3-A
  ('COUNTRY', 'CHINA', '3-A', '3'),
  ('COUNTRY', 'JAPAN', '3-A', '3'),
  ('COUNTRY', 'NORTH_KOREA', '3-A', '3'),
  ('COUNTRY', 'SOUTH_KOREA', '3-A', '3'),
  ('COUNTRY', 'TAIWAN', '3-A', '3'),
  ('COUNTRY', 'MALAYSIA', '3-A', '3'),  -- also 3-B
  ('COUNTRY', 'PHILIPPINES', '3-B', '3'),
  ('COUNTRY', 'INDONESIA', '3-B', '3'),
  ('COUNTRY', 'THAILAND', '3-C', '3'),  -- also 3-B
  ('COUNTRY', 'VIETNAM', '3-C', '3'),  -- also 3-B
  ('COUNTRY', 'CAMBODIA', '3-C', '3'),
  ('COUNTRY', 'MYANMAR', '3-C', '3'),
  ('COUNTRY', 'LAOS', '3-C', '3'),
  ('COUNTRY', 'SRI_LANKA', '3-C', '3'),  -- also 3-D
  ('COUNTRY', 'INDIA', '3-D', '3'),
  ('COUNTRY', 'BANGLADESH', '3-D', '3'),
  ('COUNTRY', 'NEPAL', '3-D', '3'),
  ('COUNTRY', 'BHUTAN', '3-D', '3'),
  ('COUNTRY', 'EAST_TIMOR', '3-A', '3'),  -- also 4-E
  ('COUNTRY', 'GUYANA', '3-B', '3'),  -- also 6-C
  ('COUNTRY', 'SURINAME', '3-B', '3'),  -- also 6-C
  ('COUNTRY', 'DOMINICAN_REPUBLIC', '3-B', '3'),  -- also 6-B
  ('COUNTRY', 'ZAMBIA', '4-A', '4'),
  ('COUNTRY', 'ZIMBABWE', '4-A', '4'),
  ('COUNTRY', 'UGANDA', '4-B', '4'),
  ('COUNTRY', 'KENYA', '4-B', '4'),
  ('COUNTRY', 'BURUNDI', '4-B', '4'),
  ('COUNTRY', 'MALAWI', '4-B', '4'),
  ('COUNTRY', 'TANZANIA', '4-B', '4'),
  ('COUNTRY', 'RWANDA', '4-B', '4'),
  ('COUNTRY', 'REP_OF_CONGO', '4-C', '4'),
  ('COUNTRY', 'MOZAMBIQUE', '4-C', '4'),
  ('COUNTRY', 'DEM_REP_OF_CONGO', '4-C', '4'),
  ('COUNTRY', 'ANGOLA', '4-C', '4'),
  ('COUNTRY', 'CENTRAL_AFRICAN_REP', '4-D', '4'),
  ('COUNTRY', 'CAMEROON', '4-D', '4'),
  ('COUNTRY', 'NIGERIA', '4-D', '4'),
  ('COUNTRY', 'TOGO', '4-D', '4'),
  ('COUNTRY', 'BENIN', '4-D', '4'),
  ('COUNTRY', 'GHANA', '4-D', '4'),
  ('COUNTRY', 'IVORY_COAST', '4-D', '4'),
  ('COUNTRY', 'GUINEA', '4-E', '4'),  -- also 4-D
  ('COUNTRY', 'GUINEA_BISSAU', '4-E', '4'),
  ('COUNTRY', 'SIERRA_LEONE', '4-E', '4'),
  ('COUNTRY', 'LIBERIA', '4-E', '4'),
  ('COUNTRY', 'MADAGASCAR', '4-E', '4'),
  ('COUNTRY', 'CHAD', '5-A', '5'),
  ('COUNTRY', 'SOUTH_SUDAN', '5-A', '5'),
  ('COUNTRY', 'SENEGAL', '5-B', '5'),
  ('COUNTRY', 'MALI', '5-B', '5'),
  ('COUNTRY', 'NIGER', '5-B', '5'),
  ('COUNTRY', 'BURKINA_FASO', '5-B', '5'),
  ('COUNTRY', 'SUDAN', '5-B', '5'),
  ('COUNTRY', 'ETHIOPIA', '5-C', '5'),
  ('COUNTRY', 'GAMBIA', '5-B', '5'),  -- also 4-E
  ('COUNTRY', 'SOUTH_AFRICA', '6-A', '6'),
  ('COUNTRY', 'NAMIBIA', '6-A', '6'),
  ('COUNTRY', 'BOTSWANA', '6-A', '6'),
  ('COUNTRY', 'ESWATINI', '6-A', '6'),
  ('COUNTRY', 'LESOTHO', '6-A', '6'),
  ('COUNTRY', 'BRAZIL', '6-B', '6'),
  ('COUNTRY', 'MEXICO', '6-B', '6'),
  ('COUNTRY', 'COLOMBIA', '6-B', '6'),
  ('COUNTRY', 'VENEZUELA', '6-B', '6'),
  ('COUNTRY', 'PERU', '6-B', '6'),
  ('COUNTRY', 'BOLIVIA', '6-B', '6'),
  ('COUNTRY', 'GUATEMALA', '6-B', '6'),
  ('COUNTRY', 'ECUADOR', '6-B', '6'),
  ('COUNTRY', 'HONDURAS', '6-B', '6'),
  ('COUNTRY', 'EL_SALVADOR', '6-B', '6'),
  ('COUNTRY', 'NICARAGUA', '6-B', '6'),
  ('COUNTRY', 'COSTA_RICA', '6-B', '6'),
  ('COUNTRY', 'PANAMA', '6-B', '6'),
  ('COUNTRY', 'CAPE_VERDE', '6-B', '6'),
  ('COUNTRY', 'BELIZE', '6-B', '6'),  -- also 6-C
  ('COUNTRY', 'JAMAICA', '6-C', '6'),
  ('COUNTRY', 'TRINIDAD_AND_TOBAGO', '6-C', '6'),
  ('COUNTRY', 'BAHAMAS', '6-C', '6'),
  ('COUNTRY', 'BARBADOS', '6-C', '6'),
  ('COUNTRY', 'ST_LUCIA', '6-C', '6'),
  ('COUNTRY', 'ANTIGUA_AND_BARBUDA', '6-C', '6'),
  ('COUNTRY', 'ST_VINCENT', '6-C', '6'),
  ('COUNTRY', 'GRENADA', '6-C', '6'),
  ('COUNTRY', 'SEYCHELLES', '6-C', '6'),
  ('COUNTRY', 'CUBA', '6-B', '6'),  -- also 3-B
  ('COUNTRY', 'HAITI', '6-B', '6'),  -- also 4-E
  ('COUNTRY', 'PARAGUAY', '6-B', '6'),  -- also 4-A
  ('COUNTRY', 'FIJI', '6-C', '6'),  -- also 3-B
  ('COUNTRY', 'MAURITIUS', '6-C', '6'),  -- also 2-A
  ('COUNTRY', 'SOLOMON_ISLANDS', '7-A', '7'),
  ('COUNTRY', 'SAMOA', '7-A', '7'),
  ('COUNTRY', 'KIRIBATI', '7-A', '7'),
  ('COUNTRY', 'VANUATU', '7-A', '7'),
  ('COUNTRY', 'MICRONESIA', '7-A', '7'),
  ('COUNTRY', 'COMOROS', '7-A', '7'),
  ('COUNTRY', 'PAPUA_NEW_GUINEA', '7-A', '7'),  -- also 7-B
  ('COUNTRY', 'GABON', '7-B', '7'),
  ('COUNTRY', 'SAO_TOME_AND_PRINCIPE', '7-B', '7')

on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Not in the source. Placed by the same staple logic, and separable.
-- ---------------------------------------------------------------------------

insert into fil_rouge_catalogue (category, code, group_code, macro_code) values
  ('COUNTRY', 'GERMANY', '1-C', '1'),
  ('COUNTRY', 'MOLDOVA', '1-B', '1'),
  ('COUNTRY', 'ANDORRA', '1-A', '1'),
  ('COUNTRY', 'MONACO', '1-A', '1'),
  ('COUNTRY', 'SAN_MARINO', '1-A', '1'),
  ('COUNTRY', 'LIECHTENSTEIN', '1-C', '1'),
  ('COUNTRY', 'BRUNEI', '3-B', '3'),
  ('COUNTRY', 'SINGAPORE', '3-B', '3'),
  ('COUNTRY', 'DOMINICA', '6-C', '6'),
  ('COUNTRY', 'ST_KITTS_AND_NEVIS', '6-C', '6'),
  ('COUNTRY', 'EQUATORIAL_GUINEA', '7-B', '7'),
  ('COUNTRY', 'ERITREA', '5-C', '5'),
  ('COUNTRY', 'SOMALIA', '5-B', '5'),
  ('COUNTRY', 'MARSHALL_ISLANDS', '7-A', '7'),
  ('COUNTRY', 'NAURU', '7-A', '7'),
  ('COUNTRY', 'PALAU', '7-A', '7'),
  ('COUNTRY', 'TONGA', '7-A', '7'),
  ('COUNTRY', 'TUVALU', '7-A', '7')
on conflict do nothing;
