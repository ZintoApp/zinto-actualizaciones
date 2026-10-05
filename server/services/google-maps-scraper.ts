import { Client } from '@googlemaps/google-maps-services-js';
import { storage } from '../storage';
import { getConnection } from './channels/whatsapp';
import {
  isScrapingCancelledError,
  throwIfScrapingCancelled,
  waitForScrapingDelay,
} from './scraping-cancellation';



export const GOOGLE_MAPS_SCRAPE_MAX_RESULTS = 700;


const MAX_VARIANTS = 10; // Limit to avoid quota issues
const PER_VARIANT_CAP = 140; // ~2x single-query max for diversity
const MAX_TOTAL_QUERIES = 20; // Safety cap on Text Search calls

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const SCRAPED_CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEBSITE_FETCH_TIMEOUT_MS = 8000;
const WEBSITE_MAX_BYTES = 512_000;

function normalizeScrapedEmail(raw: string): string | null {
  let trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith('mailto:')) {
    trimmed = trimmed.slice('mailto:'.length).trim();
  }

  const queryIndex = trimmed.indexOf('?');
  if (queryIndex !== -1) {
    trimmed = trimmed.slice(0, queryIndex);
  }

  const hashIndex = trimmed.indexOf('#');
  if (hashIndex !== -1) {
    trimmed = trimmed.slice(0, hashIndex);
  }

  const match = trimmed.match(EMAIL_REGEX);
  if (!match) {
    return null;
  }

  const email = match[0];
  if (!SCRAPED_CONTACT_EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email;
}

