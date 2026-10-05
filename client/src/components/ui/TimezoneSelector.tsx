import React, { useState, useMemo } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './command';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Button } from './button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/use-translation';

interface TimezoneSelectorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  includeCompanyDefault?: boolean;
  companyDefaultTimezone?: string;
  companyDefaultLabel?: string;
}


const ALL_TIMEZONES = [

  { value: 'UTC', label: 'UTC (Coordinated Universal Time)', searchTerms: ['utc', 'coordinated', 'universal', 'time', 'gmt', 'greenwich'] },


  { value: 'Africa/Abidjan', label: 'Abidjan', searchTerms: ['abidjan', 'ivory', 'coast', 'africa'] },
  { value: 'Africa/Accra', label: 'Accra', searchTerms: ['accra', 'ghana', 'africa'] },
  { value: 'Africa/Addis_Ababa', label: 'Addis Ababa', searchTerms: ['addis', 'ababa', 'ethiopia', 'africa'] },
  { value: 'Africa/Algiers', label: 'Algiers', searchTerms: ['algiers', 'algeria', 'africa'] },
  { value: 'Africa/Asmara', label: 'Asmara', searchTerms: ['asmara', 'eritrea', 'africa'] },
  { value: 'Africa/Bamako', label: 'Bamako', searchTerms: ['bamako', 'mali', 'africa'] },
  { value: 'Africa/Bangui', label: 'Bangui', searchTerms: ['bangui', 'central', 'african', 'republic', 'africa'] },
  { value: 'Africa/Banjul', label: 'Banjul', searchTerms: ['banjul', 'gambia', 'africa'] },
  { value: 'Africa/Bissau', label: 'Bissau', searchTerms: ['bissau', 'guinea', 'africa'] },
  { value: 'Africa/Blantyre', label: 'Blantyre', searchTerms: ['blantyre', 'malawi', 'africa'] },
  { value: 'Africa/Brazzaville', label: 'Brazzaville', searchTerms: ['brazzaville', 'congo', 'africa'] },
  { value: 'Africa/Bujumbura', label: 'Bujumbura', searchTerms: ['bujumbura', 'burundi', 'africa'] },
  { value: 'Africa/Cairo', label: 'Cairo', searchTerms: ['cairo', 'egypt', 'africa'] },
  { value: 'Africa/Casablanca', label: 'Casablanca', searchTerms: ['casablanca', 'morocco', 'africa'] },
  { value: 'Africa/Ceuta', label: 'Ceuta', searchTerms: ['ceuta', 'spain', 'africa'] },
  { value: 'Africa/Conakry', label: 'Conakry', searchTerms: ['conakry', 'guinea', 'africa'] },
  { value: 'Africa/Dakar', label: 'Dakar', searchTerms: ['dakar', 'senegal', 'africa'] },
  { value: 'Africa/Dar_es_Salaam', label: 'Dar es Salaam', searchTerms: ['dar', 'es', 'salaam', 'tanzania', 'africa'] },
  { value: 'Africa/Djibouti', label: 'Djibouti', searchTerms: ['djibouti', 'africa'] },
  { value: 'Africa/Douala', label: 'Douala', searchTerms: ['douala', 'cameroon', 'africa'] },
  { value: 'Africa/El_Aaiun', label: 'El Aaiun', searchTerms: ['el', 'aaiun', 'western', 'sahara', 'africa'] },
  { value: 'Africa/Freetown', label: 'Freetown', searchTerms: ['freetown', 'sierra', 'leone', 'africa'] },
  { value: 'Africa/Gaborone', label: 'Gaborone', searchTerms: ['gaborone', 'botswana', 'africa'] },
  { value: 'Africa/Harare', label: 'Harare', searchTerms: ['harare', 'zimbabwe', 'africa'] },
  { value: 'Africa/Johannesburg', label: 'Johannesburg', searchTerms: ['johannesburg', 'south', 'africa'] },
  { value: 'Africa/Juba', label: 'Juba', searchTerms: ['juba', 'south', 'sudan', 'africa'] },
  { value: 'Africa/Kampala', label: 'Kampala', searchTerms: ['kampala', 'uganda', 'africa'] },
  { value: 'Africa/Khartoum', label: 'Khartoum', searchTerms: ['khartoum', 'sudan', 'africa'] },
  { value: 'Africa/Kigali', label: 'Kigali', searchTerms: ['kigali', 'rwanda', 'africa'] },
  { value: 'Africa/Kinshasa', label: 'Kinshasa', searchTerms: ['kinshasa', 'democratic', 'republic', 'congo', 'africa'] },
  { value: 'Africa/Lagos', label: 'Lagos', searchTerms: ['lagos', 'nigeria', 'africa'] },
  { value: 'Africa/Libreville', label: 'Libreville', searchTerms: ['libreville', 'gabon', 'africa'] },
  { value: 'Africa/Lome', label: 'Lome', searchTerms: ['lome', 'togo', 'africa'] },
  { value: 'Africa/Luanda', label: 'Luanda', searchTerms: ['luanda', 'angola', 'africa'] },
  { value: 'Africa/Lubumbashi', label: 'Lubumbashi', searchTerms: ['lubumbashi', 'democratic', 'republic', 'congo', 'africa'] },
  { value: 'Africa/Lusaka', label: 'Lusaka', searchTerms: ['lusaka', 'zambia', 'africa'] },
  { value: 'Africa/Malabo', label: 'Malabo', searchTerms: ['malabo', 'equatorial', 'guinea', 'africa'] },
  { value: 'Africa/Maputo', label: 'Maputo', searchTerms: ['maputo', 'mozambique', 'africa'] },
  { value: 'Africa/Maseru', label: 'Maseru', searchTerms: ['maseru', 'lesotho', 'africa'] },
  { value: 'Africa/Mbabane', label: 'Mbabane', searchTerms: ['mbabane', 'eswatini', 'swaziland', 'africa'] },
  { value: 'Africa/Mogadishu', label: 'Mogadishu', searchTerms: ['mogadishu', 'somalia', 'africa'] },
  { value: 'Africa/Monrovia', label: 'Monrovia', searchTerms: ['monrovia', 'liberia', 'africa'] },
  { value: 'Africa/Nairobi', label: 'Nairobi', searchTerms: ['nairobi', 'kenya', 'africa'] },
  { value: 'Africa/Ndjamena', label: 'Ndjamena', searchTerms: ['ndjamena', 'chad', 'africa'] },
  { value: 'Africa/Niamey', label: 'Niamey', searchTerms: ['niamey', 'niger', 'africa'] },
  { value: 'Africa/Nouakchott', label: 'Nouakchott', searchTerms: ['nouakchott', 'mauritania', 'africa'] },
  { value: 'Africa/Ouagadougou', label: 'Ouagadougou', searchTerms: ['ouagadougou', 'burkina', 'faso', 'africa'] },
  { value: 'Africa/Porto-Novo', label: 'Porto-Novo', searchTerms: ['porto', 'novo', 'benin', 'africa'] },
  { value: 'Africa/Sao_Tome', label: 'Sao Tome', searchTerms: ['sao', 'tome', 'principe', 'africa'] },
  { value: 'Africa/Tripoli', label: 'Tripoli', searchTerms: ['tripoli', 'libya', 'africa'] },
  { value: 'Africa/Tunis', label: 'Tunis', searchTerms: ['tunis', 'tunisia', 'africa'] },
  { value: 'Africa/Windhoek', label: 'Windhoek', searchTerms: ['windhoek', 'namibia', 'africa'] },


  { value: 'America/Adak', label: 'Adak (Alaska)', searchTerms: ['adak', 'alaska', 'usa', 'america', 'hast', 'hadt'] },
  { value: 'America/Anchorage', label: 'Anchorage (Alaska)', searchTerms: ['anchorage', 'alaska', 'usa', 'america', 'akst', 'akdt'] },
  { value: 'America/Anguilla', label: 'Anguilla', searchTerms: ['anguilla', 'caribbean', 'america'] },
  { value: 'America/Antigua', label: 'Antigua', searchTerms: ['antigua', 'barbuda', 'caribbean', 'america'] },
  { value: 'America/Araguaina', label: 'Araguaina (Brazil)', searchTerms: ['araguaina', 'brazil', 'america'] },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (Argentina)', searchTerms: ['buenos', 'aires', 'argentina', 'america'] },
  { value: 'America/Argentina/Catamarca', label: 'Catamarca (Argentina)', searchTerms: ['catamarca', 'argentina', 'america'] },
  { value: 'America/Argentina/Cordoba', label: 'Cordoba (Argentina)', searchTerms: ['cordoba', 'argentina', 'america'] },
  { value: 'America/Argentina/Jujuy', label: 'Jujuy (Argentina)', searchTerms: ['jujuy', 'argentina', 'america'] },
  { value: 'America/Argentina/La_Rioja', label: 'La Rioja (Argentina)', searchTerms: ['la', 'rioja', 'argentina', 'america'] },
  { value: 'America/Argentina/Mendoza', label: 'Mendoza (Argentina)', searchTerms: ['mendoza', 'argentina', 'america'] },
  { value: 'America/Argentina/Rio_Gallegos', label: 'Rio Gallegos (Argentina)', searchTerms: ['rio', 'gallegos', 'argentina', 'america'] },
  { value: 'America/Argentina/Salta', label: 'Salta (Argentina)', searchTerms: ['salta', 'argentina', 'america'] },
  { value: 'America/Argentina/San_Juan', label: 'San Juan (Argentina)', searchTerms: ['san', 'juan', 'argentina', 'america'] },
  { value: 'America/Argentina/San_Luis', label: 'San Luis (Argentina)', searchTerms: ['san', 'luis', 'argentina', 'america'] },
  { value: 'America/Argentina/Tucuman', label: 'Tucuman (Argentina)', searchTerms: ['tucuman', 'argentina', 'america'] },
  { value: 'America/Argentina/Ushuaia', label: 'Ushuaia (Argentina)', searchTerms: ['ushuaia', 'argentina', 'america'] },
  { value: 'America/Aruba', label: 'Aruba', searchTerms: ['aruba', 'caribbean', 'america'] },
  { value: 'America/Asuncion', label: 'Asuncion (Paraguay)', searchTerms: ['asuncion', 'paraguay', 'america'] },
  { value: 'America/Atikokan', label: 'Atikokan (Canada)', searchTerms: ['atikokan', 'canada', 'america'] },
  { value: 'America/Bahia', label: 'Bahia (Brazil)', searchTerms: ['bahia', 'brazil', 'america'] },
  { value: 'America/Bahia_Banderas', label: 'Bahia Banderas (Mexico)', searchTerms: ['bahia', 'banderas', 'mexico', 'america'] },
  { value: 'America/Barbados', label: 'Barbados', searchTerms: ['barbados', 'caribbean', 'america'] },
  { value: 'America/Belem', label: 'Belem (Brazil)', searchTerms: ['belem', 'brazil', 'america'] },
  { value: 'America/Belize', label: 'Belize', searchTerms: ['belize', 'central', 'america'] },
  { value: 'America/Blanc-Sablon', label: 'Blanc-Sablon (Canada)', searchTerms: ['blanc', 'sablon', 'canada', 'america'] },
  { value: 'America/Boa_Vista', label: 'Boa Vista (Brazil)', searchTerms: ['boa', 'vista', 'brazil', 'america'] },
  { value: 'America/Bogota', label: 'Bogota (Colombia)', searchTerms: ['bogota', 'bogotá', 'colombia', 'america', 'cot'] },
  { value: 'America/Boise', label: 'Boise (Idaho, USA)', searchTerms: ['boise', 'idaho', 'usa', 'america', 'mst', 'mdt'] },
  { value: 'America/Cambridge_Bay', label: 'Cambridge Bay (Canada)', searchTerms: ['cambridge', 'bay', 'canada', 'america'] },
  { value: 'America/Campo_Grande', label: 'Campo Grande (Brazil)', searchTerms: ['campo', 'grande', 'brazil', 'america'] },
  { value: 'America/Cancun', label: 'Cancun (Mexico)', searchTerms: ['cancun', 'mexico', 'america'] },
  { value: 'America/Caracas', label: 'Caracas (Venezuela)', searchTerms: ['caracas', 'venezuela', 'america'] },
  { value: 'America/Cayenne', label: 'Cayenne (French Guiana)', searchTerms: ['cayenne', 'french', 'guiana', 'america'] },
  { value: 'America/Cayman', label: 'Cayman Islands', searchTerms: ['cayman', 'islands', 'caribbean', 'america'] },
  { value: 'America/Chicago', label: 'Chicago (Central Time)', searchTerms: ['chicago', 'central', 'time', 'usa', 'america', 'cst', 'cdt'] },
  { value: 'America/Chihuahua', label: 'Chihuahua (Mexico)', searchTerms: ['chihuahua', 'mexico', 'america'] },
  { value: 'America/Costa_Rica', label: 'Costa Rica', searchTerms: ['costa', 'rica', 'central', 'america'] },
  { value: 'America/Creston', label: 'Creston (Canada)', searchTerms: ['creston', 'canada', 'america'] },
  { value: 'America/Cuiaba', label: 'Cuiaba (Brazil)', searchTerms: ['cuiaba', 'brazil', 'america'] },
  { value: 'America/Curacao', label: 'Curacao', searchTerms: ['curacao', 'caribbean', 'america'] },
  { value: 'America/Danmarkshavn', label: 'Danmarkshavn (Greenland)', searchTerms: ['danmarkshavn', 'greenland', 'america'] },
  { value: 'America/Dawson', label: 'Dawson (Canada)', searchTerms: ['dawson', 'canada', 'america'] },
  { value: 'America/Dawson_Creek', label: 'Dawson Creek (Canada)', searchTerms: ['dawson', 'creek', 'canada', 'america'] },
  { value: 'America/Denver', label: 'Denver (Mountain Time)', searchTerms: ['denver', 'mountain', 'time', 'usa', 'america', 'mst', 'mdt'] },
  { value: 'America/Detroit', label: 'Detroit (Eastern Time)', searchTerms: ['detroit', 'eastern', 'time', 'usa', 'america', 'est', 'edt'] },
  { value: 'America/Dominica', label: 'Dominica', searchTerms: ['dominica', 'caribbean', 'america'] },
  { value: 'America/Edmonton', label: 'Edmonton (Canada)', searchTerms: ['edmonton', 'canada', 'america'] },
  { value: 'America/Eirunepe', label: 'Eirunepe (Brazil)', searchTerms: ['eirunepe', 'brazil', 'america'] },
  { value: 'America/El_Salvador', label: 'El Salvador', searchTerms: ['el', 'salvador', 'central', 'america'] },
  { value: 'America/Fort_Nelson', label: 'Fort Nelson (Canada)', searchTerms: ['fort', 'nelson', 'canada', 'america'] },
  { value: 'America/Fortaleza', label: 'Fortaleza (Brazil)', searchTerms: ['fortaleza', 'brazil', 'america'] },
  { value: 'America/Glace_Bay', label: 'Glace Bay (Canada)', searchTerms: ['glace', 'bay', 'canada', 'america'] },
  { value: 'America/Godthab', label: 'Nuuk (Greenland)', searchTerms: ['nuuk', 'godthab', 'greenland', 'america'] },
  { value: 'America/Goose_Bay', label: 'Goose Bay (Canada)', searchTerms: ['goose', 'bay', 'canada', 'america'] },
  { value: 'America/Grand_Turk', label: 'Grand Turk', searchTerms: ['grand', 'turk', 'caicos', 'caribbean', 'america'] },
  { value: 'America/Grenada', label: 'Grenada', searchTerms: ['grenada', 'caribbean', 'america'] },
  { value: 'America/Guadeloupe', label: 'Guadeloupe', searchTerms: ['guadeloupe', 'caribbean', 'america'] },
  { value: 'America/Guatemala', label: 'Guatemala', searchTerms: ['guatemala', 'central', 'america'] },
  { value: 'America/Guayaquil', label: 'Guayaquil (Ecuador)', searchTerms: ['guayaquil', 'ecuador', 'america'] },
  { value: 'America/Guyana', label: 'Guyana', searchTerms: ['guyana', 'america'] },
  { value: 'America/Halifax', label: 'Halifax (Canada)', searchTerms: ['halifax', 'canada', 'america'] },
  { value: 'America/Havana', label: 'Havana (Cuba)', searchTerms: ['havana', 'cuba', 'america'] },
  { value: 'America/Hermosillo', label: 'Hermosillo (Mexico)', searchTerms: ['hermosillo', 'mexico', 'america'] },
  { value: 'America/Indiana/Indianapolis', label: 'Indianapolis (Indiana, USA)', searchTerms: ['indianapolis', 'indiana', 'usa', 'america'] },
  { value: 'America/Indiana/Knox', label: 'Knox (Indiana, USA)', searchTerms: ['knox', 'indiana', 'usa', 'america'] },
  { value: 'America/Indiana/Marengo', label: 'Marengo (Indiana, USA)', searchTerms: ['marengo', 'indiana', 'usa', 'america'] },
  { value: 'America/Indiana/Petersburg', label: 'Petersburg (Indiana, USA)', searchTerms: ['petersburg', 'indiana', 'usa', 'america'] },
  { value: 'America/Indiana/Tell_City', label: 'Tell City (Indiana, USA)', searchTerms: ['tell', 'city', 'indiana', 'usa', 'america'] },
  { value: 'America/Indiana/Vevay', label: 'Vevay (Indiana, USA)', searchTerms: ['vevay', 'indiana', 'usa', 'america'] },
  { value: 'America/Indiana/Vincennes', label: 'Vincennes (Indiana, USA)', searchTerms: ['vincennes', 'indiana', 'usa', 'america'] },
  { value: 'America/Indiana/Winamac', label: 'Winamac (Indiana, USA)', searchTerms: ['winamac', 'indiana', 'usa', 'america'] },
  { value: 'America/Inuvik', label: 'Inuvik (Canada)', searchTerms: ['inuvik', 'canada', 'america'] },
  { value: 'America/Iqaluit', label: 'Iqaluit (Canada)', searchTerms: ['iqaluit', 'canada', 'america'] },
  { value: 'America/Jamaica', label: 'Jamaica', searchTerms: ['jamaica', 'caribbean', 'america'] },
  { value: 'America/Juneau', label: 'Juneau (Alaska)', searchTerms: ['juneau', 'alaska', 'usa', 'america'] },
  { value: 'America/Kentucky/Louisville', label: 'Louisville (Kentucky, USA)', searchTerms: ['louisville', 'kentucky', 'usa', 'america'] },
  { value: 'America/Kentucky/Monticello', label: 'Monticello (Kentucky, USA)', searchTerms: ['monticello', 'kentucky', 'usa', 'america'] },
  { value: 'America/Kralendijk', label: 'Kralendijk (Caribbean Netherlands)', searchTerms: ['kralendijk', 'bonaire', 'caribbean', 'netherlands', 'america'] },
  { value: 'America/La_Paz', label: 'La Paz (Bolivia)', searchTerms: ['la', 'paz', 'bolivia', 'america'] },
  { value: 'America/Lima', label: 'Lima (Peru)', searchTerms: ['lima', 'peru', 'america'] },
  { value: 'America/Los_Angeles', label: 'Los Angeles (Pacific Time)', searchTerms: ['los', 'angeles', 'pacific', 'time', 'usa', 'america', 'pst', 'pdt'] },
  { value: 'America/Lower_Princes', label: 'Lower Prince\'s Quarter (Sint Maarten)', searchTerms: ['lower', 'princes', 'quarter', 'sint', 'maarten', 'caribbean', 'america'] },
  { value: 'America/Maceio', label: 'Maceio (Brazil)', searchTerms: ['maceio', 'brazil', 'america'] },
  { value: 'America/Managua', label: 'Managua (Nicaragua)', searchTerms: ['managua', 'nicaragua', 'central', 'america'] },
  { value: 'America/Manaus', label: 'Manaus (Brazil)', searchTerms: ['manaus', 'brazil', 'america'] },
  { value: 'America/Marigot', label: 'Marigot (Saint Martin)', searchTerms: ['marigot', 'saint', 'martin', 'caribbean', 'america'] },
  { value: 'America/Martinique', label: 'Martinique', searchTerms: ['martinique', 'caribbean', 'america'] },
  { value: 'America/Matamoros', label: 'Matamoros (Mexico)', searchTerms: ['matamoros', 'mexico', 'america'] },
  { value: 'America/Mazatlan', label: 'Mazatlan (Mexico)', searchTerms: ['mazatlan', 'mexico', 'america'] },
  { value: 'America/Menominee', label: 'Menominee (Michigan, USA)', searchTerms: ['menominee', 'michigan', 'usa', 'america'] },
  { value: 'America/Merida', label: 'Merida (Mexico)', searchTerms: ['merida', 'mexico', 'america'] },
  { value: 'America/Metlakatla', label: 'Metlakatla (Alaska)', searchTerms: ['metlakatla', 'alaska', 'usa', 'america'] },
  { value: 'America/Mexico_City', label: 'Mexico City (Mexico)', searchTerms: ['mexico', 'city', 'america'] },
  { value: 'America/Miquelon', label: 'Miquelon (Saint Pierre and Miquelon)', searchTerms: ['miquelon', 'saint', 'pierre', 'america'] },
  { value: 'America/Moncton', label: 'Moncton (Canada)', searchTerms: ['moncton', 'canada', 'america'] },
  { value: 'America/Monterrey', label: 'Monterrey (Mexico)', searchTerms: ['monterrey', 'mexico', 'america'] },
  { value: 'America/Montevideo', label: 'Montevideo (Uruguay)', searchTerms: ['montevideo', 'uruguay', 'america'] },
  { value: 'America/Montserrat', label: 'Montserrat', searchTerms: ['montserrat', 'caribbean', 'america'] },
  { value: 'America/Nassau', label: 'Nassau (Bahamas)', searchTerms: ['nassau', 'bahamas', 'caribbean', 'america'] },
  { value: 'America/New_York', label: 'New York (Eastern Time)', searchTerms: ['new', 'york', 'eastern', 'time', 'usa', 'america', 'est', 'edt'] },
  { value: 'America/Nipigon', label: 'Nipigon (Canada)', searchTerms: ['nipigon', 'canada', 'america'] },
  { value: 'America/Nome', label: 'Nome (Alaska)', searchTerms: ['nome', 'alaska', 'usa', 'america'] },
  { value: 'America/Noronha', label: 'Fernando de Noronha (Brazil)', searchTerms: ['noronha', 'fernando', 'brazil', 'america'] },
  { value: 'America/North_Dakota/Beulah', label: 'Beulah (North Dakota, USA)', searchTerms: ['beulah', 'north', 'dakota', 'usa', 'america'] },
  { value: 'America/North_Dakota/Center', label: 'Center (North Dakota, USA)', searchTerms: ['center', 'north', 'dakota', 'usa', 'america'] },
  { value: 'America/North_Dakota/New_Salem', label: 'New Salem (North Dakota, USA)', searchTerms: ['new', 'salem', 'north', 'dakota', 'usa', 'america'] },
  { value: 'America/Ojinaga', label: 'Ojinaga (Mexico)', searchTerms: ['ojinaga', 'mexico', 'america'] },
  { value: 'America/Panama', label: 'Panama', searchTerms: ['panama', 'central', 'america'] },
  { value: 'America/Pangnirtung', label: 'Pangnirtung (Canada)', searchTerms: ['pangnirtung', 'canada', 'america'] },
  { value: 'America/Paramaribo', label: 'Paramaribo (Suriname)', searchTerms: ['paramaribo', 'suriname', 'america'] },
  { value: 'America/Phoenix', label: 'Phoenix (Arizona, USA)', searchTerms: ['phoenix', 'arizona', 'usa', 'america'] },
  { value: 'America/Port-au-Prince', label: 'Port-au-Prince (Haiti)', searchTerms: ['port', 'au', 'prince', 'haiti', 'caribbean', 'america'] },
  { value: 'America/Port_of_Spain', label: 'Port of Spain (Trinidad and Tobago)', searchTerms: ['port', 'of', 'spain', 'trinidad', 'tobago', 'caribbean', 'america'] },
  { value: 'America/Porto_Velho', label: 'Porto Velho (Brazil)', searchTerms: ['porto', 'velho', 'brazil', 'america'] },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico', searchTerms: ['puerto', 'rico', 'caribbean', 'america'] },
  { value: 'America/Punta_Arenas', label: 'Punta Arenas (Chile)', searchTerms: ['punta', 'arenas', 'chile', 'america'] },
  { value: 'America/Rainy_River', label: 'Rainy River (Canada)', searchTerms: ['rainy', 'river', 'canada', 'america'] },
  { value: 'America/Rankin_Inlet', label: 'Rankin Inlet (Canada)', searchTerms: ['rankin', 'inlet', 'canada', 'america'] },
  { value: 'America/Recife', label: 'Recife (Brazil)', searchTerms: ['recife', 'brazil', 'america'] },
  { value: 'America/Regina', label: 'Regina (Canada)', searchTerms: ['regina', 'canada', 'america'] },
  { value: 'America/Resolute', label: 'Resolute (Canada)', searchTerms: ['resolute', 'canada', 'america'] },
  { value: 'America/Rio_Branco', label: 'Rio Branco (Brazil)', searchTerms: ['rio', 'branco', 'brazil', 'america'] },
  { value: 'America/Santarem', label: 'Santarem (Brazil)', searchTerms: ['santarem', 'brazil', 'america'] },
  { value: 'America/Santiago', label: 'Santiago (Chile)', searchTerms: ['santiago', 'chile', 'america'] },
  { value: 'America/Santo_Domingo', label: 'Santo Domingo (Dominican Republic)', searchTerms: ['santo', 'domingo', 'dominican', 'republic', 'caribbean', 'america'] },
  { value: 'America/Sao_Paulo', label: 'Sao Paulo (Brazil)', searchTerms: ['sao', 'paulo', 'brazil', 'america'] },
  { value: 'America/Scoresbysund', label: 'Scoresbysund (Greenland)', searchTerms: ['scoresbysund', 'greenland', 'america'] },
  { value: 'America/Sitka', label: 'Sitka (Alaska)', searchTerms: ['sitka', 'alaska', 'usa', 'america'] },
  { value: 'America/St_Barthelemy', label: 'Saint Barthelemy', searchTerms: ['saint', 'barthelemy', 'caribbean', 'america'] },
  { value: 'America/St_Johns', label: 'St. John\'s (Canada)', searchTerms: ['st', 'johns', 'newfoundland', 'canada', 'america'] },
  { value: 'America/St_Kitts', label: 'Saint Kitts and Nevis', searchTerms: ['saint', 'kitts', 'nevis', 'caribbean', 'america'] },
  { value: 'America/St_Lucia', label: 'Saint Lucia', searchTerms: ['saint', 'lucia', 'caribbean', 'america'] },
  { value: 'America/St_Thomas', label: 'Saint Thomas (US Virgin Islands)', searchTerms: ['saint', 'thomas', 'virgin', 'islands', 'caribbean', 'america'] },
  { value: 'America/St_Vincent', label: 'Saint Vincent and the Grenadines', searchTerms: ['saint', 'vincent', 'grenadines', 'caribbean', 'america'] },
  { value: 'America/Swift_Current', label: 'Swift Current (Canada)', searchTerms: ['swift', 'current', 'canada', 'america'] },
  { value: 'America/Tegucigalpa', label: 'Tegucigalpa (Honduras)', searchTerms: ['tegucigalpa', 'honduras', 'central', 'america'] },
  { value: 'America/Thule', label: 'Thule (Greenland)', searchTerms: ['thule', 'greenland', 'america'] },
  { value: 'America/Thunder_Bay', label: 'Thunder Bay (Canada)', searchTerms: ['thunder', 'bay', 'canada', 'america'] },
  { value: 'America/Tijuana', label: 'Tijuana (Mexico)', searchTerms: ['tijuana', 'mexico', 'america'] },
  { value: 'America/Toronto', label: 'Toronto (Canada)', searchTerms: ['toronto', 'canada', 'america'] },
  { value: 'America/Tortola', label: 'Tortola (British Virgin Islands)', searchTerms: ['tortola', 'british', 'virgin', 'islands', 'caribbean', 'america'] },
  { value: 'America/Vancouver', label: 'Vancouver (Canada)', searchTerms: ['vancouver', 'canada', 'america'] },
  { value: 'America/Whitehorse', label: 'Whitehorse (Canada)', searchTerms: ['whitehorse', 'canada', 'america'] },
  { value: 'America/Winnipeg', label: 'Winnipeg (Canada)', searchTerms: ['winnipeg', 'canada', 'america'] },
  { value: 'America/Yakutat', label: 'Yakutat (Alaska)', searchTerms: ['yakutat', 'alaska', 'usa', 'america'] },
  { value: 'America/Yellowknife', label: 'Yellowknife (Canada)', searchTerms: ['yellowknife', 'canada', 'america'] },


  { value: 'Antarctica/Casey', label: 'Casey Station (Antarctica)', searchTerms: ['casey', 'antarctica'] },
  { value: 'Antarctica/Davis', label: 'Davis Station (Antarctica)', searchTerms: ['davis', 'antarctica'] },
  { value: 'Antarctica/DumontDUrville', label: 'Dumont d\'Urville Station (Antarctica)', searchTerms: ['dumont', 'durville', 'antarctica'] },
  { value: 'Antarctica/Macquarie', label: 'Macquarie Island (Antarctica)', searchTerms: ['macquarie', 'antarctica'] },
  { value: 'Antarctica/Mawson', label: 'Mawson Station (Antarctica)', searchTerms: ['mawson', 'antarctica'] },
  { value: 'Antarctica/McMurdo', label: 'McMurdo Station (Antarctica)', searchTerms: ['mcmurdo', 'antarctica'] },
  { value: 'Antarctica/Palmer', label: 'Palmer Station (Antarctica)', searchTerms: ['palmer', 'antarctica'] },
  { value: 'Antarctica/Rothera', label: 'Rothera Station (Antarctica)', searchTerms: ['rothera', 'antarctica'] },
  { value: 'Antarctica/Syowa', label: 'Syowa Station (Antarctica)', searchTerms: ['syowa', 'antarctica'] },
  { value: 'Antarctica/Troll', label: 'Troll Station (Antarctica)', searchTerms: ['troll', 'antarctica'] },
  { value: 'Antarctica/Vostok', label: 'Vostok Station (Antarctica)', searchTerms: ['vostok', 'antarctica'] },


  { value: 'Arctic/Longyearbyen', label: 'Longyearbyen (Svalbard)', searchTerms: ['longyearbyen', 'svalbard', 'arctic'] },


  { value: 'Asia/Aden', label: 'Aden (Yemen)', searchTerms: ['aden', 'yemen', 'asia'] },
  { value: 'Asia/Almaty', label: 'Almaty (Kazakhstan)', searchTerms: ['almaty', 'kazakhstan', 'asia'] },
  { value: 'Asia/Amman', label: 'Amman (Jordan)', searchTerms: ['amman', 'jordan', 'asia'] },
  { value: 'Asia/Anadyr', label: 'Anadyr (Russia)', searchTerms: ['anadyr', 'russia', 'asia'] },
  { value: 'Asia/Aqtau', label: 'Aqtau (Kazakhstan)', searchTerms: ['aqtau', 'kazakhstan', 'asia'] },
  { value: 'Asia/Aqtobe', label: 'Aqtobe (Kazakhstan)', searchTerms: ['aqtobe', 'kazakhstan', 'asia'] },
  { value: 'Asia/Ashgabat', label: 'Ashgabat (Turkmenistan)', searchTerms: ['ashgabat', 'turkmenistan', 'asia'] },
  { value: 'Asia/Atyrau', label: 'Atyrau (Kazakhstan)', searchTerms: ['atyrau', 'kazakhstan', 'asia'] },
  { value: 'Asia/Baghdad', label: 'Baghdad (Iraq)', searchTerms: ['baghdad', 'iraq', 'asia'] },
  { value: 'Asia/Bahrain', label: 'Bahrain', searchTerms: ['bahrain', 'asia'] },
  { value: 'Asia/Baku', label: 'Baku (Azerbaijan)', searchTerms: ['baku', 'azerbaijan', 'asia'] },
  { value: 'Asia/Bangkok', label: 'Bangkok (Thailand)', searchTerms: ['bangkok', 'thailand', 'asia'] },
  { value: 'Asia/Barnaul', label: 'Barnaul (Russia)', searchTerms: ['barnaul', 'russia', 'asia'] },
  { value: 'Asia/Beirut', label: 'Beirut (Lebanon)', searchTerms: ['beirut', 'lebanon', 'asia'] },
  { value: 'Asia/Bishkek', label: 'Bishkek (Kyrgyzstan)', searchTerms: ['bishkek', 'kyrgyzstan', 'asia'] },
  { value: 'Asia/Brunei', label: 'Brunei', searchTerms: ['brunei', 'asia'] },
  { value: 'Asia/Chita', label: 'Chita (Russia)', searchTerms: ['chita', 'russia', 'asia'] },
  { value: 'Asia/Choibalsan', label: 'Choibalsan (Mongolia)', searchTerms: ['choibalsan', 'mongolia', 'asia'] },
  { value: 'Asia/Colombo', label: 'Colombo (Sri Lanka)', searchTerms: ['colombo', 'sri', 'lanka', 'asia'] },
  { value: 'Asia/Damascus', label: 'Damascus (Syria)', searchTerms: ['damascus', 'syria', 'asia'] },
  { value: 'Asia/Dhaka', label: 'Dhaka (Bangladesh)', searchTerms: ['dhaka', 'bangladesh', 'asia'] },
  { value: 'Asia/Dili', label: 'Dili (East Timor)', searchTerms: ['dili', 'east', 'timor', 'asia'] },
  { value: 'Asia/Dubai', label: 'Dubai (UAE)', searchTerms: ['dubai', 'uae', 'united', 'arab', 'emirates', 'asia'] },
  { value: 'Asia/Dushanbe', label: 'Dushanbe (Tajikistan)', searchTerms: ['dushanbe', 'tajikistan', 'asia'] },
  { value: 'Asia/Famagusta', label: 'Famagusta (Cyprus)', searchTerms: ['famagusta', 'cyprus', 'asia'] },
  { value: 'Asia/Gaza', label: 'Gaza (Palestine)', searchTerms: ['gaza', 'palestine', 'asia'] },
  { value: 'Asia/Hebron', label: 'Hebron (Palestine)', searchTerms: ['hebron', 'palestine', 'asia'] },
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City (Vietnam)', searchTerms: ['ho', 'chi', 'minh', 'saigon', 'vietnam', 'asia'] },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', searchTerms: ['hong', 'kong', 'asia'] },
  { value: 'Asia/Hovd', label: 'Hovd (Mongolia)', searchTerms: ['hovd', 'mongolia', 'asia'] },
  { value: 'Asia/Irkutsk', label: 'Irkutsk (Russia)', searchTerms: ['irkutsk', 'russia', 'asia'] },
  { value: 'Asia/Jakarta', label: 'Jakarta (Indonesia)', searchTerms: ['jakarta', 'indonesia', 'asia'] },
  { value: 'Asia/Jayapura', label: 'Jayapura (Indonesia)', searchTerms: ['jayapura', 'indonesia', 'asia'] },
  { value: 'Asia/Jerusalem', label: 'Jerusalem (Israel)', searchTerms: ['jerusalem', 'israel', 'asia'] },
  { value: 'Asia/Kabul', label: 'Kabul (Afghanistan)', searchTerms: ['kabul', 'afghanistan', 'asia'] },
  { value: 'Asia/Kamchatka', label: 'Kamchatka (Russia)', searchTerms: ['kamchatka', 'russia', 'asia'] },
  { value: 'Asia/Karachi', label: 'Karachi (Pakistan)', searchTerms: ['karachi', 'pakistan', 'asia'] },
  { value: 'Asia/Kathmandu', label: 'Kathmandu (Nepal)', searchTerms: ['kathmandu', 'nepal', 'asia'] },
  { value: 'Asia/Khandyga', label: 'Khandyga (Russia)', searchTerms: ['khandyga', 'russia', 'asia'] },
  { value: 'Asia/Kolkata', label: 'Kolkata (India)', searchTerms: ['kolkata', 'calcutta', 'india', 'asia'] },
  { value: 'Asia/Krasnoyarsk', label: 'Krasnoyarsk (Russia)', searchTerms: ['krasnoyarsk', 'russia', 'asia'] },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur (Malaysia)', searchTerms: ['kuala', 'lumpur', 'malaysia', 'asia'] },
  { value: 'Asia/Kuching', label: 'Kuching (Malaysia)', searchTerms: ['kuching', 'malaysia', 'asia'] },
  { value: 'Asia/Kuwait', label: 'Kuwait', searchTerms: ['kuwait', 'asia'] },
  { value: 'Asia/Macau', label: 'Macau', searchTerms: ['macau', 'macao', 'asia'] },
  { value: 'Asia/Magadan', label: 'Magadan (Russia)', searchTerms: ['magadan', 'russia', 'asia'] },
  { value: 'Asia/Makassar', label: 'Makassar (Indonesia)', searchTerms: ['makassar', 'indonesia', 'asia'] },
  { value: 'Asia/Manila', label: 'Manila (Philippines)', searchTerms: ['manila', 'philippines', 'asia'] },
  { value: 'Asia/Muscat', label: 'Muscat (Oman)', searchTerms: ['muscat', 'oman', 'asia'] },
  { value: 'Asia/Nicosia', label: 'Nicosia (Cyprus)', searchTerms: ['nicosia', 'cyprus', 'asia'] },
  { value: 'Asia/Novokuznetsk', label: 'Novokuznetsk (Russia)', searchTerms: ['novokuznetsk', 'russia', 'asia'] },
  { value: 'Asia/Novosibirsk', label: 'Novosibirsk (Russia)', searchTerms: ['novosibirsk', 'russia', 'asia'] },
  { value: 'Asia/Omsk', label: 'Omsk (Russia)', searchTerms: ['omsk', 'russia', 'asia'] },
  { value: 'Asia/Oral', label: 'Oral (Kazakhstan)', searchTerms: ['oral', 'kazakhstan', 'asia'] },
  { value: 'Asia/Phnom_Penh', label: 'Phnom Penh (Cambodia)', searchTerms: ['phnom', 'penh', 'cambodia', 'asia'] },
  { value: 'Asia/Pontianak', label: 'Pontianak (Indonesia)', searchTerms: ['pontianak', 'indonesia', 'asia'] },
  { value: 'Asia/Pyongyang', label: 'Pyongyang (North Korea)', searchTerms: ['pyongyang', 'north', 'korea', 'asia'] },
  { value: 'Asia/Qatar', label: 'Qatar', searchTerms: ['qatar', 'asia'] },
  { value: 'Asia/Qostanay', label: 'Qostanay (Kazakhstan)', searchTerms: ['qostanay', 'kazakhstan', 'asia'] },
  { value: 'Asia/Qyzylorda', label: 'Qyzylorda (Kazakhstan)', searchTerms: ['qyzylorda', 'kazakhstan', 'asia'] },
  { value: 'Asia/Riyadh', label: 'Riyadh (Saudi Arabia)', searchTerms: ['riyadh', 'saudi', 'arabia', 'asia'] },
  { value: 'Asia/Sakhalin', label: 'Sakhalin (Russia)', searchTerms: ['sakhalin', 'russia', 'asia'] },
  { value: 'Asia/Samarkand', label: 'Samarkand (Uzbekistan)', searchTerms: ['samarkand', 'uzbekistan', 'asia'] },
  { value: 'Asia/Seoul', label: 'Seoul (South Korea)', searchTerms: ['seoul', 'south', 'korea', 'asia'] },
  { value: 'Asia/Shanghai', label: 'Shanghai (China)', searchTerms: ['shanghai', 'china', 'asia'] },
  { value: 'Asia/Singapore', label: 'Singapore', searchTerms: ['singapore', 'asia'] },
  { value: 'Asia/Srednekolymsk', label: 'Srednekolymsk (Russia)', searchTerms: ['srednekolymsk', 'russia', 'asia'] },
  { value: 'Asia/Taipei', label: 'Taipei (Taiwan)', searchTerms: ['taipei', 'taiwan', 'asia'] },
  { value: 'Asia/Tashkent', label: 'Tashkent (Uzbekistan)', searchTerms: ['tashkent', 'uzbekistan', 'asia'] },
  { value: 'Asia/Tbilisi', label: 'Tbilisi (Georgia)', searchTerms: ['tbilisi', 'georgia', 'asia'] },
  { value: 'Asia/Tehran', label: 'Tehran (Iran)', searchTerms: ['tehran', 'iran', 'asia'] },
  { value: 'Asia/Thimphu', label: 'Thimphu (Bhutan)', searchTerms: ['thimphu', 'bhutan', 'asia'] },
  { value: 'Asia/Tokyo', label: 'Tokyo (Japan)', searchTerms: ['tokyo', 'japan', 'asia'] },
  { value: 'Asia/Tomsk', label: 'Tomsk (Russia)', searchTerms: ['tomsk', 'russia', 'asia'] },
  { value: 'Asia/Ulaanbaatar', label: 'Ulaanbaatar (Mongolia)', searchTerms: ['ulaanbaatar', 'mongolia', 'asia'] },
  { value: 'Asia/Urumqi', label: 'Urumqi (China)', searchTerms: ['urumqi', 'china', 'asia'] },
  { value: 'Asia/Ust-Nera', label: 'Ust-Nera (Russia)', searchTerms: ['ust', 'nera', 'russia', 'asia'] },
  { value: 'Asia/Vientiane', label: 'Vientiane (Laos)', searchTerms: ['vientiane', 'laos', 'asia'] },
  { value: 'Asia/Vladivostok', label: 'Vladivostok (Russia)', searchTerms: ['vladivostok', 'russia', 'asia'] },
  { value: 'Asia/Yakutsk', label: 'Yakutsk (Russia)', searchTerms: ['yakutsk', 'russia', 'asia'] },
  { value: 'Asia/Yangon', label: 'Yangon (Myanmar)', searchTerms: ['yangon', 'rangoon', 'myanmar', 'burma', 'asia'] },
  { value: 'Asia/Yekaterinburg', label: 'Yekaterinburg (Russia)', searchTerms: ['yekaterinburg', 'russia', 'asia'] },
  { value: 'Asia/Yerevan', label: 'Yerevan (Armenia)', searchTerms: ['yerevan', 'armenia', 'asia'] },


  { value: 'Atlantic/Azores', label: 'Azores (Portugal)', searchTerms: ['azores', 'portugal', 'atlantic'] },
  { value: 'Atlantic/Bermuda', label: 'Bermuda', searchTerms: ['bermuda', 'atlantic'] },
  { value: 'Atlantic/Canary', label: 'Canary Islands (Spain)', searchTerms: ['canary', 'islands', 'spain', 'atlantic'] },
  { value: 'Atlantic/Cape_Verde', label: 'Cape Verde', searchTerms: ['cape', 'verde', 'atlantic'] },
  { value: 'Atlantic/Faroe', label: 'Faroe Islands', searchTerms: ['faroe', 'islands', 'atlantic'] },
  { value: 'Atlantic/Madeira', label: 'Madeira (Portugal)', searchTerms: ['madeira', 'portugal', 'atlantic'] },
  { value: 'Atlantic/Reykjavik', label: 'Reykjavik (Iceland)', searchTerms: ['reykjavik', 'iceland', 'atlantic'] },
  { value: 'Atlantic/South_Georgia', label: 'South Georgia', searchTerms: ['south', 'georgia', 'atlantic'] },
  { value: 'Atlantic/St_Helena', label: 'Saint Helena', searchTerms: ['saint', 'helena', 'atlantic'] },
  { value: 'Atlantic/Stanley', label: 'Stanley (Falkland Islands)', searchTerms: ['stanley', 'falkland', 'islands', 'atlantic'] },


  { value: 'Australia/Adelaide', label: 'Adelaide (South Australia)', searchTerms: ['adelaide', 'south', 'australia'] },
  { value: 'Australia/Brisbane', label: 'Brisbane (Queensland)', searchTerms: ['brisbane', 'queensland', 'australia'] },
  { value: 'Australia/Broken_Hill', label: 'Broken Hill (New South Wales)', searchTerms: ['broken', 'hill', 'new', 'south', 'wales', 'australia'] },
  { value: 'Australia/Currie', label: 'Currie (Tasmania)', searchTerms: ['currie', 'tasmania', 'australia'] },
  { value: 'Australia/Darwin', label: 'Darwin (Northern Territory)', searchTerms: ['darwin', 'northern', 'territory', 'australia'] },
  { value: 'Australia/Eucla', label: 'Eucla (Western Australia)', searchTerms: ['eucla', 'western', 'australia'] },
  { value: 'Australia/Hobart', label: 'Hobart (Tasmania)', searchTerms: ['hobart', 'tasmania', 'australia'] },
  { value: 'Australia/Lindeman', label: 'Lindeman Island (Queensland)', searchTerms: ['lindeman', 'island', 'queensland', 'australia'] },
  { value: 'Australia/Lord_Howe', label: 'Lord Howe Island', searchTerms: ['lord', 'howe', 'island', 'australia'] },
  { value: 'Australia/Melbourne', label: 'Melbourne (Victoria)', searchTerms: ['melbourne', 'victoria', 'australia'] },
  { value: 'Australia/Perth', label: 'Perth (Western Australia)', searchTerms: ['perth', 'western', 'australia'] },
  { value: 'Australia/Sydney', label: 'Sydney (New South Wales)', searchTerms: ['sydney', 'new', 'south', 'wales', 'australia'] },


  { value: 'Europe/Amsterdam', label: 'Amsterdam (Netherlands)', searchTerms: ['amsterdam', 'netherlands', 'europe'] },
  { value: 'Europe/Andorra', label: 'Andorra', searchTerms: ['andorra', 'europe'] },
  { value: 'Europe/Astrakhan', label: 'Astrakhan (Russia)', searchTerms: ['astrakhan', 'russia', 'europe'] },
  { value: 'Europe/Athens', label: 'Athens (Greece)', searchTerms: ['athens', 'greece', 'europe'] },
  { value: 'Europe/Belgrade', label: 'Belgrade (Serbia)', searchTerms: ['belgrade', 'serbia', 'europe'] },
  { value: 'Europe/Berlin', label: 'Berlin (Germany)', searchTerms: ['berlin', 'germany', 'europe'] },
  { value: 'Europe/Bratislava', label: 'Bratislava (Slovakia)', searchTerms: ['bratislava', 'slovakia', 'europe'] },
  { value: 'Europe/Brussels', label: 'Brussels (Belgium)', searchTerms: ['brussels', 'belgium', 'europe'] },
  { value: 'Europe/Bucharest', label: 'Bucharest (Romania)', searchTerms: ['bucharest', 'romania', 'europe'] },
  { value: 'Europe/Budapest', label: 'Budapest (Hungary)', searchTerms: ['budapest', 'hungary', 'europe'] },
  { value: 'Europe/Busingen', label: 'Busingen (Germany)', searchTerms: ['busingen', 'germany', 'europe'] },
  { value: 'Europe/Chisinau', label: 'Chisinau (Moldova)', searchTerms: ['chisinau', 'moldova', 'europe'] },
  { value: 'Europe/Copenhagen', label: 'Copenhagen (Denmark)', searchTerms: ['copenhagen', 'denmark', 'europe'] },
  { value: 'Europe/Dublin', label: 'Dublin (Ireland)', searchTerms: ['dublin', 'ireland', 'europe'] },
  { value: 'Europe/Gibraltar', label: 'Gibraltar', searchTerms: ['gibraltar', 'europe'] },
  { value: 'Europe/Guernsey', label: 'Guernsey', searchTerms: ['guernsey', 'europe'] },
  { value: 'Europe/Helsinki', label: 'Helsinki (Finland)', searchTerms: ['helsinki', 'finland', 'europe'] },
  { value: 'Europe/Isle_of_Man', label: 'Isle of Man', searchTerms: ['isle', 'of', 'man', 'europe'] },
  { value: 'Europe/Istanbul', label: 'Istanbul (Turkey)', searchTerms: ['istanbul', 'turkey', 'europe'] },
  { value: 'Europe/Jersey', label: 'Jersey', searchTerms: ['jersey', 'europe'] },
  { value: 'Europe/Kaliningrad', label: 'Kaliningrad (Russia)', searchTerms: ['kaliningrad', 'russia', 'europe'] },
  { value: 'Europe/Kiev', label: 'Kiev (Ukraine)', searchTerms: ['kiev', 'kyiv', 'ukraine', 'europe'] },
  { value: 'Europe/Kirov', label: 'Kirov (Russia)', searchTerms: ['kirov', 'russia', 'europe'] },
  { value: 'Europe/Lisbon', label: 'Lisbon (Portugal)', searchTerms: ['lisbon', 'portugal', 'europe'] },
  { value: 'Europe/Ljubljana', label: 'Ljubljana (Slovenia)', searchTerms: ['ljubljana', 'slovenia', 'europe'] },
  { value: 'Europe/London', label: 'London (United Kingdom)', searchTerms: ['london', 'united', 'kingdom', 'uk', 'britain', 'europe'] },
  { value: 'Europe/Luxembourg', label: 'Luxembourg', searchTerms: ['luxembourg', 'europe'] },
  { value: 'Europe/Madrid', label: 'Madrid (Spain)', searchTerms: ['madrid', 'spain', 'europe'] },
  { value: 'Europe/Malta', label: 'Malta', searchTerms: ['malta', 'europe'] },
  { value: 'Europe/Mariehamn', label: 'Mariehamn (Finland)', searchTerms: ['mariehamn', 'finland', 'europe'] },
  { value: 'Europe/Minsk', label: 'Minsk (Belarus)', searchTerms: ['minsk', 'belarus', 'europe'] },
  { value: 'Europe/Monaco', label: 'Monaco', searchTerms: ['monaco', 'europe'] },
  { value: 'Europe/Moscow', label: 'Moscow (Russia)', searchTerms: ['moscow', 'russia', 'europe'] },
  { value: 'Europe/Oslo', label: 'Oslo (Norway)', searchTerms: ['oslo', 'norway', 'europe'] },
  { value: 'Europe/Paris', label: 'Paris (France)', searchTerms: ['paris', 'france', 'europe'] },
  { value: 'Europe/Podgorica', label: 'Podgorica (Montenegro)', searchTerms: ['podgorica', 'montenegro', 'europe'] },
  { value: 'Europe/Prague', label: 'Prague (Czech Republic)', searchTerms: ['prague', 'czech', 'republic', 'europe'] },
  { value: 'Europe/Riga', label: 'Riga (Latvia)', searchTerms: ['riga', 'latvia', 'europe'] },
  { value: 'Europe/Rome', label: 'Rome (Italy)', searchTerms: ['rome', 'italy', 'europe'] },
  { value: 'Europe/Samara', label: 'Samara (Russia)', searchTerms: ['samara', 'russia', 'europe'] },
  { value: 'Europe/San_Marino', label: 'San Marino', searchTerms: ['san', 'marino', 'europe'] },
  { value: 'Europe/Sarajevo', label: 'Sarajevo (Bosnia and Herzegovina)', searchTerms: ['sarajevo', 'bosnia', 'herzegovina', 'europe'] },
  { value: 'Europe/Saratov', label: 'Saratov (Russia)', searchTerms: ['saratov', 'russia', 'europe'] },
  { value: 'Europe/Simferopol', label: 'Simferopol (Ukraine)', searchTerms: ['simferopol', 'ukraine', 'europe'] },
  { value: 'Europe/Skopje', label: 'Skopje (North Macedonia)', searchTerms: ['skopje', 'north', 'macedonia', 'europe'] },
  { value: 'Europe/Sofia', label: 'Sofia (Bulgaria)', searchTerms: ['sofia', 'bulgaria', 'europe'] },
  { value: 'Europe/Stockholm', label: 'Stockholm (Sweden)', searchTerms: ['stockholm', 'sweden', 'europe'] },
  { value: 'Europe/Tallinn', label: 'Tallinn (Estonia)', searchTerms: ['tallinn', 'estonia', 'europe'] },
  { value: 'Europe/Tirane', label: 'Tirane (Albania)', searchTerms: ['tirane', 'albania', 'europe'] },
  { value: 'Europe/Ulyanovsk', label: 'Ulyanovsk (Russia)', searchTerms: ['ulyanovsk', 'russia', 'europe'] },
  { value: 'Europe/Uzhgorod', label: 'Uzhgorod (Ukraine)', searchTerms: ['uzhgorod', 'ukraine', 'europe'] },
  { value: 'Europe/Vaduz', label: 'Vaduz (Liechtenstein)', searchTerms: ['vaduz', 'liechtenstein', 'europe'] },
  { value: 'Europe/Vatican', label: 'Vatican City', searchTerms: ['vatican', 'city', 'europe'] },
  { value: 'Europe/Vienna', label: 'Vienna (Austria)', searchTerms: ['vienna', 'austria', 'europe'] },
  { value: 'Europe/Vilnius', label: 'Vilnius (Lithuania)', searchTerms: ['vilnius', 'lithuania', 'europe'] },
  { value: 'Europe/Volgograd', label: 'Volgograd (Russia)', searchTerms: ['volgograd', 'russia', 'europe'] },
  { value: 'Europe/Warsaw', label: 'Warsaw (Poland)', searchTerms: ['warsaw', 'poland', 'europe'] },
  { value: 'Europe/Zagreb', label: 'Zagreb (Croatia)', searchTerms: ['zagreb', 'croatia', 'europe'] },
  { value: 'Europe/Zaporozhye', label: 'Zaporozhye (Ukraine)', searchTerms: ['zaporozhye', 'ukraine', 'europe'] },
  { value: 'Europe/Zurich', label: 'Zurich (Switzerland)', searchTerms: ['zurich', 'switzerland', 'europe'] },


  { value: 'Indian/Antananarivo', label: 'Antananarivo (Madagascar)', searchTerms: ['antananarivo', 'madagascar', 'indian'] },
  { value: 'Indian/Chagos', label: 'Chagos Islands', searchTerms: ['chagos', 'islands', 'indian'] },
  { value: 'Indian/Christmas', label: 'Christmas Island', searchTerms: ['christmas', 'island', 'indian'] },
  { value: 'Indian/Cocos', label: 'Cocos Islands', searchTerms: ['cocos', 'islands', 'indian'] },
  { value: 'Indian/Comoro', label: 'Comoro Islands', searchTerms: ['comoro', 'islands', 'indian'] },
  { value: 'Indian/Kerguelen', label: 'Kerguelen Islands', searchTerms: ['kerguelen', 'islands', 'indian'] },
  { value: 'Indian/Mahe', label: 'Mahe (Seychelles)', searchTerms: ['mahe', 'seychelles', 'indian'] },
  { value: 'Indian/Maldives', label: 'Maldives', searchTerms: ['maldives', 'indian'] },
  { value: 'Indian/Mauritius', label: 'Mauritius', searchTerms: ['mauritius', 'indian'] },
  { value: 'Indian/Mayotte', label: 'Mayotte', searchTerms: ['mayotte', 'indian'] },
  { value: 'Indian/Reunion', label: 'Reunion', searchTerms: ['reunion', 'indian'] },


  { value: 'Pacific/Apia', label: 'Apia (Samoa)', searchTerms: ['apia', 'samoa', 'pacific'] },
  { value: 'Pacific/Auckland', label: 'Auckland (New Zealand)', searchTerms: ['auckland', 'new', 'zealand', 'pacific'] },
  { value: 'Pacific/Bougainville', label: 'Bougainville (Papua New Guinea)', searchTerms: ['bougainville', 'papua', 'new', 'guinea', 'pacific'] },
  { value: 'Pacific/Chatham', label: 'Chatham Islands (New Zealand)', searchTerms: ['chatham', 'islands', 'new', 'zealand', 'pacific'] },
  { value: 'Pacific/Chuuk', label: 'Chuuk (Micronesia)', searchTerms: ['chuuk', 'micronesia', 'pacific'] },
  { value: 'Pacific/Easter', label: 'Easter Island (Chile)', searchTerms: ['easter', 'island', 'chile', 'pacific'] },
  { value: 'Pacific/Efate', label: 'Efate (Vanuatu)', searchTerms: ['efate', 'vanuatu', 'pacific'] },
  { value: 'Pacific/Enderbury', label: 'Enderbury Island (Kiribati)', searchTerms: ['enderbury', 'island', 'kiribati', 'pacific'] },
  { value: 'Pacific/Fakaofo', label: 'Fakaofo (Tokelau)', searchTerms: ['fakaofo', 'tokelau', 'pacific'] },
  { value: 'Pacific/Fiji', label: 'Fiji', searchTerms: ['fiji', 'pacific'] },
  { value: 'Pacific/Funafuti', label: 'Funafuti (Tuvalu)', searchTerms: ['funafuti', 'tuvalu', 'pacific'] },
  { value: 'Pacific/Galapagos', label: 'Galapagos Islands (Ecuador)', searchTerms: ['galapagos', 'islands', 'ecuador', 'pacific'] },
  { value: 'Pacific/Gambier', label: 'Gambier Islands (French Polynesia)', searchTerms: ['gambier', 'islands', 'french', 'polynesia', 'pacific'] },
  { value: 'Pacific/Guadalcanal', label: 'Guadalcanal (Solomon Islands)', searchTerms: ['guadalcanal', 'solomon', 'islands', 'pacific'] },
  { value: 'Pacific/Guam', label: 'Guam', searchTerms: ['guam', 'pacific'] },
  { value: 'Pacific/Honolulu', label: 'Honolulu (Hawaii)', searchTerms: ['honolulu', 'hawaii', 'pacific'] },
  { value: 'Pacific/Kiritimati', label: 'Kiritimati (Kiribati)', searchTerms: ['kiritimati', 'kiribati', 'pacific'] },
  { value: 'Pacific/Kosrae', label: 'Kosrae (Micronesia)', searchTerms: ['kosrae', 'micronesia', 'pacific'] },
  { value: 'Pacific/Kwajalein', label: 'Kwajalein (Marshall Islands)', searchTerms: ['kwajalein', 'marshall', 'islands', 'pacific'] },
  { value: 'Pacific/Majuro', label: 'Majuro (Marshall Islands)', searchTerms: ['majuro', 'marshall', 'islands', 'pacific'] },
  { value: 'Pacific/Marquesas', label: 'Marquesas Islands (French Polynesia)', searchTerms: ['marquesas', 'islands', 'french', 'polynesia', 'pacific'] },
  { value: 'Pacific/Midway', label: 'Midway Atoll', searchTerms: ['midway', 'atoll', 'pacific'] },
  { value: 'Pacific/Nauru', label: 'Nauru', searchTerms: ['nauru', 'pacific'] },
  { value: 'Pacific/Niue', label: 'Niue', searchTerms: ['niue', 'pacific'] },
  { value: 'Pacific/Norfolk', label: 'Norfolk Island', searchTerms: ['norfolk', 'island', 'pacific'] },
  { value: 'Pacific/Noumea', label: 'Noumea (New Caledonia)', searchTerms: ['noumea', 'new', 'caledonia', 'pacific'] },
  { value: 'Pacific/Pago_Pago', label: 'Pago Pago (American Samoa)', searchTerms: ['pago', 'american', 'samoa', 'pacific'] },
  { value: 'Pacific/Palau', label: 'Palau', searchTerms: ['palau', 'pacific'] },
  { value: 'Pacific/Pitcairn', label: 'Pitcairn Islands', searchTerms: ['pitcairn', 'islands', 'pacific'] },
  { value: 'Pacific/Pohnpei', label: 'Pohnpei (Micronesia)', searchTerms: ['pohnpei', 'micronesia', 'pacific'] },
  { value: 'Pacific/Port_Moresby', label: 'Port Moresby (Papua New Guinea)', searchTerms: ['port', 'moresby', 'papua', 'new', 'guinea', 'pacific'] },
  { value: 'Pacific/Rarotonga', label: 'Rarotonga (Cook Islands)', searchTerms: ['rarotonga', 'cook', 'islands', 'pacific'] },
  { value: 'Pacific/Saipan', label: 'Saipan (Northern Mariana Islands)', searchTerms: ['saipan', 'northern', 'mariana', 'islands', 'pacific'] },
  { value: 'Pacific/Tahiti', label: 'Tahiti (French Polynesia)', searchTerms: ['tahiti', 'french', 'polynesia', 'pacific'] },
  { value: 'Pacific/Tarawa', label: 'Tarawa (Kiribati)', searchTerms: ['tarawa', 'kiribati', 'pacific'] },
  { value: 'Pacific/Tongatapu', label: 'Tongatapu (Tonga)', searchTerms: ['tongatapu', 'tonga', 'pacific'] },
  { value: 'Pacific/Wake', label: 'Wake Island', searchTerms: ['wake', 'island', 'pacific'] },
  { value: 'Pacific/Wallis', label: 'Wallis and Futuna', searchTerms: ['wallis', 'futuna', 'pacific'] }
];

