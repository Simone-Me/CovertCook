-- THE WORLD, IN 23 FOOD REGIONS.
--
-- The country catalogue for the fil rouge (`0083`), which is the only list in
-- it long enough to need rotating. Data and engine are separate migrations on
-- purpose: this list will be argued about for years, and revising it must
-- never mean touching the draw.
--
-- THE SOURCE. The grouping is not geographic, and that is why it was chosen:
-- countries are grouped by what they actually COOK WITH — the staple a cuisine
-- is built on — which is the only classification that makes a dinner theme
-- mean anything. A continent tells you nothing about a plate. Taken from
-- objectivelists.com/the-23-food-regions-of-the-world, which sorts 176
-- countries into 7 macro-groups and 23 micro-groups.
--
-- THE CODE IS ISO 3166-1 ALPHA-2, and that is a deliberate choice over a
-- readable slug. The browser can turn 'JP' into "Japan" or "Japon" by itself
-- (`Intl.DisplayNames`), so 194 countries in two languages cost ZERO
-- translation strings and are spelled the way each language actually spells
-- them — including the accents a hand-written list gets wrong. Every locale
-- added later comes free. The group names, which no standard knows, are the
-- only country strings the app has to carry.
--
-- HYBRIDS RESOLVED TO THE FIRST CODE. The source marks many countries with a
-- second, derived region — the United States as 1-C/1-A, Israel as 1-C/2-B —
-- for cuisines carrying a colonial or diaspora inheritance. Each country is
-- filed under its FIRST code only, and the second is kept as a comment. Not
-- tidiness: a country in two groups would sit in two bags and be drawn twice
-- while another never arrived.
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
  ('COUNTRY', 'FR', '1-A', '1'),  -- France
  ('COUNTRY', 'IT', '1-A', '1'),  -- Italy
  ('COUNTRY', 'PT', '1-A', '1'),  -- Portugal
  ('COUNTRY', 'ES', '1-A', '1'),  -- Spain
  ('COUNTRY', 'GR', '1-A', '1'),  -- Greece
  ('COUNTRY', 'CY', '1-A', '1'),  -- Cyprus
  ('COUNTRY', 'MT', '1-A', '1'),  -- Malta
  ('COUNTRY', 'AM', '1-B', '1'),  -- Armenia
  ('COUNTRY', 'BA', '1-B', '1'),  -- Bosnia
  ('COUNTRY', 'BG', '1-B', '1'),  -- Bulgaria
  ('COUNTRY', 'GE', '1-B', '1'),  -- Georgia
  ('COUNTRY', 'MK', '1-B', '1'),  -- North Macedonia
  ('COUNTRY', 'ME', '1-B', '1'),  -- Montenegro
  ('COUNTRY', 'RO', '1-B', '1'),  -- Romania
  ('COUNTRY', 'RS', '1-B', '1'),  -- Serbia
  ('COUNTRY', 'SI', '1-B', '1'),  -- Slovenia
  ('COUNTRY', 'RU', '1-B', '1'),  -- Russia
  ('COUNTRY', 'UA', '1-B', '1'),  -- Ukraine
  ('COUNTRY', 'BY', '1-B', '1'),  -- Belarus, also 1-C
  ('COUNTRY', 'HR', '1-B', '1'),  -- Croatia, also 1-C
  ('COUNTRY', 'HU', '1-C', '1'),  -- Hungary, also 1-B
  ('COUNTRY', 'AT', '1-C', '1'),  -- Austria
  ('COUNTRY', 'BE', '1-C', '1'),  -- Belgium
  ('COUNTRY', 'CZ', '1-C', '1'),  -- Czechia
  ('COUNTRY', 'DK', '1-C', '1'),  -- Denmark
  ('COUNTRY', 'EE', '1-C', '1'),  -- Estonia
  ('COUNTRY', 'FI', '1-C', '1'),  -- Finland
  ('COUNTRY', 'IS', '1-C', '1'),  -- Iceland
  ('COUNTRY', 'IE', '1-C', '1'),  -- Ireland
  ('COUNTRY', 'LV', '1-C', '1'),  -- Latvia
  ('COUNTRY', 'LT', '1-C', '1'),  -- Lithuania
  ('COUNTRY', 'NL', '1-C', '1'),  -- Netherlands
  ('COUNTRY', 'NO', '1-C', '1'),  -- Norway
  ('COUNTRY', 'PL', '1-C', '1'),  -- Poland
  ('COUNTRY', 'SK', '1-C', '1'),  -- Slovakia
  ('COUNTRY', 'SE', '1-C', '1'),  -- Sweden
  ('COUNTRY', 'GB', '1-C', '1'),  -- United Kingdom
  ('COUNTRY', 'US', '1-C', '1'),  -- United States, also 1-A
  ('COUNTRY', 'CA', '1-C', '1'),  -- Canada, also 1-A
  ('COUNTRY', 'NZ', '1-C', '1'),  -- New Zealand, also 1-A
  ('COUNTRY', 'AU', '1-C', '1'),  -- Australia, also 1-A
  ('COUNTRY', 'CL', '1-C', '1'),  -- Chile, also 1-A
  ('COUNTRY', 'CH', '1-C', '1'),  -- Switzerland, also 1-A
  ('COUNTRY', 'LU', '1-C', '1'),  -- Luxembourg, also 1-A
  ('COUNTRY', 'AR', '1-C', '1'),  -- Argentina, also 6-B
  ('COUNTRY', 'UY', '1-C', '1'),  -- Uruguay, also 6-B
  ('COUNTRY', 'IL', '1-C', '1'),  -- Israel, also 2-B
  ('COUNTRY', 'SA', '2-A', '2'),  -- Saudi Arabia
  ('COUNTRY', 'OM', '2-A', '2'),  -- Oman
  ('COUNTRY', 'AE', '2-A', '2'),  -- United Arab Emirates
  ('COUNTRY', 'QA', '2-A', '2'),  -- Qatar
  ('COUNTRY', 'KW', '2-A', '2'),  -- Kuwait
  ('COUNTRY', 'BH', '2-A', '2'),  -- Bahrain
  ('COUNTRY', 'EG', '2-A', '2'),  -- Egypt, also 2-B
  ('COUNTRY', 'PK', '2-A', '2'),  -- Pakistan, also 2-B
  ('COUNTRY', 'YE', '2-A', '2'),  -- Yemen, also 2-B
  ('COUNTRY', 'DZ', '2-B', '2'),  -- Algeria
  ('COUNTRY', 'MA', '2-B', '2'),  -- Morocco
  ('COUNTRY', 'TN', '2-B', '2'),  -- Tunisia
  ('COUNTRY', 'TR', '2-B', '2'),  -- Turkey
  ('COUNTRY', 'AL', '2-B', '2'),  -- Albania
  ('COUNTRY', 'JO', '2-B', '2'),  -- Jordan
  ('COUNTRY', 'LB', '2-B', '2'),  -- Lebanon
  ('COUNTRY', 'SY', '2-B', '2'),  -- Syria
  ('COUNTRY', 'IQ', '2-B', '2'),  -- Iraq
  ('COUNTRY', 'IR', '2-B', '2'),  -- Iran
  ('COUNTRY', 'LY', '2-B', '2'),  -- Libya
  ('COUNTRY', 'AZ', '2-B', '2'),  -- Azerbaijan, also 1-B
  ('COUNTRY', 'AF', '2-C', '2'),  -- Afghanistan
  ('COUNTRY', 'KG', '2-C', '2'),  -- Kyrgyzstan
  ('COUNTRY', 'MN', '2-C', '2'),  -- Mongolia
  ('COUNTRY', 'TJ', '2-C', '2'),  -- Tajikistan
  ('COUNTRY', 'TM', '2-C', '2'),  -- Turkmenistan
  ('COUNTRY', 'UZ', '2-C', '2'),  -- Uzbekistan
  ('COUNTRY', 'KZ', '2-C', '2'),  -- Kazakhstan, also 1-B
  ('COUNTRY', 'MR', '2-A', '2'),  -- Mauritania, also 5-B
  ('COUNTRY', 'DJ', '2-A', '2'),  -- Djibouti, also 5-B
  ('COUNTRY', 'MV', '2-A', '2'),  -- Maldives, also 3-A
  ('COUNTRY', 'CN', '3-A', '3'),  -- China
  ('COUNTRY', 'JP', '3-A', '3'),  -- Japan
  ('COUNTRY', 'KP', '3-A', '3'),  -- North Korea
  ('COUNTRY', 'KR', '3-A', '3'),  -- South Korea
  ('COUNTRY', 'TW', '3-A', '3'),  -- Taiwan
  ('COUNTRY', 'MY', '3-A', '3'),  -- Malaysia, also 3-B
  ('COUNTRY', 'PH', '3-B', '3'),  -- Philippines
  ('COUNTRY', 'ID', '3-B', '3'),  -- Indonesia
  ('COUNTRY', 'TH', '3-C', '3'),  -- Thailand, also 3-B
  ('COUNTRY', 'VN', '3-C', '3'),  -- Vietnam, also 3-B
  ('COUNTRY', 'KH', '3-C', '3'),  -- Cambodia
  ('COUNTRY', 'MM', '3-C', '3'),  -- Myanmar
  ('COUNTRY', 'LA', '3-C', '3'),  -- Laos
  ('COUNTRY', 'LK', '3-C', '3'),  -- Sri Lanka, also 3-D
  ('COUNTRY', 'IN', '3-D', '3'),  -- India
  ('COUNTRY', 'BD', '3-D', '3'),  -- Bangladesh
  ('COUNTRY', 'NP', '3-D', '3'),  -- Nepal
  ('COUNTRY', 'BT', '3-D', '3'),  -- Bhutan
  ('COUNTRY', 'TL', '3-A', '3'),  -- East Timor, also 4-E
  ('COUNTRY', 'GY', '3-B', '3'),  -- Guyana, also 6-C
  ('COUNTRY', 'SR', '3-B', '3'),  -- Suriname, also 6-C
  ('COUNTRY', 'DO', '3-B', '3'),  -- Dominican Republic, also 6-B
  ('COUNTRY', 'ZM', '4-A', '4'),  -- Zambia
  ('COUNTRY', 'ZW', '4-A', '4'),  -- Zimbabwe
  ('COUNTRY', 'UG', '4-B', '4'),  -- Uganda
  ('COUNTRY', 'KE', '4-B', '4'),  -- Kenya
  ('COUNTRY', 'BI', '4-B', '4'),  -- Burundi
  ('COUNTRY', 'MW', '4-B', '4'),  -- Malawi
  ('COUNTRY', 'TZ', '4-B', '4'),  -- Tanzania
  ('COUNTRY', 'RW', '4-B', '4'),  -- Rwanda
  ('COUNTRY', 'CG', '4-C', '4'),  -- Rep. of Congo
  ('COUNTRY', 'MZ', '4-C', '4'),  -- Mozambique
  ('COUNTRY', 'CD', '4-C', '4'),  -- Dem. Rep of Congo
  ('COUNTRY', 'AO', '4-C', '4'),  -- Angola
  ('COUNTRY', 'CF', '4-D', '4'),  -- Central African Rep.
  ('COUNTRY', 'CM', '4-D', '4'),  -- Cameroon
  ('COUNTRY', 'NG', '4-D', '4'),  -- Nigeria
  ('COUNTRY', 'TG', '4-D', '4'),  -- Togo
  ('COUNTRY', 'BJ', '4-D', '4'),  -- Benin
  ('COUNTRY', 'GH', '4-D', '4'),  -- Ghana
  ('COUNTRY', 'CI', '4-D', '4'),  -- Ivory Coast
  ('COUNTRY', 'GN', '4-E', '4'),  -- Guinea, also 4-D
  ('COUNTRY', 'GW', '4-E', '4'),  -- Guinea-Bissau
  ('COUNTRY', 'SL', '4-E', '4'),  -- Sierra Leone
  ('COUNTRY', 'LR', '4-E', '4'),  -- Liberia
  ('COUNTRY', 'MG', '4-E', '4'),  -- Madagascar
  ('COUNTRY', 'TD', '5-A', '5'),  -- Chad
  ('COUNTRY', 'SS', '5-A', '5'),  -- South Sudan
  ('COUNTRY', 'SN', '5-B', '5'),  -- Senegal
  ('COUNTRY', 'ML', '5-B', '5'),  -- Mali
  ('COUNTRY', 'NE', '5-B', '5'),  -- Niger
  ('COUNTRY', 'BF', '5-B', '5'),  -- Burkina Faso
  ('COUNTRY', 'SD', '5-B', '5'),  -- Sudan
  ('COUNTRY', 'ET', '5-C', '5'),  -- Ethiopia
  ('COUNTRY', 'GM', '5-B', '5'),  -- Gambia, also 4-E
  ('COUNTRY', 'ZA', '6-A', '6'),  -- South Africa
  ('COUNTRY', 'NA', '6-A', '6'),  -- Namibia
  ('COUNTRY', 'BW', '6-A', '6'),  -- Botswana
  ('COUNTRY', 'SZ', '6-A', '6'),  -- Eswatini
  ('COUNTRY', 'LS', '6-A', '6'),  -- Lesotho
  ('COUNTRY', 'BR', '6-B', '6'),  -- Brazil
  ('COUNTRY', 'MX', '6-B', '6'),  -- Mexico
  ('COUNTRY', 'CO', '6-B', '6'),  -- Colombia
  ('COUNTRY', 'VE', '6-B', '6'),  -- Venezuela
  ('COUNTRY', 'PE', '6-B', '6'),  -- Peru
  ('COUNTRY', 'BO', '6-B', '6'),  -- Bolivia
  ('COUNTRY', 'GT', '6-B', '6'),  -- Guatemala
  ('COUNTRY', 'EC', '6-B', '6'),  -- Ecuador
  ('COUNTRY', 'HN', '6-B', '6'),  -- Honduras
  ('COUNTRY', 'SV', '6-B', '6'),  -- El Salvador
  ('COUNTRY', 'NI', '6-B', '6'),  -- Nicaragua
  ('COUNTRY', 'CR', '6-B', '6'),  -- Costa Rica
  ('COUNTRY', 'PA', '6-B', '6'),  -- Panama
  ('COUNTRY', 'CV', '6-B', '6'),  -- Cape Verde
  ('COUNTRY', 'BZ', '6-B', '6'),  -- Belize, also 6-C
  ('COUNTRY', 'JM', '6-C', '6'),  -- Jamaica
  ('COUNTRY', 'TT', '6-C', '6'),  -- Trinidad & Tobago
  ('COUNTRY', 'BS', '6-C', '6'),  -- Bahamas
  ('COUNTRY', 'BB', '6-C', '6'),  -- Barbados
  ('COUNTRY', 'LC', '6-C', '6'),  -- St. Lucia
  ('COUNTRY', 'AG', '6-C', '6'),  -- Antigua & Barbuda
  ('COUNTRY', 'VC', '6-C', '6'),  -- St. Vincent
  ('COUNTRY', 'GD', '6-C', '6'),  -- Grenada
  ('COUNTRY', 'SC', '6-C', '6'),  -- Seychelles
  ('COUNTRY', 'CU', '6-B', '6'),  -- Cuba, also 3-B
  ('COUNTRY', 'HT', '6-B', '6'),  -- Haiti, also 4-E
  ('COUNTRY', 'PY', '6-B', '6'),  -- Paraguay, also 4-A
  ('COUNTRY', 'FJ', '6-C', '6'),  -- Fiji, also 3-B
  ('COUNTRY', 'MU', '6-C', '6'),  -- Mauritius, also 2-A
  ('COUNTRY', 'SB', '7-A', '7'),  -- Solomon Islands
  ('COUNTRY', 'WS', '7-A', '7'),  -- Samoa
  ('COUNTRY', 'KI', '7-A', '7'),  -- Kiribati
  ('COUNTRY', 'VU', '7-A', '7'),  -- Vanuatu
  ('COUNTRY', 'FM', '7-A', '7'),  -- Micronesia
  ('COUNTRY', 'KM', '7-A', '7'),  -- Comoros
  ('COUNTRY', 'PG', '7-A', '7'),  -- Papua New Guinea, also 7-B
  ('COUNTRY', 'GA', '7-B', '7'),  -- Gabon
  ('COUNTRY', 'ST', '7-B', '7')  -- Sao Tome and Principe

