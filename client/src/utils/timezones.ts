export interface TimezoneOption {
  value: string;
  label: string;
  city: string;
  country: string;
}


export const TIMEZONE_OPTIONS: TimezoneOption[] = [

  { value: 'UTC', label: 'UTC', city: 'Coordinated Universal Time', country: 'UTC' },


  { value: 'Africa/Abidjan', label: 'Abidjan', city: 'Abidjan', country: 'Ivory Coast' },
  { value: 'Africa/Accra', label: 'Accra', city: 'Accra', country: 'Ghana' },
  { value: 'Africa/Addis_Ababa', label: 'Addis Ababa', city: 'Addis Ababa', country: 'Ethiopia' },
  { value: 'Africa/Algiers', label: 'Algiers', city: 'Algiers', country: 'Algeria' },
  { value: 'Africa/Asmara', label: 'Asmara', city: 'Asmara', country: 'Eritrea' },
  { value: 'Africa/Bamako', label: 'Bamako', city: 'Bamako', country: 'Mali' },
  { value: 'Africa/Bangui', label: 'Bangui', city: 'Bangui', country: 'Central African Republic' },
  { value: 'Africa/Banjul', label: 'Banjul', city: 'Banjul', country: 'Gambia' },
  { value: 'Africa/Bissau', label: 'Bissau', city: 'Bissau', country: 'Guinea-Bissau' },
  { value: 'Africa/Blantyre', label: 'Blantyre', city: 'Blantyre', country: 'Malawi' },
  { value: 'Africa/Brazzaville', label: 'Brazzaville', city: 'Brazzaville', country: 'Republic of the Congo' },
  { value: 'Africa/Bujumbura', label: 'Bujumbura', city: 'Bujumbura', country: 'Burundi' },
  { value: 'Africa/Cairo', label: 'Cairo', city: 'Cairo', country: 'Egypt' },
  { value: 'Africa/Casablanca', label: 'Casablanca', city: 'Casablanca', country: 'Morocco' },
  { value: 'Africa/Ceuta', label: 'Ceuta', city: 'Ceuta', country: 'Spain' },
  { value: 'Africa/Conakry', label: 'Conakry', city: 'Conakry', country: 'Guinea' },
  { value: 'Africa/Dakar', label: 'Dakar', city: 'Dakar', country: 'Senegal' },
  { value: 'Africa/Dar_es_Salaam', label: 'Dar es Salaam', city: 'Dar es Salaam', country: 'Tanzania' },
  { value: 'Africa/Djibouti', label: 'Djibouti', city: 'Djibouti', country: 'Djibouti' },
  { value: 'Africa/Douala', label: 'Douala', city: 'Douala', country: 'Cameroon' },
  { value: 'Africa/El_Aaiun', label: 'El Aaiun', city: 'El Aaiun', country: 'Western Sahara' },
  { value: 'Africa/Freetown', label: 'Freetown', city: 'Freetown', country: 'Sierra Leone' },
  { value: 'Africa/Gaborone', label: 'Gaborone', city: 'Gaborone', country: 'Botswana' },
  { value: 'Africa/Harare', label: 'Harare', city: 'Harare', country: 'Zimbabwe' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg', city: 'Johannesburg', country: 'South Africa' },
  { value: 'Africa/Juba', label: 'Juba', city: 'Juba', country: 'South Sudan' },
  { value: 'Africa/Kampala', label: 'Kampala', city: 'Kampala', country: 'Uganda' },
  { value: 'Africa/Khartoum', label: 'Khartoum', city: 'Khartoum', country: 'Sudan' },
  { value: 'Africa/Kigali', label: 'Kigali', city: 'Kigali', country: 'Rwanda' },
  { value: 'Africa/Kinshasa', label: 'Kinshasa', city: 'Kinshasa', country: 'Democratic Republic of the Congo' },
  { value: 'Africa/Lagos', label: 'Lagos', city: 'Lagos', country: 'Nigeria' },
  { value: 'Africa/Libreville', label: 'Libreville', city: 'Libreville', country: 'Gabon' },
  { value: 'Africa/Lome', label: 'Lome', city: 'Lome', country: 'Togo' },
  { value: 'Africa/Luanda', label: 'Luanda', city: 'Luanda', country: 'Angola' },
  { value: 'Africa/Lubumbashi', label: 'Lubumbashi', city: 'Lubumbashi', country: 'Democratic Republic of the Congo' },
  { value: 'Africa/Lusaka', label: 'Lusaka', city: 'Lusaka', country: 'Zambia' },
  { value: 'Africa/Malabo', label: 'Malabo', city: 'Malabo', country: 'Equatorial Guinea' },
  { value: 'Africa/Maputo', label: 'Maputo', city: 'Maputo', country: 'Mozambique' },
  { value: 'Africa/Maseru', label: 'Maseru', city: 'Maseru', country: 'Lesotho' },
  { value: 'Africa/Mbabane', label: 'Mbabane', city: 'Mbabane', country: 'Eswatini' },
  { value: 'Africa/Mogadishu', label: 'Mogadishu', city: 'Mogadishu', country: 'Somalia' },
  { value: 'Africa/Monrovia', label: 'Monrovia', city: 'Monrovia', country: 'Liberia' },
  { value: 'Africa/Nairobi', label: 'Nairobi', city: 'Nairobi', country: 'Kenya' },
  { value: 'Africa/Ndjamena', label: 'Ndjamena', city: 'Ndjamena', country: 'Chad' },
  { value: 'Africa/Niamey', label: 'Niamey', city: 'Niamey', country: 'Niger' },
  { value: 'Africa/Nouakchott', label: 'Nouakchott', city: 'Nouakchott', country: 'Mauritania' },
  { value: 'Africa/Ouagadougou', label: 'Ouagadougou', city: 'Ouagadougou', country: 'Burkina Faso' },
  { value: 'Africa/Porto-Novo', label: 'Porto-Novo', city: 'Porto-Novo', country: 'Benin' },
  { value: 'Africa/Sao_Tome', label: 'Sao Tome', city: 'Sao Tome', country: 'Sao Tome and Principe' },
  { value: 'Africa/Tripoli', label: 'Tripoli', city: 'Tripoli', country: 'Libya' },
  { value: 'Africa/Tunis', label: 'Tunis', city: 'Tunis', country: 'Tunisia' },
  { value: 'Africa/Windhoek', label: 'Windhoek', city: 'Windhoek', country: 'Namibia' },


  { value: 'America/Adak', label: 'Adak', city: 'Adak', country: 'United States' },
  { value: 'America/Anchorage', label: 'Anchorage', city: 'Anchorage', country: 'United States' },
  { value: 'America/Anguilla', label: 'Anguilla', city: 'The Valley', country: 'Anguilla' },
  { value: 'America/Antigua', label: 'Antigua', city: 'Saint Johns', country: 'Antigua and Barbuda' },
  { value: 'America/Araguaina', label: 'Araguaina', city: 'Araguaina', country: 'Brazil' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires', city: 'Buenos Aires', country: 'Argentina' },
  { value: 'America/Argentina/Catamarca', label: 'Catamarca', city: 'Catamarca', country: 'Argentina' },
  { value: 'America/Argentina/Cordoba', label: 'Cordoba', city: 'Cordoba', country: 'Argentina' },
  { value: 'America/Argentina/Jujuy', label: 'Jujuy', city: 'Jujuy', country: 'Argentina' },
  { value: 'America/Argentina/La_Rioja', label: 'La Rioja', city: 'La Rioja', country: 'Argentina' },
  { value: 'America/Argentina/Mendoza', label: 'Mendoza', city: 'Mendoza', country: 'Argentina' },
  { value: 'America/Argentina/Rio_Gallegos', label: 'Rio Gallegos', city: 'Rio Gallegos', country: 'Argentina' },
  { value: 'America/Argentina/Salta', label: 'Salta', city: 'Salta', country: 'Argentina' },
  { value: 'America/Argentina/San_Juan', label: 'San Juan', city: 'San Juan', country: 'Argentina' },
  { value: 'America/Argentina/San_Luis', label: 'San Luis', city: 'San Luis', country: 'Argentina' },
  { value: 'America/Argentina/Tucuman', label: 'Tucuman', city: 'Tucuman', country: 'Argentina' },
  { value: 'America/Argentina/Ushuaia', label: 'Ushuaia', city: 'Ushuaia', country: 'Argentina' },
  { value: 'America/Aruba', label: 'Aruba', city: 'Oranjestad', country: 'Aruba' },
  { value: 'America/Asuncion', label: 'Asuncion', city: 'Asuncion', country: 'Paraguay' },
  { value: 'America/Atikokan', label: 'Atikokan', city: 'Atikokan', country: 'Canada' },
  { value: 'America/Bahia', label: 'Bahia', city: 'Salvador', country: 'Brazil' },
  { value: 'America/Bahia_Banderas', label: 'Bahia Banderas', city: 'Bahia Banderas', country: 'Mexico' },
  { value: 'America/Barbados', label: 'Barbados', city: 'Bridgetown', country: 'Barbados' },
  { value: 'America/Belem', label: 'Belem', city: 'Belem', country: 'Brazil' },
  { value: 'America/Belize', label: 'Belize', city: 'Belize City', country: 'Belize' },
  { value: 'America/Blanc-Sablon', label: 'Blanc-Sablon', city: 'Blanc-Sablon', country: 'Canada' },
  { value: 'America/Boa_Vista', label: 'Boa Vista', city: 'Boa Vista', country: 'Brazil' },
  { value: 'America/Bogota', label: 'Bogota', city: 'Bogota', country: 'Colombia' },
  { value: 'America/Boise', label: 'Boise', city: 'Boise', country: 'United States' },
  { value: 'America/Cambridge_Bay', label: 'Cambridge Bay', city: 'Cambridge Bay', country: 'Canada' },
  { value: 'America/Campo_Grande', label: 'Campo Grande', city: 'Campo Grande', country: 'Brazil' },
  { value: 'America/Cancun', label: 'Cancun', city: 'Cancun', country: 'Mexico' },
  { value: 'America/Caracas', label: 'Caracas', city: 'Caracas', country: 'Venezuela' },
  { value: 'America/Cayenne', label: 'Cayenne', city: 'Cayenne', country: 'French Guiana' },
  { value: 'America/Cayman', label: 'Cayman', city: 'George Town', country: 'Cayman Islands' },
  { value: 'America/Chicago', label: 'Chicago', city: 'Chicago', country: 'United States' },
  { value: 'America/Chihuahua', label: 'Chihuahua', city: 'Chihuahua', country: 'Mexico' },
  { value: 'America/Costa_Rica', label: 'Costa Rica', city: 'San Jose', country: 'Costa Rica' },
  { value: 'America/Creston', label: 'Creston', city: 'Creston', country: 'Canada' },
  { value: 'America/Cuiaba', label: 'Cuiaba', city: 'Cuiaba', country: 'Brazil' },
  { value: 'America/Curacao', label: 'Curacao', city: 'Willemstad', country: 'Curacao' },
  { value: 'America/Danmarkshavn', label: 'Danmarkshavn', city: 'Danmarkshavn', country: 'Greenland' },
  { value: 'America/Dawson', label: 'Dawson', city: 'Dawson', country: 'Canada' },
  { value: 'America/Dawson_Creek', label: 'Dawson Creek', city: 'Dawson Creek', country: 'Canada' },
  { value: 'America/Denver', label: 'Denver', city: 'Denver', country: 'United States' },
  { value: 'America/Detroit', label: 'Detroit', city: 'Detroit', country: 'United States' },
  { value: 'America/Dominica', label: 'Dominica', city: 'Roseau', country: 'Dominica' },
  { value: 'America/Edmonton', label: 'Edmonton', city: 'Edmonton', country: 'Canada' },
  { value: 'America/Eirunepe', label: 'Eirunepe', city: 'Eirunepe', country: 'Brazil' },
  { value: 'America/El_Salvador', label: 'El Salvador', city: 'San Salvador', country: 'El Salvador' },
  { value: 'America/Fort_Nelson', label: 'Fort Nelson', city: 'Fort Nelson', country: 'Canada' },
  { value: 'America/Fortaleza', label: 'Fortaleza', city: 'Fortaleza', country: 'Brazil' },
  { value: 'America/Glace_Bay', label: 'Glace Bay', city: 'Glace Bay', country: 'Canada' },
  { value: 'America/Godthab', label: 'Nuuk', city: 'Nuuk', country: 'Greenland' },
  { value: 'America/Goose_Bay', label: 'Goose Bay', city: 'Goose Bay', country: 'Canada' },
  { value: 'America/Grand_Turk', label: 'Grand Turk', city: 'Grand Turk', country: 'Turks and Caicos Islands' },
  { value: 'America/Grenada', label: 'Grenada', city: 'Saint Georges', country: 'Grenada' },
  { value: 'America/Guadeloupe', label: 'Guadeloupe', city: 'Basse-Terre', country: 'Guadeloupe' },
  { value: 'America/Guatemala', label: 'Guatemala', city: 'Guatemala City', country: 'Guatemala' },
  { value: 'America/Guayaquil', label: 'Guayaquil', city: 'Guayaquil', country: 'Ecuador' },
  { value: 'America/Guyana', label: 'Guyana', city: 'Georgetown', country: 'Guyana' },
  { value: 'America/Halifax', label: 'Halifax', city: 'Halifax', country: 'Canada' },
  { value: 'America/Havana', label: 'Havana', city: 'Havana', country: 'Cuba' },
  { value: 'America/Hermosillo', label: 'Hermosillo', city: 'Hermosillo', country: 'Mexico' },
  { value: 'America/Indiana/Indianapolis', label: 'Indianapolis', city: 'Indianapolis', country: 'United States' },
  { value: 'America/Indiana/Knox', label: 'Knox', city: 'Knox', country: 'United States' },
  { value: 'America/Indiana/Marengo', label: 'Marengo', city: 'Marengo', country: 'United States' },
  { value: 'America/Indiana/Petersburg', label: 'Petersburg', city: 'Petersburg', country: 'United States' },
  { value: 'America/Indiana/Tell_City', label: 'Tell City', city: 'Tell City', country: 'United States' },
  { value: 'America/Indiana/Vevay', label: 'Vevay', city: 'Vevay', country: 'United States' },
  { value: 'America/Indiana/Vincennes', label: 'Vincennes', city: 'Vincennes', country: 'United States' },
  { value: 'America/Indiana/Winamac', label: 'Winamac', city: 'Winamac', country: 'United States' },
  { value: 'America/Inuvik', label: 'Inuvik', city: 'Inuvik', country: 'Canada' },
  { value: 'America/Iqaluit', label: 'Iqaluit', city: 'Iqaluit', country: 'Canada' },
  { value: 'America/Jamaica', label: 'Jamaica', city: 'Kingston', country: 'Jamaica' },
  { value: 'America/Juneau', label: 'Juneau', city: 'Juneau', country: 'United States' },
  { value: 'America/Kentucky/Louisville', label: 'Louisville', city: 'Louisville', country: 'United States' },
  { value: 'America/Kentucky/Monticello', label: 'Monticello', city: 'Monticello', country: 'United States' },
  { value: 'America/Kralendijk', label: 'Kralendijk', city: 'Kralendijk', country: 'Caribbean Netherlands' },
  { value: 'America/La_Paz', label: 'La Paz', city: 'La Paz', country: 'Bolivia' },
  { value: 'America/Lima', label: 'Lima', city: 'Lima', country: 'Peru' },
  { value: 'America/Los_Angeles', label: 'Los Angeles', city: 'Los Angeles', country: 'United States' },
  { value: 'America/Lower_Princes', label: 'Lower Princes Quarter', city: 'Lower Princes Quarter', country: 'Sint Maarten' },
  { value: 'America/Maceio', label: 'Maceio', city: 'Maceio', country: 'Brazil' },
  { value: 'America/Managua', label: 'Managua', city: 'Managua', country: 'Nicaragua' },
  { value: 'America/Manaus', label: 'Manaus', city: 'Manaus', country: 'Brazil' },
  { value: 'America/Marigot', label: 'Marigot', city: 'Marigot', country: 'Saint Martin' },
  { value: 'America/Martinique', label: 'Martinique', city: 'Fort-de-France', country: 'Martinique' },
  { value: 'America/Matamoros', label: 'Matamoros', city: 'Matamoros', country: 'Mexico' },
  { value: 'America/Mazatlan', label: 'Mazatlan', city: 'Mazatlan', country: 'Mexico' },
  { value: 'America/Menominee', label: 'Menominee', city: 'Menominee', country: 'United States' },
  { value: 'America/Merida', label: 'Merida', city: 'Merida', country: 'Mexico' },
  { value: 'America/Metlakatla', label: 'Metlakatla', city: 'Metlakatla', country: 'United States' },
  { value: 'America/Mexico_City', label: 'Mexico City', city: 'Mexico City', country: 'Mexico' },
  { value: 'America/Miquelon', label: 'Miquelon', city: 'Saint-Pierre', country: 'Saint Pierre and Miquelon' },
  { value: 'America/Moncton', label: 'Moncton', city: 'Moncton', country: 'Canada' },
  { value: 'America/Monterrey', label: 'Monterrey', city: 'Monterrey', country: 'Mexico' },
  { value: 'America/Montevideo', label: 'Montevideo', city: 'Montevideo', country: 'Uruguay' },
  { value: 'America/Montserrat', label: 'Montserrat', city: 'Plymouth', country: 'Montserrat' },
  { value: 'America/Nassau', label: 'Nassau', city: 'Nassau', country: 'Bahamas' },
  { value: 'America/New_York', label: 'New York', city: 'New York', country: 'United States' },
  { value: 'America/Nipigon', label: 'Nipigon', city: 'Nipigon', country: 'Canada' },
  { value: 'America/Nome', label: 'Nome', city: 'Nome', country: 'United States' },
  { value: 'America/Noronha', label: 'Noronha', city: 'Fernando de Noronha', country: 'Brazil' },
  { value: 'America/North_Dakota/Beulah', label: 'Beulah', city: 'Beulah', country: 'United States' },
  { value: 'America/North_Dakota/Center', label: 'Center', city: 'Center', country: 'United States' },
  { value: 'America/North_Dakota/New_Salem', label: 'New Salem', city: 'New Salem', country: 'United States' },
  { value: 'America/Ojinaga', label: 'Ojinaga', city: 'Ojinaga', country: 'Mexico' },
  { value: 'America/Panama', label: 'Panama', city: 'Panama City', country: 'Panama' },
  { value: 'America/Pangnirtung', label: 'Pangnirtung', city: 'Pangnirtung', country: 'Canada' },
  { value: 'America/Paramaribo', label: 'Paramaribo', city: 'Paramaribo', country: 'Suriname' },
  { value: 'America/Phoenix', label: 'Phoenix', city: 'Phoenix', country: 'United States' },
  { value: 'America/Port-au-Prince', label: 'Port-au-Prince', city: 'Port-au-Prince', country: 'Haiti' },
  { value: 'America/Port_of_Spain', label: 'Port of Spain', city: 'Port of Spain', country: 'Trinidad and Tobago' },
  { value: 'America/Porto_Velho', label: 'Porto Velho', city: 'Porto Velho', country: 'Brazil' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico', city: 'San Juan', country: 'Puerto Rico' },
  { value: 'America/Punta_Arenas', label: 'Punta Arenas', city: 'Punta Arenas', country: 'Chile' },
  { value: 'America/Rainy_River', label: 'Rainy River', city: 'Rainy River', country: 'Canada' },
  { value: 'America/Rankin_Inlet', label: 'Rankin Inlet', city: 'Rankin Inlet', country: 'Canada' },
  { value: 'America/Recife', label: 'Recife', city: 'Recife', country: 'Brazil' },
  { value: 'America/Regina', label: 'Regina', city: 'Regina', country: 'Canada' },
  { value: 'America/Resolute', label: 'Resolute', city: 'Resolute', country: 'Canada' },
  { value: 'America/Rio_Branco', label: 'Rio Branco', city: 'Rio Branco', country: 'Brazil' },
  { value: 'America/Santarem', label: 'Santarem', city: 'Santarem', country: 'Brazil' },
  { value: 'America/Santiago', label: 'Santiago', city: 'Santiago', country: 'Chile' },
  { value: 'America/Santo_Domingo', label: 'Santo Domingo', city: 'Santo Domingo', country: 'Dominican Republic' },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo', city: 'Sao Paulo', country: 'Brazil' },
  { value: 'America/Scoresbysund', label: 'Scoresbysund', city: 'Ittoqqortoormiit', country: 'Greenland' },
  { value: 'America/Sitka', label: 'Sitka', city: 'Sitka', country: 'United States' },
  { value: 'America/St_Barthelemy', label: 'Saint Barthelemy', city: 'Gustavia', country: 'Saint Barthelemy' },
  { value: 'America/St_Johns', label: 'St. Johns', city: 'St. Johns', country: 'Canada' },
  { value: 'America/St_Kitts', label: 'Saint Kitts', city: 'Basseterre', country: 'Saint Kitts and Nevis' },
  { value: 'America/St_Lucia', label: 'Saint Lucia', city: 'Castries', country: 'Saint Lucia' },
  { value: 'America/St_Thomas', label: 'Saint Thomas', city: 'Charlotte Amalie', country: 'US Virgin Islands' },
  { value: 'America/St_Vincent', label: 'Saint Vincent', city: 'Kingstown', country: 'Saint Vincent and the Grenadines' },
  { value: 'America/Swift_Current', label: 'Swift Current', city: 'Swift Current', country: 'Canada' },
  { value: 'America/Tegucigalpa', label: 'Tegucigalpa', city: 'Tegucigalpa', country: 'Honduras' },
  { value: 'America/Thule', label: 'Thule', city: 'Qaanaaq', country: 'Greenland' },
  { value: 'America/Thunder_Bay', label: 'Thunder Bay', city: 'Thunder Bay', country: 'Canada' },
  { value: 'America/Tijuana', label: 'Tijuana', city: 'Tijuana', country: 'Mexico' },
  { value: 'America/Toronto', label: 'Toronto', city: 'Toronto', country: 'Canada' },
  { value: 'America/Tortola', label: 'Tortola', city: 'Road Town', country: 'British Virgin Islands' },
  { value: 'America/Vancouver', label: 'Vancouver', city: 'Vancouver', country: 'Canada' },
  { value: 'America/Whitehorse', label: 'Whitehorse', city: 'Whitehorse', country: 'Canada' },
  { value: 'America/Winnipeg', label: 'Winnipeg', city: 'Winnipeg', country: 'Canada' },
  { value: 'America/Yakutat', label: 'Yakutat', city: 'Yakutat', country: 'United States' },
  { value: 'America/Yellowknife', label: 'Yellowknife', city: 'Yellowknife', country: 'Canada' },


  { value: 'Asia/Aden', label: 'Aden', city: 'Aden', country: 'Yemen' },
  { value: 'Asia/Almaty', label: 'Almaty', city: 'Almaty', country: 'Kazakhstan' },
  { value: 'Asia/Amman', label: 'Amman', city: 'Amman', country: 'Jordan' },
  { value: 'Asia/Anadyr', label: 'Anadyr', city: 'Anadyr', country: 'Russia' },
  { value: 'Asia/Aqtau', label: 'Aqtau', city: 'Aqtau', country: 'Kazakhstan' },
  { value: 'Asia/Aqtobe', label: 'Aqtobe', city: 'Aqtobe', country: 'Kazakhstan' },
  { value: 'Asia/Ashgabat', label: 'Ashgabat', city: 'Ashgabat', country: 'Turkmenistan' },
  { value: 'Asia/Atyrau', label: 'Atyrau', city: 'Atyrau', country: 'Kazakhstan' },
  { value: 'Asia/Baghdad', label: 'Baghdad', city: 'Baghdad', country: 'Iraq' },
  { value: 'Asia/Bahrain', label: 'Bahrain', city: 'Manama', country: 'Bahrain' },
  { value: 'Asia/Baku', label: 'Baku', city: 'Baku', country: 'Azerbaijan' },
  { value: 'Asia/Bangkok', label: 'Bangkok', city: 'Bangkok', country: 'Thailand' },
  { value: 'Asia/Barnaul', label: 'Barnaul', city: 'Barnaul', country: 'Russia' },
  { value: 'Asia/Beirut', label: 'Beirut', city: 'Beirut', country: 'Lebanon' },
  { value: 'Asia/Bishkek', label: 'Bishkek', city: 'Bishkek', country: 'Kyrgyzstan' },
  { value: 'Asia/Brunei', label: 'Brunei', city: 'Bandar Seri Begawan', country: 'Brunei' },
  { value: 'Asia/Chita', label: 'Chita', city: 'Chita', country: 'Russia' },
  { value: 'Asia/Choibalsan', label: 'Choibalsan', city: 'Choibalsan', country: 'Mongolia' },
  { value: 'Asia/Colombo', label: 'Colombo', city: 'Colombo', country: 'Sri Lanka' },
  { value: 'Asia/Damascus', label: 'Damascus', city: 'Damascus', country: 'Syria' },
  { value: 'Asia/Dhaka', label: 'Dhaka', city: 'Dhaka', country: 'Bangladesh' },
  { value: 'Asia/Dili', label: 'Dili', city: 'Dili', country: 'East Timor' },
  { value: 'Asia/Dubai', label: 'Dubai', city: 'Dubai', country: 'United Arab Emirates' },
  { value: 'Asia/Dushanbe', label: 'Dushanbe', city: 'Dushanbe', country: 'Tajikistan' },
  { value: 'Asia/Famagusta', label: 'Famagusta', city: 'Famagusta', country: 'Cyprus' },
  { value: 'Asia/Gaza', label: 'Gaza', city: 'Gaza', country: 'Palestine' },
  { value: 'Asia/Hebron', label: 'Hebron', city: 'Hebron', country: 'Palestine' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City', city: 'Ho Chi Minh City', country: 'Vietnam' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', city: 'Hong Kong', country: 'Hong Kong' },
  { value: 'Asia/Hovd', label: 'Hovd', city: 'Hovd', country: 'Mongolia' },
  { value: 'Asia/Irkutsk', label: 'Irkutsk', city: 'Irkutsk', country: 'Russia' },
  { value: 'Asia/Jakarta', label: 'Jakarta', city: 'Jakarta', country: 'Indonesia' },
  { value: 'Asia/Jayapura', label: 'Jayapura', city: 'Jayapura', country: 'Indonesia' },
  { value: 'Asia/Jerusalem', label: 'Jerusalem', city: 'Jerusalem', country: 'Israel' },
  { value: 'Asia/Kabul', label: 'Kabul', city: 'Kabul', country: 'Afghanistan' },
  { value: 'Asia/Kamchatka', label: 'Kamchatka', city: 'Petropavlovsk-Kamchatsky', country: 'Russia' },
  { value: 'Asia/Karachi', label: 'Karachi', city: 'Karachi', country: 'Pakistan' },
  { value: 'Asia/Kathmandu', label: 'Kathmandu', city: 'Kathmandu', country: 'Nepal' },
  { value: 'Asia/Khandyga', label: 'Khandyga', city: 'Khandyga', country: 'Russia' },
  { value: 'Asia/Kolkata', label: 'Kolkata', city: 'Kolkata', country: 'India' },
  { value: 'Asia/Krasnoyarsk', label: 'Krasnoyarsk', city: 'Krasnoyarsk', country: 'Russia' },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur', city: 'Kuala Lumpur', country: 'Malaysia' },
  { value: 'Asia/Kuching', label: 'Kuching', city: 'Kuching', country: 'Malaysia' },
  { value: 'Asia/Kuwait', label: 'Kuwait', city: 'Kuwait City', country: 'Kuwait' },
  { value: 'Asia/Macau', label: 'Macau', city: 'Macau', country: 'Macau' },
  { value: 'Asia/Magadan', label: 'Magadan', city: 'Magadan', country: 'Russia' },
  { value: 'Asia/Makassar', label: 'Makassar', city: 'Makassar', country: 'Indonesia' },
  { value: 'Asia/Manila', label: 'Manila', city: 'Manila', country: 'Philippines' },
  { value: 'Asia/Muscat', label: 'Muscat', city: 'Muscat', country: 'Oman' },
  { value: 'Asia/Nicosia', label: 'Nicosia', city: 'Nicosia', country: 'Cyprus' },
  { value: 'Asia/Novokuznetsk', label: 'Novokuznetsk', city: 'Novokuznetsk', country: 'Russia' },
  { value: 'Asia/Novosibirsk', label: 'Novosibirsk', city: 'Novosibirsk', country: 'Russia' },
  { value: 'Asia/Omsk', label: 'Omsk', city: 'Omsk', country: 'Russia' },
  { value: 'Asia/Oral', label: 'Oral', city: 'Oral', country: 'Kazakhstan' },
  { value: 'Asia/Phnom_Penh', label: 'Phnom Penh', city: 'Phnom Penh', country: 'Cambodia' },
  { value: 'Asia/Pontianak', label: 'Pontianak', city: 'Pontianak', country: 'Indonesia' },
  { value: 'Asia/Pyongyang', label: 'Pyongyang', city: 'Pyongyang', country: 'North Korea' },
  { value: 'Asia/Qatar', label: 'Qatar', city: 'Doha', country: 'Qatar' },
  { value: 'Asia/Qostanay', label: 'Qostanay', city: 'Qostanay', country: 'Kazakhstan' },
  { value: 'Asia/Qyzylorda', label: 'Qyzylorda', city: 'Qyzylorda', country: 'Kazakhstan' },
  { value: 'Asia/Riyadh', label: 'Riyadh', city: 'Riyadh', country: 'Saudi Arabia' },
  { value: 'Asia/Sakhalin', label: 'Sakhalin', city: 'Yuzhno-Sakhalinsk', country: 'Russia' },
  { value: 'Asia/Samarkand', label: 'Samarkand', city: 'Samarkand', country: 'Uzbekistan' },
  { value: 'Asia/Seoul', label: 'Seoul', city: 'Seoul', country: 'South Korea' },
  { value: 'Asia/Shanghai', label: 'Shanghai', city: 'Shanghai', country: 'China' },
  { value: 'Asia/Singapore', label: 'Singapore', city: 'Singapore', country: 'Singapore' },
  { value: 'Asia/Srednekolymsk', label: 'Srednekolymsk', city: 'Srednekolymsk', country: 'Russia' },
  { value: 'Asia/Taipei', label: 'Taipei', city: 'Taipei', country: 'Taiwan' },
  { value: 'Asia/Tashkent', label: 'Tashkent', city: 'Tashkent', country: 'Uzbekistan' },
  { value: 'Asia/Tbilisi', label: 'Tbilisi', city: 'Tbilisi', country: 'Georgia' },
  { value: 'Asia/Tehran', label: 'Tehran', city: 'Tehran', country: 'Iran' },
  { value: 'Asia/Thimphu', label: 'Thimphu', city: 'Thimphu', country: 'Bhutan' },
  { value: 'Asia/Tokyo', label: 'Tokyo', city: 'Tokyo', country: 'Japan' },
  { value: 'Asia/Tomsk', label: 'Tomsk', city: 'Tomsk', country: 'Russia' },
  { value: 'Asia/Ulaanbaatar', label: 'Ulaanbaatar', city: 'Ulaanbaatar', country: 'Mongolia' },
  { value: 'Asia/Urumqi', label: 'Urumqi', city: 'Urumqi', country: 'China' },
  { value: 'Asia/Ust-Nera', label: 'Ust-Nera', city: 'Ust-Nera', country: 'Russia' },
  { value: 'Asia/Vientiane', label: 'Vientiane', city: 'Vientiane', country: 'Laos' },
  { value: 'Asia/Vladivostok', label: 'Vladivostok', city: 'Vladivostok', country: 'Russia' },
  { value: 'Asia/Yakutsk', label: 'Yakutsk', city: 'Yakutsk', country: 'Russia' },
  { value: 'Asia/Yangon', label: 'Yangon', city: 'Yangon', country: 'Myanmar' },
  { value: 'Asia/Yekaterinburg', label: 'Yekaterinburg', city: 'Yekaterinburg', country: 'Russia' },
  { value: 'Asia/Yerevan', label: 'Yerevan', city: 'Yerevan', country: 'Armenia' },


  { value: 'Europe/Amsterdam', label: 'Amsterdam', city: 'Amsterdam', country: 'Netherlands' },
  { value: 'Europe/Andorra', label: 'Andorra', city: 'Andorra la Vella', country: 'Andorra' },
  { value: 'Europe/Astrakhan', label: 'Astrakhan', city: 'Astrakhan', country: 'Russia' },
  { value: 'Europe/Athens', label: 'Athens', city: 'Athens', country: 'Greece' },
  { value: 'Europe/Belgrade', label: 'Belgrade', city: 'Belgrade', country: 'Serbia' },
  { value: 'Europe/Berlin', label: 'Berlin', city: 'Berlin', country: 'Germany' },
  { value: 'Europe/Bratislava', label: 'Bratislava', city: 'Bratislava', country: 'Slovakia' },
  { value: 'Europe/Brussels', label: 'Brussels', city: 'Brussels', country: 'Belgium' },
  { value: 'Europe/Bucharest', label: 'Bucharest', city: 'Bucharest', country: 'Romania' },
  { value: 'Europe/Budapest', label: 'Budapest', city: 'Budapest', country: 'Hungary' },
  { value: 'Europe/Busingen', label: 'Busingen', city: 'Busingen', country: 'Germany' },
  { value: 'Europe/Chisinau', label: 'Chisinau', city: 'Chisinau', country: 'Moldova' },
  { value: 'Europe/Copenhagen', label: 'Copenhagen', city: 'Copenhagen', country: 'Denmark' },
  { value: 'Europe/Dublin', label: 'Dublin', city: 'Dublin', country: 'Ireland' },
  { value: 'Europe/Gibraltar', label: 'Gibraltar', city: 'Gibraltar', country: 'Gibraltar' },
  { value: 'Europe/Guernsey', label: 'Guernsey', city: 'Saint Peter Port', country: 'Guernsey' },
  { value: 'Europe/Helsinki', label: 'Helsinki', city: 'Helsinki', country: 'Finland' },
  { value: 'Europe/Isle_of_Man', label: 'Isle of Man', city: 'Douglas', country: 'Isle of Man' },
  { value: 'Europe/Istanbul', label: 'Istanbul', city: 'Istanbul', country: 'Turkey' },
  { value: 'Europe/Jersey', label: 'Jersey', city: 'Saint Helier', country: 'Jersey' },
  { value: 'Europe/Kaliningrad', label: 'Kaliningrad', city: 'Kaliningrad', country: 'Russia' },
  { value: 'Europe/Kiev', label: 'Kiev', city: 'Kiev', country: 'Ukraine' },
  { value: 'Europe/Kirov', label: 'Kirov', city: 'Kirov', country: 'Russia' },
  { value: 'Europe/Lisbon', label: 'Lisbon', city: 'Lisbon', country: 'Portugal' },
  { value: 'Europe/Ljubljana', label: 'Ljubljana', city: 'Ljubljana', country: 'Slovenia' },
  { value: 'Europe/London', label: 'London', city: 'London', country: 'United Kingdom' },
  { value: 'Europe/Luxembourg', label: 'Luxembourg', city: 'Luxembourg', country: 'Luxembourg' },
  { value: 'Europe/Madrid', label: 'Madrid', city: 'Madrid', country: 'Spain' },
  { value: 'Europe/Malta', label: 'Malta', city: 'Valletta', country: 'Malta' },
  { value: 'Europe/Mariehamn', label: 'Mariehamn', city: 'Mariehamn', country: 'Finland' },
  { value: 'Europe/Minsk', label: 'Minsk', city: 'Minsk', country: 'Belarus' },
  { value: 'Europe/Monaco', label: 'Monaco', city: 'Monaco', country: 'Monaco' },
  { value: 'Europe/Moscow', label: 'Moscow', city: 'Moscow', country: 'Russia' },
  { value: 'Europe/Oslo', label: 'Oslo', city: 'Oslo', country: 'Norway' },
  { value: 'Europe/Paris', label: 'Paris', city: 'Paris', country: 'France' },
  { value: 'Europe/Podgorica', label: 'Podgorica', city: 'Podgorica', country: 'Montenegro' },
  { value: 'Europe/Prague', label: 'Prague', city: 'Prague', country: 'Czech Republic' },
  { value: 'Europe/Riga', label: 'Riga', city: 'Riga', country: 'Latvia' },
  { value: 'Europe/Rome', label: 'Rome', city: 'Rome', country: 'Italy' },
  { value: 'Europe/Samara', label: 'Samara', city: 'Samara', country: 'Russia' },
  { value: 'Europe/San_Marino', label: 'San Marino', city: 'San Marino', country: 'San Marino' },
  { value: 'Europe/Sarajevo', label: 'Sarajevo', city: 'Sarajevo', country: 'Bosnia and Herzegovina' },
  { value: 'Europe/Saratov', label: 'Saratov', city: 'Saratov', country: 'Russia' },
  { value: 'Europe/Simferopol', label: 'Simferopol', city: 'Simferopol', country: 'Ukraine' },
  { value: 'Europe/Skopje', label: 'Skopje', city: 'Skopje', country: 'North Macedonia' },
  { value: 'Europe/Sofia', label: 'Sofia', city: 'Sofia', country: 'Bulgaria' },
  { value: 'Europe/Stockholm', label: 'Stockholm', city: 'Stockholm', country: 'Sweden' },
  { value: 'Europe/Tallinn', label: 'Tallinn', city: 'Tallinn', country: 'Estonia' },
  { value: 'Europe/Tirane', label: 'Tirane', city: 'Tirane', country: 'Albania' },
  { value: 'Europe/Ulyanovsk', label: 'Ulyanovsk', city: 'Ulyanovsk', country: 'Russia' },
  { value: 'Europe/Uzhgorod', label: 'Uzhgorod', city: 'Uzhgorod', country: 'Ukraine' },
  { value: 'Europe/Vaduz', label: 'Vaduz', city: 'Vaduz', country: 'Liechtenstein' },
  { value: 'Europe/Vatican', label: 'Vatican', city: 'Vatican City', country: 'Vatican City' },
  { value: 'Europe/Vienna', label: 'Vienna', city: 'Vienna', country: 'Austria' },
  { value: 'Europe/Vilnius', label: 'Vilnius', city: 'Vilnius', country: 'Lithuania' },
  { value: 'Europe/Volgograd', label: 'Volgograd', city: 'Volgograd', country: 'Russia' },
  { value: 'Europe/Warsaw', label: 'Warsaw', city: 'Warsaw', country: 'Poland' },
  { value: 'Europe/Zagreb', label: 'Zagreb', city: 'Zagreb', country: 'Croatia' },
  { value: 'Europe/Zaporozhye', label: 'Zaporozhye', city: 'Zaporozhye', country: 'Ukraine' },
  { value: 'Europe/Zurich', label: 'Zurich', city: 'Zurich', country: 'Switzerland' },


  { value: 'Australia/Adelaide', label: 'Adelaide', city: 'Adelaide', country: 'Australia' },
  { value: 'Australia/Brisbane', label: 'Brisbane', city: 'Brisbane', country: 'Australia' },
  { value: 'Australia/Broken_Hill', label: 'Broken Hill', city: 'Broken Hill', country: 'Australia' },
  { value: 'Australia/Currie', label: 'Currie', city: 'Currie', country: 'Australia' },
  { value: 'Australia/Darwin', label: 'Darwin', city: 'Darwin', country: 'Australia' },
  { value: 'Australia/Eucla', label: 'Eucla', city: 'Eucla', country: 'Australia' },
  { value: 'Australia/Hobart', label: 'Hobart', city: 'Hobart', country: 'Australia' },
  { value: 'Australia/Lindeman', label: 'Lindeman', city: 'Lindeman', country: 'Australia' },
  { value: 'Australia/Lord_Howe', label: 'Lord Howe', city: 'Lord Howe Island', country: 'Australia' },
  { value: 'Australia/Melbourne', label: 'Melbourne', city: 'Melbourne', country: 'Australia' },
  { value: 'Australia/Perth', label: 'Perth', city: 'Perth', country: 'Australia' },
  { value: 'Australia/Sydney', label: 'Sydney', city: 'Sydney', country: 'Australia' },
  { value: 'Pacific/Apia', label: 'Apia', city: 'Apia', country: 'Samoa' },
  { value: 'Pacific/Auckland', label: 'Auckland', city: 'Auckland', country: 'New Zealand' },
  { value: 'Pacific/Bougainville', label: 'Bougainville', city: 'Bougainville', country: 'Papua New Guinea' },
  { value: 'Pacific/Chatham', label: 'Chatham', city: 'Chatham Islands', country: 'New Zealand' },
  { value: 'Pacific/Chuuk', label: 'Chuuk', city: 'Chuuk', country: 'Micronesia' },
  { value: 'Pacific/Easter', label: 'Easter Island', city: 'Easter Island', country: 'Chile' },
  { value: 'Pacific/Efate', label: 'Efate', city: 'Port Vila', country: 'Vanuatu' },
  { value: 'Pacific/Enderbury', label: 'Enderbury', city: 'Enderbury Island', country: 'Kiribati' },
  { value: 'Pacific/Fakaofo', label: 'Fakaofo', city: 'Fakaofo', country: 'Tokelau' },
  { value: 'Pacific/Fiji', label: 'Fiji', city: 'Suva', country: 'Fiji' },
  { value: 'Pacific/Funafuti', label: 'Funafuti', city: 'Funafuti', country: 'Tuvalu' },
  { value: 'Pacific/Galapagos', label: 'Galapagos', city: 'Galapagos Islands', country: 'Ecuador' },
  { value: 'Pacific/Gambier', label: 'Gambier', city: 'Gambier Islands', country: 'French Polynesia' },
  { value: 'Pacific/Guadalcanal', label: 'Guadalcanal', city: 'Honiara', country: 'Solomon Islands' },
  { value: 'Pacific/Guam', label: 'Guam', city: 'Hagatna', country: 'Guam' },
  { value: 'Pacific/Honolulu', label: 'Honolulu', city: 'Honolulu', country: 'United States' },
  { value: 'Pacific/Kiritimati', label: 'Kiritimati', city: 'Kiritimati', country: 'Kiribati' },
  { value: 'Pacific/Kosrae', label: 'Kosrae', city: 'Kosrae', country: 'Micronesia' },
  { value: 'Pacific/Kwajalein', label: 'Kwajalein', city: 'Kwajalein', country: 'Marshall Islands' },
  { value: 'Pacific/Majuro', label: 'Majuro', city: 'Majuro', country: 'Marshall Islands' },
  { value: 'Pacific/Marquesas', label: 'Marquesas', city: 'Marquesas Islands', country: 'French Polynesia' },
  { value: 'Pacific/Midway', label: 'Midway', city: 'Midway Atoll', country: 'United States' },
  { value: 'Pacific/Nauru', label: 'Nauru', city: 'Yaren', country: 'Nauru' },
  { value: 'Pacific/Niue', label: 'Niue', city: 'Alofi', country: 'Niue' },
  { value: 'Pacific/Norfolk', label: 'Norfolk', city: 'Norfolk Island', country: 'Australia' },
  { value: 'Pacific/Noumea', label: 'Noumea', city: 'Noumea', country: 'New Caledonia' },
  { value: 'Pacific/Pago_Pago', label: 'Pago Pago', city: 'Pago Pago', country: 'American Samoa' },
  { value: 'Pacific/Palau', label: 'Palau', city: 'Ngerulmud', country: 'Palau' },
  { value: 'Pacific/Pitcairn', label: 'Pitcairn', city: 'Adamstown', country: 'Pitcairn Islands' },
  { value: 'Pacific/Pohnpei', label: 'Pohnpei', city: 'Pohnpei', country: 'Micronesia' },
  { value: 'Pacific/Port_Moresby', label: 'Port Moresby', city: 'Port Moresby', country: 'Papua New Guinea' },
  { value: 'Pacific/Rarotonga', label: 'Rarotonga', city: 'Avarua', country: 'Cook Islands' },
  { value: 'Pacific/Saipan', label: 'Saipan', city: 'Saipan', country: 'Northern Mariana Islands' },
  { value: 'Pacific/Tahiti', label: 'Tahiti', city: 'Papeete', country: 'French Polynesia' },
  { value: 'Pacific/Tarawa', label: 'Tarawa', city: 'South Tarawa', country: 'Kiribati' },
  { value: 'Pacific/Tongatapu', label: 'Tongatapu', city: 'Nukualofa', country: 'Tonga' },
  { value: 'Pacific/Wake', label: 'Wake', city: 'Wake Island', country: 'United States' },
  { value: 'Pacific/Wallis', label: 'Wallis', city: 'Mata-Utu', country: 'Wallis and Futuna' },
];


export const getTimezoneOffset = (tz: string): string => {
  try {

    const now = new Date();


    const formatter = new Intl.DateTimeFormat('en', {
      timeZone: tz,
      timeZoneName: 'longOffset'
    });


    const parts = formatter.formatToParts(now);
    const timeZoneName = parts.find(part => part.type === 'timeZoneName')?.value;

    if (timeZoneName && timeZoneName.startsWith('GMT')) {

      return timeZoneName.replace('GMT', 'UTC');
    }


    const utcDate = new Date(now.toISOString());
    const targetDate = new Date(now.toLocaleString('sv-SE', { timeZone: tz }));
    const offsetMs = targetDate.getTime() - utcDate.getTime();
    const offsetMinutes = Math.round(offsetMs / (1000 * 60));

    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
    const offsetMins = Math.abs(offsetMinutes) % 60;
    const sign = offsetMinutes >= 0 ? '+' : '-';

    return `UTC${sign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`;
  } catch {
    return 'UTC+00:00';
  }
};


export const filterTimezones = (query: string): TimezoneOption[] => {
  if (!query.trim()) {
    return TIMEZONE_OPTIONS;
  }

  const searchTerm = query.toLowerCase().trim();

  return TIMEZONE_OPTIONS.filter(tz =>
    tz.label.toLowerCase().includes(searchTerm) ||
    tz.city.toLowerCase().includes(searchTerm) ||
    tz.country.toLowerCase().includes(searchTerm) ||
    tz.value.toLowerCase().includes(searchTerm)
  );
};


export const getBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/**
 * Convert a datetime-local wall-clock value (YYYY-MM-DDTHH:mm) in a given IANA
 * timezone into a UTC Date.
 */
export const zonedDateTimeToUtc = (localDateTime: string, timezone: string): Date => {
  const match = localDateTime.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) {
    return new Date(localDateTime);
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);

  let candidateDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  for (let i = 0; i < 10; i++) {
    const parts = formatter.formatToParts(candidateDate);
    const tzYear = parseInt(parts.find((p) => p.type === 'year')?.value || '0', 10);
    const tzMonth = parseInt(parts.find((p) => p.type === 'month')?.value || '0', 10);
    const tzDay = parseInt(parts.find((p) => p.type === 'day')?.value || '0', 10);
    const tzHour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const tzMinute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

    if (tzYear === year && tzMonth === month && tzDay === day && tzHour === hour && tzMinute === minute) {
      return candidateDate;
    }

    const desiredMinutes = hour * 60 + minute;
    const actualMinutes = tzHour * 60 + tzMinute;
    const dayDiff =
      (year - tzYear) * 365 * 24 * 60 +
      (month - tzMonth) * 30 * 24 * 60 +
      (day - tzDay) * 24 * 60;
    candidateDate = new Date(candidateDate.getTime() + (dayDiff + desiredMinutes - actualMinutes) * 60 * 1000);
  }

  return candidateDate;
};

/**
 * Format a UTC instant as datetime-local (YYYY-MM-DDTHH:mm) in a target timezone.
 */
export const utcToZonedDateTimeLocal = (value: string | Date, timezone: string): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};