/**
 * Get browser timezone as fallback
 * @returns Browser's detected timezone or UTC as fallback
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (error) {
    console.error('Error getting browser timezone:', error);
    return 'UTC';
  }
}

export const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  value,
  onChange,
  className,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  includeCompanyDefault = false,
  companyDefaultTimezone,
  companyDefaultLabel,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  const resolvedPlaceholder = placeholder ?? t('timezone.select_placeholder', 'Select timezone...');
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('timezone.search_placeholder', 'Search timezones...');
  const resolvedEmptyMessage = emptyMessage ?? t('timezone.not_found', 'No timezone found.');
  const resolvedCompanyDefaultLabel = companyDefaultLabel ?? t(
    'timezone.company_default',
    'Company timezone{{timezone}}',
    { timezone: companyDefaultTimezone ? ` (${companyDefaultTimezone})` : '' },
  );

  const selectedTimezone = ALL_TIMEZONES.find(tz => tz.value === value);


  const filteredTimezones = useMemo(() => {
    if (!searchValue) return ALL_TIMEZONES;

    const searchLower = searchValue.toLowerCase();
    return ALL_TIMEZONES.filter(timezone =>
      timezone.label.toLowerCase().includes(searchLower) ||
      timezone.value.toLowerCase().includes(searchLower) ||
      timezone.searchTerms.some(term => term.includes(searchLower))
    );
  }, [searchValue]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between", className)}
        >
          {!value && includeCompanyDefault
            ? resolvedCompanyDefaultLabel
            : selectedTimezone ? selectedTimezone.label : (value || resolvedPlaceholder)}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput
            placeholder={resolvedSearchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandEmpty>{resolvedEmptyMessage}</CommandEmpty>
          <CommandList className="max-h-[300px]">
            <CommandGroup>
              {includeCompanyDefault && (
                <CommandItem
                  value="__company_default__"
                  onSelect={() => {
                    onChange('');
                    setOpen(false);
                    setSearchValue('');
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === '' ? 'opacity-100' : 'opacity-0')} />
                  {resolvedCompanyDefaultLabel}
                </CommandItem>
              )}
              {filteredTimezones.map((timezone) => (
                <CommandItem
                  key={timezone.value}
                  value={timezone.value}
                  onSelect={(currentValue) => {
                    onChange(currentValue);
                    setOpen(false);
                    setSearchValue('');
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === timezone.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {timezone.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default TimezoneSelector;
