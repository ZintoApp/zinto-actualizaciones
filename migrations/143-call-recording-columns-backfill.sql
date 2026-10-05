-- Backfill recording_requested / recording_audio_provider / recording_expected_from from metadata
-- and Twilio recording fields (idempotent via COALESCE)
UPDATE calls
SET
  recording_requested = COALESCE(
    recording_requested,
    CASE
      WHEN (metadata->>'recordingRequested') IN ('true', 'false') THEN (metadata->>'recordingRequested')::boolean
      WHEN (metadata->>'recordCall') = 'false' THEN false
      WHEN (metadata->>'elevenLabsNativeOutbound') = 'true' THEN true
      WHEN metadata->>'providerStack' = 'telnyx-vapi' THEN true
      WHEN metadata->>'providerStack' LIKE 'twilio%' THEN true
      WHEN recording_sid IS NOT NULL OR recording_url ILIKE '%api.twilio.com/%/Recordings/%' THEN true
      ELSE NULL
    END
  ),
  recording_audio_provider = COALESCE(
    recording_audio_provider,
    NULLIF(metadata->>'recordingAudioProvider', ''),
    CASE
      WHEN (metadata->>'recordCall') = 'false' THEN NULL
      WHEN (metadata->>'elevenLabsNativeOutbound') = 'true' THEN 'elevenlabs'
      WHEN metadata->>'providerStack' = 'telnyx-vapi' THEN NULL
      WHEN recording_sid IS NOT NULL
        OR recording_url ILIKE '%api.twilio.com/%/Recordings/%'
        OR (
          metadata->>'providerStack' LIKE 'twilio%'
          AND (metadata->>'elevenLabsNativeOutbound') IS DISTINCT FROM 'true'
        )
      THEN 'twilio'
      ELSE NULL
    END
  ),
  recording_expected_from = COALESCE(
    recording_expected_from,
    NULLIF(metadata->>'recordingExpectedFrom', ''),
    CASE
      WHEN (metadata->>'recordCall') = 'false' THEN NULL
      WHEN (metadata->>'elevenLabsNativeOutbound') = 'true' THEN 'elevenlabs'
      WHEN metadata->>'providerStack' = 'telnyx-vapi' THEN NULL
      WHEN LOWER(COALESCE(metadata->>'callType', '')) = 'ai-powered'
        AND (metadata->>'elevenLabsNativeOutbound') IS DISTINCT FROM 'true'
        AND metadata->>'providerStack' LIKE 'twilio%'
      THEN 'twilio'
      WHEN recording_sid IS NOT NULL
        OR recording_url ILIKE '%api.twilio.com/%/Recordings/%'
        OR (
          metadata->>'providerStack' LIKE 'twilio%'
          AND (metadata->>'elevenLabsNativeOutbound') IS DISTINCT FROM 'true'
        )
      THEN 'twilio'
      ELSE NULL
    END
  )
WHERE recording_requested IS NULL
   OR recording_audio_provider IS NULL
   OR recording_expected_from IS NULL;