function extractEmailFromText(text: string): string | null {
  const matches = text.match(new RegExp(EMAIL_REGEX.source, 'gi'));
  if (!matches) {
    return null;
  }

  for (const candidate of matches) {
    const normalized = normalizeScrapedEmail(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function extractEmailFromWebsiteHtml(html: string): string | null {
  for (const match of html.matchAll(/mailto:([^\s"'<>?#]+)/gi)) {
    const normalized = normalizeScrapedEmail(match[1]);
    if (normalized) {
      return normalized;
    }
  }

  return extractEmailFromText(html);
}

async function fetchEmailFromBusinessWebsite(
  websiteUrl: string,
  abortSignal?: AbortSignal
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(websiteUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), WEBSITE_FETCH_TIMEOUT_MS);

  if (abortSignal) {
    if (abortSignal.aborted) {
      clearTimeout(timeoutId);
      return null;
    }

    abortSignal.addEventListener('abort', () => timeoutController.abort(), { once: true });
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: timeoutController.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8',
        'User-Agent': 'Mozilla/5.0 (compatible; App/1.0)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('text/plain') &&
      !contentType.includes('application/xhtml')
    ) {
      return null;
    }

    const html = (await response.text()).slice(0, WEBSITE_MAX_BYTES);
    return extractEmailFromWebsiteHtml(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface ScrapedContact {
  phoneNumber: string;
  jid: string;
  profilePicture?: string;
  name?: string;
  email?: string | null;
}

interface ScrapingProgress {
  type: 'started' | 'query_expanded' | 'place_found' | 'checking_number' | 'contact_found' | 'number_invalid' | 'number_error' | 'completed' | 'error';
  message?: string;
  placeName?: string;
  phoneNumber?: string;
  contact?: ScrapedContact;
  totalChecked?: number;
  validCount?: number;
  progress?: number;
  totalToCheck?: number;
  errors?: string[];
  error?: string;
  validNumbers?: ScrapedContact[];
}

export async function scrapeGoogleMapsContactsWithProgress(
  connectionId: number,
  searchTerm: string,
  maxResults: number,
  progressCallback: (update: ScrapingProgress) => void,
  location?: string,
  abortSignal?: AbortSignal
): Promise<{
  validNumbers: ScrapedContact[];
  totalChecked: number;
  errors: string[];
}> {
  const validNumbers: ScrapedContact[] = [];
  const errors: string[] = [];
  let totalChecked = 0;
  const emitProgress = (update: ScrapingProgress) => {
    throwIfScrapingCancelled(abortSignal);
    progressCallback(update);
  };

  try {
    throwIfScrapingCancelled(abortSignal);

    
    const apiKeySetting = await storage.getAppSetting('google_maps_api_key');
    
    
    if (!apiKeySetting) {
      throw new Error('Google Maps API key not configured. Please ask a super administrator to configure it in Admin Settings > Integrations tab.');
    }


    let apiKey: string | undefined;
    
    if (typeof apiKeySetting.value === 'string') {

      apiKey = apiKeySetting.value;
    } else if (apiKeySetting.value && typeof apiKeySetting.value === 'object') {

      apiKey = (apiKeySetting.value as any).apiKey || (apiKeySetting.value as any).value;
    }


    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      console.error('Google Maps API key validation failed:', {
        hasSetting: !!apiKeySetting,
        valueType: typeof apiKeySetting.value,
        value: apiKeySetting.value,
        extractedKey: apiKey
      });
      throw new Error('Google Maps API key not configured. Please ask a super administrator to configure it in Admin Settings > Integrations tab.');
    }


    apiKey = apiKey.trim();


    const sock = getConnection(connectionId);
    if (!sock) {
      throw new Error(`No active WhatsApp connection found for ID ${connectionId}`);
    }

    if (!sock.user?.id) {
      throw new Error('WhatsApp connection is not properly authenticated');
    }


    const client = new Client({});



    const clampedMaxResults = Math.min(maxResults, GOOGLE_MAPS_SCRAPE_MAX_RESULTS);


    emitProgress({
      type: 'started',
      message: location ? 'Starting multi-query Google Maps scraping...' : 'Starting Google Maps scraping...',
      totalToCheck: clampedMaxResults
    });

    let allPlaces: any[] = [];
    const seenPlaceIds = new Set<string>(); // Deduplication by place_id
    let totalQueries = 0;

    if (location) {

      const baseQuery = searchTerm.trim();
      const variants = [
        baseQuery,
        `${baseQuery} near ${location}`,
        `${baseQuery} businesses in ${location}`,
        `${baseQuery} shops ${location}`,
        `${baseQuery} services ${location}`,
        `${baseQuery} companies ${location}`,
        `${baseQuery} restaurants ${location}`,
        `${baseQuery} stores ${location}`,
        `${baseQuery} ${location} area`,
        `${baseQuery} in ${location}`
      ].slice(0, MAX_VARIANTS);

      emitProgress({ 
        type: 'query_expanded', 
        message: `Using ${variants.length} search variants for better coverage` 
      });

      for (const variant of variants) {
        throwIfScrapingCancelled(abortSignal);
        if (totalQueries >= MAX_TOTAL_QUERIES || allPlaces.length >= clampedMaxResults) break;

        let variantPlaces: any[] = [];
        let nextPageToken: string | undefined;
        let variantQueries = 0;

        do {
          throwIfScrapingCancelled(abortSignal);
          if (totalQueries >= MAX_TOTAL_QUERIES) break;

          try {
            const searchResponse = await client.textSearch({
              params: {
                query: variant,
                key: apiKey,
                pagetoken: nextPageToken
              }
            });

            if (searchResponse.data.results) {
              const newPlaces = searchResponse.data.results.filter(place => place.place_id != null && !seenPlaceIds.has(place.place_id));
              newPlaces.forEach(place => { if (place.place_id) seenPlaceIds.add(place.place_id); });
              variantPlaces = variantPlaces.concat(newPlaces);
              totalQueries++; // Count each API call
            }

            nextPageToken = searchResponse.data.next_page_token;


            if (nextPageToken) {
              await waitForScrapingDelay(2000, abortSignal); // 2 second delay
            }

            variantQueries++;
            if (variantPlaces.length >= PER_VARIANT_CAP || variantQueries >= 3) break; // Per-variant paging cap
          } catch (error: any) {
            if (isScrapingCancelledError(error)) {
              throw error;
            }

            const errorMsg = `Error in variant "${variant}": ${error.message || 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(errorMsg, error);
            break;
          }
        } while (nextPageToken && variantPlaces.length < PER_VARIANT_CAP);

        allPlaces = allPlaces.concat(variantPlaces);
        if (allPlaces.length >= clampedMaxResults) break;
      }
    } else {

      emitProgress({ 
        type: 'query_expanded', 
        message: 'Using single search query' 
      });

      let nextPageToken: string | undefined;

      do {
        throwIfScrapingCancelled(abortSignal);
        if (totalQueries >= MAX_TOTAL_QUERIES) break;

        try {
          const searchResponse = await client.textSearch({
            params: {
              query: searchTerm,
              key: apiKey,
              pagetoken: nextPageToken
            }
          });

          if (searchResponse.data.results) {
            const newPlaces = searchResponse.data.results.filter(place => place.place_id != null && !seenPlaceIds.has(place.place_id));
            newPlaces.forEach(place => { if (place.place_id) seenPlaceIds.add(place.place_id); });
            allPlaces = allPlaces.concat(newPlaces);
            totalQueries++;
          }

          nextPageToken = searchResponse.data.next_page_token;


          if (nextPageToken) {
            await waitForScrapingDelay(2000, abortSignal); // 2 second delay
          }


          if (allPlaces.length >= clampedMaxResults) {
            break;
          }
        } catch (error: any) {
          if (isScrapingCancelledError(error)) {
            throw error;
          }

          const errorMsg = `Error searching Google Maps: ${error.message || 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg, error);
          break;
        }
      } while (nextPageToken && allPlaces.length < clampedMaxResults);
    }


    const placesMap = new Map<string, any>();
    for (const place of allPlaces) {
      if (place.place_id && !placesMap.has(place.place_id)) {
        placesMap.set(place.place_id, place);
      }
    }
    const places = Array.from(placesMap.values()).slice(0, clampedMaxResults);

    

    if (places.length === 0) {

      return { validNumbers: [], totalChecked: 0, errors };
    }




    const CONCURRENCY_LIMIT = 4; // Process 4 places in parallel
    const PER_REQUEST_DELAY_MS = 1500; // 1.5 second delay per request to respect Google/WhatsApp rate limits


    const processPlace = async (place: any, placeIndex: number): Promise<{ contact?: ScrapedContact; error?: string }> => {
      try {
        throwIfScrapingCancelled(abortSignal);

        const detailsResponse = await client.placeDetails({
          params: {
            place_id: place.place_id,
            key: apiKey,
            fields: [
              'formatted_phone_number',
              'international_phone_number',
              'name',
              'formatted_address',
              'website',
            ],
          },
        });

        const placeDetails = detailsResponse.data.result;
        const phoneNumber = placeDetails?.international_phone_number || placeDetails?.formatted_phone_number;

        if (!phoneNumber) {

          return {};
        }


        const cleanPhoneNumber = phoneNumber.replace(/[\s\-\(\)\+]/g, '');


        if (!/^\d{10,15}$/.test(cleanPhoneNumber)) {
          return { error: `Invalid phone format for ${place.name}: ${phoneNumber}` };
        }


        const jid = `${cleanPhoneNumber}@s.whatsapp.net`;
        throwIfScrapingCancelled(abortSignal);
        const results = await sock.onWhatsApp(jid);
        const result = results && results.length > 0 ? results[0] : null;

        if (result && result.exists) {
          let email: string | null = null;
          const website = placeDetails?.website;
          if (typeof website === 'string' && website.trim()) {
            email = await fetchEmailFromBusinessWebsite(website.trim(), abortSignal);
          }

          const validContact: ScrapedContact = {
            phoneNumber: cleanPhoneNumber,
            jid: result.jid || jid,
            name: placeDetails?.name || place.name || undefined,
            ...(email ? { email } : {}),
          };


          try {
            throwIfScrapingCancelled(abortSignal);
            const profilePicUrl = await sock.profilePictureUrl(result.jid || jid, 'image');
            if (profilePicUrl) {
              validContact.profilePicture = profilePicUrl;
            }
          } catch (profileError) {

          }

          return { contact: validContact };
        }

        return {};
      } catch (error: any) {
        if (isScrapingCancelledError(error)) {
          throw error;
        }

        return { error: `Error processing place ${place.name || place.place_id}: ${error.message || 'Unknown error'}` };
      }
    };


    const processWithConcurrency = async () => {
      const processingQueue: Array<{ place: any; index: number }> = places.map((place, index) => ({ place, index }));


      const processBatch = async () => {
        while (processingQueue.length > 0) {
          throwIfScrapingCancelled(abortSignal);
          const batch = processingQueue.splice(0, CONCURRENCY_LIMIT);
          const batchPromises = batch.map(async ({ place, index }) => {

            await waitForScrapingDelay(PER_REQUEST_DELAY_MS, abortSignal);
            
            const result = await processPlace(place, index);
            return { ...result, placeIndex: index };
          });

          const batchResults = await Promise.all(batchPromises);
          

          for (const result of batchResults) {
            throwIfScrapingCancelled(abortSignal);
            const place = places[result.placeIndex];
            totalChecked++;


            emitProgress({
              type: 'place_found',
              message: `Processing: ${place.name || 'Unknown place'}`,
              placeName: place.name,
              totalChecked,
              validCount: validNumbers.length,
              progress: Math.round((totalChecked / places.length) * 100)
            });

            if (result.error) {
              errors.push(result.error);
              console.error(result.error);
              

              emitProgress({
                type: 'number_error',
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / places.length) * 100),
                error: result.error
              });
            } else if (result.contact) {

              emitProgress({
                type: 'checking_number',
                phoneNumber: result.contact.phoneNumber,
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / places.length) * 100)
              });

              validNumbers.push(result.contact);


              emitProgress({
                type: 'contact_found',
                contact: result.contact,
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / places.length) * 100)
              });
            } else {

              if (place.name) {
                emitProgress({
                  type: 'checking_number',
                  phoneNumber: '',
                  totalChecked,
                  validCount: validNumbers.length,
                  progress: Math.round((totalChecked / places.length) * 100)
                });
              }
              
              emitProgress({
                type: 'number_invalid',
                totalChecked,
                validCount: validNumbers.length,
                progress: Math.round((totalChecked / places.length) * 100)
              });
            }
          }
        }
      };


      await processBatch();
    };

    await processWithConcurrency();


    return { validNumbers, totalChecked, errors };

  } catch (error: any) {
    if (isScrapingCancelledError(error)) {
      throw error;
    }

    const errorMsg = error.message || 'Unknown error occurred during scraping';
    errors.push(errorMsg);
    emitProgress({
      type: 'error',
      message: errorMsg,
      errors
    });
    throw error;
  }
}

