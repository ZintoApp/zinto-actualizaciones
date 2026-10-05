import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Clock3,
  Filter,
  GitBranch,
  Home,
  LayoutTemplate,
  Loader2,
  Search,
  Stethoscope,
  UtensilsCrossed,
  Workflow,
  X,
} from 'lucide-react';
import { DEFAULT_RAG_CONFIG } from '@shared/rag-defaults';
import {
  ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT,
  ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT,
  ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT,
  ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT,
} from '@shared/types/node-types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/use-translation';

export interface FlowTemplateRecord {
  id: number;
  name: string;
  description: string | null;
  category: string;
  businessType: string;
  nodes: unknown[];
  edges: unknown[];
  tags: string[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const LEAD_CAPTURE_TEMPLATE: FlowTemplateRecord = {
  id: -3,
  name: 'Lead Capture Flow',
  description: 'Collect and confirm lead details, create a sales deal, and send the customer a confirmation message.',
  category: 'Sales',
  businessType: 'Standard',
  tags: ['lead capture', 'sales', 'data capture'],
  isActive: true,
  createdAt: '2026-08-24T17:22:25.009Z',
  updatedAt: '2026-08-25T18:19:44.001Z',
  nodes: [
    {
      id: 'lead-capture-trigger',
      type: 'trigger',
      position: { x: 54.32309752400545, y: -933.8243569502145 },
      width: 300,
      height: 135,
      data: {
        label: 'Start WhatsApp Lead Capture',
        channelTypes: ['whatsapp_unofficial'],
        conditionType: 'any',
        conditionValue: '',
        sessionTimeout: 30,
        sessionTimeoutUnit: 'minutes',
        enableSessionPersistence: true,
        initialMessageSourceMode: 'generic_initial_message',
        enableInitialMessageOutput: false,
      },
    },
    {
      id: 'lead-capture-details',
      type: 'data_capture',
      position: { x: 51.17232403316734, y: -727.1907215427882 },
      width: 380,
      height: 121,
      data: {
        label: 'Collect Lead Details',
        formMode: true,
        captureRules: [
          {
            id: 'full_name_rule',
            dataType: 'string',
            required: true,
            sourceType: 'custom_prompt',
            description: 'Welcome! What is your full name?',
            sourceValue: 'Welcome! What is your full name?',
            variableName: 'lead_full_name',
            validationErrorMessage: 'Please enter your full name.',
          },
          {
            id: 'phone_number_rule',
            dataType: 'phone',
            required: true,
            sourceType: 'custom_prompt',
            description: 'What is your WhatsApp or phone number, including the country code?',
            sourceValue: 'What is your WhatsApp or phone number, including the country code?',
            variableName: 'lead_phone_number',
            validationErrorMessage: 'Please enter a valid phone number, including the country code.',
          },
          {
            id: 'email_address_rule',
            dataType: 'email',
            required: true,
            sourceType: 'custom_prompt',
            description: 'What is your email address?',
            sourceValue: 'What is your email address?',
            variableName: 'lead_email_address',
            validationErrorMessage: 'Please enter a valid email address.',
          },
          {
            id: 'company_name_rule',
            dataType: 'string',
            required: true,
            sourceType: 'custom_prompt',
            description: 'What is the name of your company or business? If you do not have one, reply with “Individual”.',
            sourceValue: 'What is the name of your company or business? If you do not have one, reply with “Individual”.',
            variableName: 'lead_company_name',
            validationErrorMessage: 'Please enter your company or business name, or reply with “Individual”.',
          },
          {
            id: 'product_service_rule',
            dataType: 'string',
            required: true,
            sourceType: 'custom_prompt',
            description: 'Which product or service are you interested in?',
            sourceValue: 'Which product or service are you interested in?',
            variableName: 'lead_product_service_interest',
            validationErrorMessage: 'Please describe the product or service you are interested in.',
          },
          {
            id: 'budget_range_rule',
            dataType: 'string',
            required: true,
            sourceType: 'custom_prompt',
            description: 'What is your expected budget range? Please include the currency where possible.',
            sourceValue: 'What is your expected budget range? Please include the currency where possible.',
            variableName: 'lead_budget_range',
            validationErrorMessage: 'Please enter your expected budget range.',
          },
          {
            id: 'purchase_timeline_rule',
            dataType: 'string',
            required: true,
            sourceType: 'custom_prompt',
            description: 'When do you expect to make the purchase or begin the service?',
            sourceValue: 'When do you expect to make the purchase or begin the service?',
            variableName: 'lead_purchase_timeline',
            validationErrorMessage: 'Please enter your expected purchase timeline.',
          },
          {
            id: 'city_location_rule',
            dataType: 'string',
            required: true,
            sourceType: 'custom_prompt',
            description: 'What is your city or location?',
            sourceValue: 'What is your city or location?',
            variableName: 'lead_city_location',
            validationErrorMessage: 'Please enter your city or location.',
          },
          {
            id: 'preferred_contact_method_rule',
            dataType: 'string',
            required: true,
            sourceType: 'custom_prompt',
            description: 'What is your preferred contact method, such as WhatsApp, phone call, or email?',
            sourceValue: 'What is your preferred contact method, such as WhatsApp, phone call, or email?',
            variableName: 'lead_preferred_contact_method',
            validationErrorMessage: 'Please enter your preferred contact method.',
          },
          {
            id: 'additional_requirements_rule',
            dataType: 'string',
            required: true,
            sourceType: 'custom_prompt',
            description: 'Please share any additional requirements or notes. If there are none, reply with “None”.',
            sourceValue: 'Please share any additional requirements or notes. If there are none, reply with “None”.',
            variableName: 'lead_additional_requirements_notes',
            validationErrorMessage: 'Please enter your additional requirements or reply with “None”.',
          },
        ],
        storageScope: 'session',
        enableValidation: true,
        overwriteExisting: false,
      },
    },
    {
      id: 'lead-capture-review',
      type: 'quickreply',
      position: { x: 494.57112087775045, y: -841.3750945446205 },
      width: 380,
      height: 520,
      data: {
        label: 'Review and Confirm Lead Details',
        message: 'Please review the information you provided:\n\nFull name: {{lead_full_name}}\nWhatsApp or phone number: {{lead_phone_number}}\nEmail address: {{lead_email_address}}\nCompany or business: {{lead_company_name}}\nProduct or service of interest: {{lead_product_service_interest}}\nBudget range: {{lead_budget_range}}\nExpected purchase timeline: {{lead_purchase_timeline}}\nCity or location: {{lead_city_location}}\nPreferred contact method: {{lead_preferred_contact_method}}\nAdditional requirements or notes: {{lead_additional_requirements_notes}}\n\nSelect “Confirm, everything is correct” only if all details are accurate.',
        options: [{ text: 'Confirm, everything is correct', value: 'confirmed' }],
        goBackText: '← Go Back',
        goBackValue: 'go_back',
        enableGoBack: false,
        invalidResponseMessage: 'Please choose one of the available options.',
      },
    },
    {
      id: 'lead-capture-create-deal',
      type: 'update_pipeline_stage',
      position: { x: 950.0190475929203, y: -837.470631951287 },
      width: 480,
      height: 642,
      data: {
        type: 'update_pipeline_stage',
        label: 'Create Lead Deal',
        stageId: null,
        dealTitle: '{{lead_full_name}} - {{lead_product_service_interest}}',
        dealValue: '{{lead_budget_range}}',
        operation: 'create_deal',
        tagsToAdd: [],
        pipelineId: null,
        dealPriority: 'medium',
        tagsToRemove: [],
        errorHandling: 'stop',
        dealIdVariable: '{{contact.id}}',
        dealDescription: 'Lead name: {{lead_full_name}}\nPhone: {{lead_phone_number}}\nEmail: {{lead_email_address}}\nCompany or business: {{lead_company_name}}\nProduct or service of interest: {{lead_product_service_interest}}\nBudget range: {{lead_budget_range}}\nExpected purchase timeline: {{lead_purchase_timeline}}\nCity or location: {{lead_city_location}}\nPreferred contact method: {{lead_preferred_contact_method}}\nAdditional requirements or notes: {{lead_additional_requirements_notes}}',
        customFieldsToSet: {},
      },
    },
    {
      id: 'lead-capture-confirmation',
      type: 'message',
      position: { x: 1512.801964095697, y: -536.5698470579264 },
      width: 450,
      height: 155,
      data: {
        label: 'Text Message',
        message: 'Thank you, {{lead_full_name}}. Your inquiry has been received and added to our sales pipeline. Our team will contact you through your preferred method: {{lead_preferred_contact_method}}.',
      },
    },
  ],
  edges: [
    {
      id: 'lead-capture-edge-trigger-details',
      type: 'smoothstep',
      source: 'lead-capture-trigger',
      target: 'lead-capture-details',
      animated: true,
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
    },
    {
      id: 'lead-capture-edge-details-review',
      type: 'smoothstep',
      source: 'lead-capture-details',
      target: 'lead-capture-review',
      animated: true,
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
    },
    {
      id: 'lead-capture-edge-review-deal',
      type: 'smoothstep',
      source: 'lead-capture-review',
      target: 'lead-capture-create-deal',
      animated: true,
      sourceHandle: 'option-1',
      targetHandle: 'flow-in',
    },
    {
      id: 'lead-capture-edge-deal-confirmation',
      type: 'smoothstep',
      source: 'lead-capture-create-deal',
      target: 'lead-capture-confirmation',
      animated: true,
      sourceHandle: 'flow-out',
      targetHandle: 'flow-in',
    },
  ],
};

const RESTAURANT_ORDER_TEMPLATE: FlowTemplateRecord = {
  id: -1,
  name: 'Restaurant Order Template',
  description: 'WhatsApp restaurant ordering flow with customer details, ERP inventory checks, item quantities, notes, and final order confirmation.',
  category: 'Restaurant',
  businessType: 'Restaurant',
  tags: null,
  isActive: true,
  createdAt: '2026-05-07T15:26:42.360Z',
  updatedAt: '2026-05-08T22:29:03.867Z',
  nodes: [
    {
      id: 'trigger-node',
      data: {
        label: 'Message Trigger',
        channelTypes: [
          'whatsapp_unofficial',
        ],
        conditionType: 'any',
        conditionValue: '',
        sessionTimeout: 30,
        hardResetKeyword: 'reset',
        sessionTimeoutUnit: 'minutes',
        enableSessionPersistence: true,
      },
      type: 'trigger',
      width: 300,
      height: 155,
      dragging: false,
      position: {
        x: 182.27545787545796,
        y: -10.487912087912093,
      },
      selected: false,
      positionAbsolute: {
        x: 182.27545787545796,
        y: -10.487912087912093,
      },
    },
    {
      id: 'node_EydUqEIimC0wlGVFsLSui',
      data: {
        label: 'Ai_assistant Node',
        model: 'gpt-3.5-turbo',
        tasks: [],
        prompt: "You are a WhatsApp ordering assistant for *El Corral Fast Food*. You must strictly follow all instructions below without exception.\n\n*Tone and Style Rules*\n\n* Write like a real person texting, slightly casual and relaxed\n* Do not sound robotic, scripted, or overly formal\n* Keep messages short, clear, and natural\n* Minor imperfections are allowed, but clarity is required\n* Use emojis sparingly and only when they feel natural\n* Use *single asterisk for bold* (WhatsApp format only)\n* Do not use markdown other than single asterisk bold\n\n*Conversation Flow (MANDATORY ORDER)*\n\n1. Always start by greeting the customer\n2. Immediately ask for:\n\n   * *Name*\n   * *Delivery address*\n3. Do NOT proceed until BOTH name and address are provided\n4. Only after receiving both, ask what they want to order\n\n*Menu and Inventory Rules (STRICT)*\n\n* Only suggest or mention items that exist in the internal ERP system\n* Always check inventory before suggesting or confirming any item\n* Never invent, assume, or guess menu items\n* If an item is unavailable:\n\n  * Clearly state it is not available\n  * Offer a valid alternative only if it exists in inventory\n* Do not proceed with unavailable items\n\n*Order Handling Rules*\n\n* For every item, you MUST confirm the *quantity*\n* Never assume quantity\n* If the customer is unsure, suggest a few available/popular items casually\n* Do not be pushy or overwhelming with suggestions\n\n*Notes Step (REQUIRED)*\n\n* After listing all items, ask if they want to add *notes*\n  (examples: spice level, no onions, extra sauce)\n\n*Order Confirmation (MANDATORY BEFORE FINALIZING)*\nYou must clearly repeat the full order including:\n\n* *Name*\n* *Delivery address*\n* All *items with quantities*\n* Any *notes*\n\nThen explicitly ask for confirmation before proceeding\nDo not finalize without confirmation\n\n*Behavior Rules*\n\n* Always stay polite and patient\n* Be helpful but not overly talkative\n* Answer customer questions at any point without breaking the flow\n* Never skip steps in the process\n* Never change the order of steps\n* Never finalize an order without confirmation\n* Never continue if required information is missing\n\n*Primary Objective*\nMake the ordering process simple, accurate, and smooth while strictly following all rules above.\n",
        language: 'en',
        provider: 'openai',
        ttsVoice: 'alloy',
        enableErp: true,
        taskGroups: [],
        enableAudio: false,
        enableImage: false,
        erpCurrency: 'PKR',
        stopKeyword: 'stop',
        ttsProvider: 'openai',
        historyLimit: 12,
        enableHistory: true,
        elevenLabsModel: 'eleven_multilingual_v2',
        elevenLabsStyle: 0,
        maxOutputTokens: 500,
        calendarTimeZone: 'Asia/Karachi',
        credentialSource: 'auto',
        exitOutputHandle: 'ai-stopped',
        maxAudioDuration: 30,
        calendarFunctions: [],
        elevenLabsVoiceId: 'JaagUurP1dmW3WscoJ79',
        erpIncludePdfLink: true,
        erpProductImageSendWhen: ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT,
        erpProductImageMultiMatchMode: ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT,
        erpProductImageMaxPerProduct: ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT,
        erpProductImageCaptionMode: ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT,
        googleCalendarId: 'primary',
        targetAgentUserId: null,
        bookableAgentUserIds: [],
        voiceResponseMode: 'voice_only',
        assignmentStrategy: '',
        enableTextToSpeech: false,
        enableZohoCalendar: false,
        erpMessageTemplate: 'Aap ka order place hogya janab',
        elevenLabsStability: 0.5,
        enableTaskExecution: false,
        knowledgeBaseConfig: {
          maxRetrievedChunks: DEFAULT_RAG_CONFIG.maxRetrievedChunks,
          similarityThreshold: DEFAULT_RAG_CONFIG.similarityThreshold,
          contextPosition: DEFAULT_RAG_CONFIG.contextPosition,
          contextTemplate: DEFAULT_RAG_CONFIG.contextTemplate,
          greetingAcknowledgementExpressions:
            DEFAULT_RAG_CONFIG.greetingAcknowledgementExpressions,
          vectorDatabase: DEFAULT_RAG_CONFIG.vectorDatabase,
        },
        calendarAdvancedMode: true,
        enableGoogleCalendar: false,
        knowledgeBaseEnabled: false,
        zohoCalendarTimeZone: 'Asia/Karachi',
        calendarBufferMinutes: 0,
        calendarBusinessHours: {
          end: '17:00',
          start: '09:00',
        },
        enableSessionTakeover: true,
        zohoCalendarFunctions: [],
        calendarDefaultDuration: 60,
        calendarAdvancedSettings: {
          offDays: [
            0,
            6,
          ],
          weeklySchedule: [
            {
              dayName: 'Sunday',
              enabled: false,
              endTime: '17:00',
              dayIndex: 0,
              startTime: '09:00',
            },
            {
              dayName: 'Monday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 1,
              startTime: '09:00',
            },
            {
              dayName: 'Tuesday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 2,
              startTime: '09:00',
            },
            {
              dayName: 'Wednesday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 3,
              startTime: '09:00',
            },
            {
              dayName: 'Thursday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 4,
              startTime: '09:00',
            },
            {
              dayName: 'Friday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 5,
              startTime: '09:00',
            },
            {
              dayName: 'Saturday',
              enabled: false,
              endTime: '17:00',
              dayIndex: 6,
              startTime: '09:00',
            },
          ],
        },
        zohoCalendarAdvancedMode: true,
        elevenLabsEnableAudioTags: false,
        elevenLabsPromptInfluence: 0.5,
        elevenLabsSimilarityBoost: 0.75,
        elevenLabsUseSpeakerBoost: true,
        zohoCalendarBusinessHours: {
          end: '17:00',
          start: '09:00',
        },
        zohoCalendarDefaultDuration: 60,
        zohoCalendarAdvancedSettings: {
          offDays: [
            0,
            6,
          ],
          weeklySchedule: [
            {
              dayName: 'Sunday',
              enabled: false,
              endTime: '17:00',
              dayIndex: 0,
              startTime: '09:00',
            },
            {
              dayName: 'Monday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 1,
              startTime: '09:00',
            },
            {
              dayName: 'Tuesday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 2,
              startTime: '09:00',
            },
            {
              dayName: 'Wednesday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 3,
              startTime: '09:00',
            },
            {
              dayName: 'Thursday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 4,
              startTime: '09:00',
            },
            {
              dayName: 'Friday',
              enabled: true,
              endTime: '17:00',
              dayIndex: 5,
              startTime: '09:00',
            },
            {
              dayName: 'Saturday',
              enabled: false,
              endTime: '17:00',
              dayIndex: 6,
              startTime: '09:00',
            },
          ],
        },
        elevenLabsAudioTagsInstructions: 'Use [excited] when discussing features, [whispers] for confidential information, [pause] before important points',
      },
      type: 'ai_assistant',
      width: 550,
      height: 2037,
      dragging: false,
      position: {
        x: 250,
        y: 200,
      },
      selected: true,
      positionAbsolute: {
        x: 250,
        y: 200,
      },
    },
  ],
  edges: [
    {
      id: 'edge-trigger-node-node_EydUqEIimC0wlGVFsLSui',
      type: 'smoothstep',
      source: 'trigger-node',
      target: 'node_EydUqEIimC0wlGVFsLSui',
      animated: true,
      targetHandle: 'flow-in',
    },
  ],
};

const DENTAL_ART_PLUSS_ASSISTANT_PROMPT = `You are *Verónica*, the administrative and patient-support representative for *Dental Art Pluss IPS* on WhatsApp. Follow every rule below without exception.

*Language*
* Default to Spanish (Colombia).
* If the patient writes in English, reply in English for that conversation (or that message thread).
* Detect language from the patient's messages; do not ask which language they prefer unless unclear.

*Tone and Style*
* Write like a real person texting: warm, clear, professional, never robotic.
* Keep messages short and easy to read on WhatsApp.
* Use *single asterisk bold* only (WhatsApp). No other markdown.
* Use emojis sparingly and only when natural.
* Never give medical diagnoses. For urgent pain, swelling, bleeding, or trauma, advise seeking care promptly and offer to book the soonest suitable slot.

*Clinic identity*
* Name: Dental Art Pluss IPS
* Address: Calle 25 # 15-05 esquina, diagonal a la entrada de urgencias del Hospital Central
* Email: admin@dentalartpluss.com
* Website: www.dentalartpluss.com
* WhatsApp support: available 24/7 for messaging (in-person visits only during clinic hours)

*In-person hours (guidance — live slots always come from booking tools)*
* Monday to Friday: 8:00 a.m.–12:00 p.m. and 2:00–5:00 p.m.
* Closed: Saturdays, Sundays, lunch 12:00–1:59 p.m., and blocked dates.
* Blocked dates 2026 (entire IPS): August 7, August 17, October 12, November 3, November 17, December 8, December 25.

*Staff / specialties (guidance for routing — book only people returned by tools)*
* Verónica: administrative / patient support (you). You do not provide clinical care.
* Dr. Juan Carlos González: oral / maxillofacial surgery and exodontics — typically Tuesday 2:00–4:20 p.m., Thursday 8:00–11:00 a.m. (max ~20 patients per session when configured).
* Dr. Fabián Martínez: endodontics — typically Wednesday 8:00 a.m.–12:00 p.m., Friday 2:00–5:00 p.m.
* Dra. Jaissel Pinedo: general dentistry — general IPS schedule; available from August 10, 2026.
* Orthodontics: initial evaluation is free; follow-up appointments are handled by the orthodontics team (do not invent a named doctor).
* Pediatric dentistry: no specific doctor named — use bookable people from tools when available.

*Services*
* Example areas the clinic offers: oral hygiene, operative dentistry, periodontics, oral rehabilitation, prosthetics, implantology, dental aesthetics, oral radiology, pediatric dentistry, orthodontics, endodontics, oral surgery / exodontics, general dentistry.
* NEVER invent service names, prices, durations, or availability.
* For service details and pricing, use ERP tools (search/share products of type service).
* For booking, ONLY use services from the dental booking catalog via select_booking_service. If a service is not bookable, say so and offer a valid alternative from the catalog.

*Proteger / referral (formerly Cajacopi)*
* Patients referred by Proteger need: authorized referral/order, authorization, medical record, ID, and complete readable PDF documents.
* Tell them to email documents to admin@dentalartpluss.com.
* Do NOT block WhatsApp booking while documents are pending. When booking, include a short note in the appointment description that Proteger documents are pending by email.

*Mandatory booking intake (in order)*
1. Greet the patient as Verónica from Dental Art Pluss IPS.
2. Collect *full name* and *cédula / document ID*. Do not proceed to booking tools until both are provided.
3. Clarify the visit type / service. Call select_booking_service (use ERP search first if they are unsure what exists).
4. If multiple specialists match, call list_bookable_people and/or select_booking_person. If only one matches or patient has no preference when allowed, proceed with the eligible specialist from tools.
5. Call check_availability for the requested date range. Present only real returned slots. Never invent open/full days.
6. When the patient picks a slot, repeat a clear summary: name, ID, service, specialist, date/time, location. Ask for explicit confirmation.
7. Only after confirmation, call book_appointment. Put name + ID (and Proteger pending note if relevant) in the title/description as appropriate.

*Cancel and reschedule (self-serve)*
* Use list_my_appointments for this contact only. Never discuss other patients' appointments.
* Cancel: confirm the appointment, then cancel with the appointment id from tools.
* Reschedule: cancel (or follow tool results) then run the booking flow again for a new slot.
* Always confirm before canceling. Encourage as much notice as possible for same-day changes.

*Tool rules (STRICT)*
* Live availability and booking authority come ONLY from local dental booking tools — never Google Calendar, never guessed August calendars.
* Typical order: select_booking_service → list_bookable_people / select_booking_person → check_availability → book_appointment.
* Prefer list_my_appointments over listing the whole clinic calendar.
* If tools say no services/slots/specialists are configured, explain politely that booking is temporarily unavailable and suggest contacting admin@dentalartpluss.com.

*Behavior*
* Stay polite and patient. Answer FAQs (hours, address, services, Proteger) anytime without breaking privacy rules.
* Never skip required intake steps before booking.
* Never finalize a booking without explicit confirmation.
* Primary objective: make appointment booking simple, accurate, and trustworthy while using ERP + local dental schedule only.
`;

const DENTAL_WEEKLY_SCHEDULE = [
  {
    dayName: 'Sunday',
    enabled: false,
    endTime: '17:00',
    dayIndex: 0,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Monday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 1,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Tuesday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 2,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Wednesday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 3,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Thursday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 4,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Friday',
    enabled: true,
    endTime: '17:00',
    dayIndex: 5,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
  {
    dayName: 'Saturday',
    enabled: false,
    endTime: '17:00',
    dayIndex: 6,
    startTime: '08:00',
    breaks: [{ startTime: '12:00', endTime: '14:00' }],
  },
];

const DENTAL_APPOINTMENT_TEMPLATE: FlowTemplateRecord = {
  id: -2,
  name: 'Dental Appointment Template',
  description:
    'WhatsApp dental appointment flow for Dental Art Pluss IPS: Verónica books via local ERP dental schedule, shares ERP service details, and supports cancel/reschedule.',
  category: 'Healthcare',
  businessType: 'Dental',
  tags: null,
  isActive: true,
  createdAt: '2026-08-12T00:00:00.000Z',
  updatedAt: '2026-08-12T00:00:00.000Z',
  nodes: [
    {
      id: 'trigger-node',
      data: {
        label: 'Message Trigger',
        channelTypes: ['whatsapp_unofficial'],
        conditionType: 'any',
        conditionValue: '',
        sessionTimeout: 30,
        hardResetKeyword: 'reset',
        sessionTimeoutUnit: 'minutes',
        enableSessionPersistence: true,
      },
      type: 'trigger',
      width: 300,
      height: 155,
      dragging: false,
      position: {
        x: 182.27545787545796,
        y: -10.487912087912093,
      },
      selected: false,
      positionAbsolute: {
        x: 182.27545787545796,
        y: -10.487912087912093,
      },
    },
    {
      id: 'node_dental_art_pluss_ai',
      data: {
        label: 'Ai_assistant Node',
        model: 'gpt-3.5-turbo',
        tasks: [],
        prompt: DENTAL_ART_PLUSS_ASSISTANT_PROMPT,
        language: 'es',
        provider: 'openai',
        ttsVoice: 'alloy',
        enableErp: true,
        enableLocalDentalBooking: true,
        taskGroups: [],
        enableAudio: false,
        enableImage: false,
        erpCurrency: 'COP',
        stopKeyword: 'stop',
        ttsProvider: 'openai',
        historyLimit: 12,
        enableHistory: true,
        elevenLabsModel: 'eleven_multilingual_v2',
        elevenLabsStyle: 0,
        maxOutputTokens: 500,
        calendarTimeZone: 'America/Bogota',
        credentialSource: 'auto',
        exitOutputHandle: 'ai-stopped',
        maxAudioDuration: 30,
        calendarFunctions: [],
        elevenLabsVoiceId: 'JaagUurP1dmW3WscoJ79',
        erpIncludePdfLink: true,
        erpProductImageSendWhen: ERP_PRODUCT_IMAGE_SEND_WHEN_DEFAULT,
        erpProductImageMultiMatchMode: ERP_PRODUCT_IMAGE_MULTI_MATCH_MODE_DEFAULT,
        erpProductImageMaxPerProduct: ERP_PRODUCT_IMAGE_MAX_PER_PRODUCT_DEFAULT,
        erpProductImageCaptionMode: ERP_PRODUCT_IMAGE_CAPTION_MODE_DEFAULT,
        googleCalendarId: 'primary',
        targetAgentUserId: null,
        bookableAgentUserIds: [],
        voiceResponseMode: 'voice_only',
        assignmentStrategy: '',
        enableTextToSpeech: false,
        enableZohoCalendar: false,
        erpMessageTemplate: 'Tu cita ha sido registrada. ¡Te esperamos en Dental Art Pluss IPS!',
        elevenLabsStability: 0.5,
        enableTaskExecution: false,
        knowledgeBaseConfig: {
          maxRetrievedChunks: DEFAULT_RAG_CONFIG.maxRetrievedChunks,
          similarityThreshold: DEFAULT_RAG_CONFIG.similarityThreshold,
          contextPosition: DEFAULT_RAG_CONFIG.contextPosition,
          contextTemplate: DEFAULT_RAG_CONFIG.contextTemplate,
          greetingAcknowledgementExpressions:
            DEFAULT_RAG_CONFIG.greetingAcknowledgementExpressions,
          vectorDatabase: DEFAULT_RAG_CONFIG.vectorDatabase,
        },
        calendarAdvancedMode: true,
        enableGoogleCalendar: false,
        knowledgeBaseEnabled: false,
        zohoCalendarTimeZone: 'America/Bogota',
        calendarBufferMinutes: 0,
        calendarBusinessHours: {
          end: '17:00',
          start: '08:00',
        },
        enableSessionTakeover: true,
        zohoCalendarFunctions: [],
        calendarDefaultDuration: 60,
        calendarAdvancedSettings: {
          offDays: [0, 6],
          weeklySchedule: DENTAL_WEEKLY_SCHEDULE,
        },
        zohoCalendarAdvancedMode: true,
        elevenLabsEnableAudioTags: false,
        elevenLabsPromptInfluence: 0.5,
        elevenLabsSimilarityBoost: 0.75,
        elevenLabsUseSpeakerBoost: true,
        zohoCalendarBusinessHours: {
          end: '17:00',
          start: '08:00',
        },
        zohoCalendarDefaultDuration: 60,
        zohoCalendarAdvancedSettings: {
          offDays: [0, 6],
          weeklySchedule: DENTAL_WEEKLY_SCHEDULE,
        },
        elevenLabsAudioTagsInstructions:
          'Use [excited] when discussing features, [whispers] for confidential information, [pause] before important points',
      },
      type: 'ai_assistant',
      width: 550,
      height: 2037,
      dragging: false,
      position: {
        x: 250,
        y: 200,
      },
      selected: true,
      positionAbsolute: {
        x: 250,
        y: 200,
      },
    },
  ],
  edges: [
    {
      id: 'edge-trigger-node-node_dental_art_pluss_ai',
      type: 'smoothstep',
      source: 'trigger-node',
      target: 'node_dental_art_pluss_ai',
      animated: true,
      targetHandle: 'flow-in',
    },
  ],
};

/** Shape passed to onApplyTemplate: nodes, edges, title for the existing apply handler */
export interface FlowTemplateSuggestion {
  nodes: unknown[];
  edges: unknown[];
  title: string;
}

interface FlowTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyTemplate: (suggestion: FlowTemplateSuggestion) => void;
}

const TEMPLATE_SETUP_MINUTES: Record<string, number> = {
  'Lead Capture Flow': 5,
  'Restaurant Order Template': 7,
  'Dental Appointment Template': 6,
  'Real Estate Flow': 6,
};

function getTemplatePresentation(template: FlowTemplateRecord) {
  const identity = `${template.name} ${template.category} ${template.businessType}`.toLowerCase();

  if (identity.includes('restaurant')) {
    return {
      Icon: UtensilsCrossed,
      iconClass: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
      badgeClass: 'border-emerald-400/20 bg-emerald-500/15 text-emerald-300',
      buttonClass: 'border-emerald-300/40 bg-emerald-600/80 hover:bg-emerald-500',
      glowClass: 'from-emerald-500/[0.08]',
    };
  }

  if (identity.includes('dental') || identity.includes('health')) {
    return {
      Icon: Stethoscope,
      iconClass: 'border-blue-400/35 bg-blue-500/10 text-blue-300',
      badgeClass: 'border-blue-400/20 bg-blue-500/15 text-blue-300',
      buttonClass: 'border-blue-300/40 bg-blue-600/80 hover:bg-blue-500',
      glowClass: 'from-blue-500/[0.08]',
    };
  }

  if (identity.includes('real estate') || identity.includes('property')) {
    return {
      Icon: Home,
      iconClass: 'border-orange-400/35 bg-orange-500/10 text-orange-300',
      badgeClass: 'border-orange-400/20 bg-orange-500/15 text-orange-300',
      buttonClass: 'border-orange-300/40 bg-orange-600/80 hover:bg-orange-500',
      glowClass: 'from-orange-500/[0.08]',
    };
  }

  if (identity.includes('lead') || identity.includes('sales')) {
    return {
      Icon: Filter,
      iconClass: 'border-violet-400/35 bg-violet-500/10 text-violet-300',
      badgeClass: 'border-violet-400/20 bg-violet-500/15 text-violet-300',
      buttonClass: 'border-violet-300/40 bg-violet-600/80 hover:bg-violet-500',
      glowClass: 'from-violet-500/[0.08]',
    };
  }

  return {
    Icon: Workflow,
    iconClass: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-300',
    badgeClass: 'border-cyan-400/20 bg-cyan-500/15 text-cyan-300',
    buttonClass: 'border-cyan-300/40 bg-cyan-600/80 hover:bg-cyan-500',
    glowClass: 'from-cyan-500/[0.08]',
  };
}

export function FlowTemplatesModal({
  isOpen,
  onClose,
  onApplyTemplate,
}: FlowTemplatesModalProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = React.useState('');
  const { data: templates = [], isLoading, error } = useQuery<FlowTemplateRecord[]>({
    queryKey: ['/api/flow-templates'],
    queryFn: async () => {
      const res = await fetch('/api/flow-templates');
      if (!res.ok) throw new Error('Failed to load flow templates');
      return res.json();
    },
    enabled: isOpen,
  });
  const visibleTemplates = [
    LEAD_CAPTURE_TEMPLATE,
    RESTAURANT_ORDER_TEMPLATE,
    DENTAL_APPOINTMENT_TEMPLATE,
    ...templates.filter(
      (template) =>
        template.name !== 'AI Assistant with Memory' &&
        template.businessType !== 'dental_clinic' &&
        template.name !== 'Dental Clinic Flow' &&
        template.name !== 'Cloth Shop Flow' &&
        template.name !== 'Flower Shop Flow',
    ),
  ];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredTemplates = normalizedSearch
    ? visibleTemplates.filter((template) =>
        [template.name, template.description, template.category, template.businessType, ...(template.tags ?? [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
      )
    : visibleTemplates;

  const handleApply = (template: FlowTemplateRecord) => {
    onApplyTemplate({
      nodes: Array.isArray(template.nodes) ? template.nodes : [],
      edges: Array.isArray(template.edges) ? template.edges : [],
      title: template.name,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-tour="components-flow-builder-flowtemplatesmodal.dialogcontent.flow_builder.templates.title"
        contentNoScroll
        showCloseButton={false}
        className="h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden border-white/10 bg-[#08111f] text-slate-100 shadow-[0_28px_100px_rgba(0,0,0,0.65)] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_88%_4%,rgba(37,99,235,0.16),transparent_32%),radial-gradient(circle_at_12%_0%,rgba(148,163,184,0.09),transparent_30%)] [&>div]:p-4 [&>div]:pb-3 sm:[&>div]:p-5 sm:[&>div]:pb-4"
      >
        <DialogClose asChild>
          <button data-tour="components-flow-builder-flowtemplatesmodal.button.common.close"
            type="button"
            aria-label={t('common.close', 'Close')}
            className="absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-red-300/20 bg-red-500/90 text-white shadow-lg transition hover:scale-105 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-300 sm:right-0 sm:top-0 sm:translate-x-1/3 sm:-translate-y-1/3"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogClose>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <DialogHeader className="gap-3 border-b border-white/10 pb-4">
            <DialogTitle className="flex items-center gap-2.5 text-left text-xl font-semibold tracking-tight text-white sm:text-2xl">
              <LayoutTemplate className="h-6 w-6" />
              {t('flow_builder.templates.title', 'Flow Templates')}
            </DialogTitle>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <DialogDescription className="max-w-lg text-left text-sm leading-5 text-slate-400">
                {t('flow_builder.templates.description', 'Choose a template to apply to your flow. It will replace the current nodes and edges.')}
              </DialogDescription>
              <div className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input data-tour="components-flow-builder-flowtemplatesmodal.input.flow_builder.templates.search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('flow_builder.templates.search', 'Search templates...')}
                  aria-label={t('flow_builder.templates.search', 'Search templates...')}
                  className="h-9 border-white/15 bg-black/15 pl-9 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:ring-blue-400/50"
                />
              </div>
            </div>
          </DialogHeader>

          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2 [scrollbar-color:rgba(148,163,184,0.55)_rgba(255,255,255,0.06)] [scrollbar-width:thin]">
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('flow_builder.templates.loading', 'Loading more templates...')}
              </div>
            )}
            {error && (
              <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {t('flow_builder.templates.load_error', 'Failed to load additional templates')}
              </p>
            )}
            {filteredTemplates.length === 0 && (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.025] text-center">
                <Search className="mb-3 h-8 w-8 text-slate-500" />
                <p className="text-sm font-medium text-slate-300">
                  {t('flow_builder.templates.no_templates', 'No templates found.')}
                </p>
              </div>
            )}
            {filteredTemplates.map((template) => {
              const presentation = getTemplatePresentation(template);
              const TemplateIcon = presentation.Icon;
              const nodeCount = Array.isArray(template.nodes) ? template.nodes.length : 0;
              const connectionCount = Array.isArray(template.edges) ? template.edges.length : 0;
              const setupMinutes = TEMPLATE_SETUP_MINUTES[template.name] ?? Math.max(4, Math.ceil(nodeCount * 0.8));

              return (
                <article
                  key={template.id}
                  className={`relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-r ${presentation.glowClass} via-slate-950/45 to-slate-950/20 p-3.5 sm:p-4`}
                >
                  <div className="grid items-center gap-3 md:grid-cols-[56px_minmax(0,1fr)_auto]">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-lg border ${presentation.iconClass} shadow-inner`}>
                      <TemplateIcon className="h-6 w-6" strokeWidth={1.8} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold tracking-tight text-white sm:text-lg">{template.name}</h3>
                        <Badge className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${presentation.badgeClass}`}>
                          {template.category}
                        </Badge>
                      </div>
                      {template.description && (
                        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">
                          {template.description}
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
                          <Workflow className="h-3 w-3" />
                          {nodeCount} {t('flow_builder.templates.nodes', 'Nodes')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
                          <GitBranch className="h-3 w-3" />
                          {connectionCount} {t('flow_builder.templates.connections', 'Connections')}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-300">
                          <Clock3 className="h-3 w-3" />
                          {setupMinutes} {t('flow_builder.templates.minutes_setup', 'mins setup')}
                        </span>
                      </div>
                    </div>

                    <Button data-tour="components-flow-builder-flowtemplatesmodal.button.flow_builder.templates.apply"
                      size="sm"
                      onClick={() => handleApply(template)}
                      className={`h-9 min-w-36 justify-between gap-3 border px-4 text-sm font-semibold text-white shadow-md ${presentation.buttonClass}`}
                    >
                      {t('flow_builder.templates.apply', 'Apply Template')}
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