on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Not in the source. Placed by the same staple logic, and separable.
-- ---------------------------------------------------------------------------

insert into fil_rouge_catalogue (category, code, group_code, macro_code) values
  ('COUNTRY', 'DE', '1-C', '1'),  -- Germany
  ('COUNTRY', 'MD', '1-B', '1'),  -- Moldova
  ('COUNTRY', 'AD', '1-A', '1'),  -- Andorra
  ('COUNTRY', 'MC', '1-A', '1'),  -- Monaco
  ('COUNTRY', 'SM', '1-A', '1'),  -- San Marino
  ('COUNTRY', 'LI', '1-C', '1'),  -- Liechtenstein
  ('COUNTRY', 'BN', '3-B', '3'),  -- Brunei
  ('COUNTRY', 'SG', '3-B', '3'),  -- Singapore
  ('COUNTRY', 'DM', '6-C', '6'),  -- Dominica
  ('COUNTRY', 'KN', '6-C', '6'),  -- St. Kitts & Nevis
  ('COUNTRY', 'GQ', '7-B', '7'),  -- Equatorial Guinea
  ('COUNTRY', 'ER', '5-C', '5'),  -- Eritrea
  ('COUNTRY', 'SO', '5-B', '5'),  -- Somalia
  ('COUNTRY', 'MH', '7-A', '7'),  -- Marshall Islands
  ('COUNTRY', 'NR', '7-A', '7'),  -- Nauru
  ('COUNTRY', 'PW', '7-A', '7'),  -- Palau
  ('COUNTRY', 'TO', '7-A', '7'),  -- Tonga
  ('COUNTRY', 'TV', '7-A', '7')  -- Tuvalu
on conflict do nothing;
