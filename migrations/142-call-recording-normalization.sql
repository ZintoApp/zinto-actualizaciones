-- Normalized recording fields for call logs (Twilio vs ElevenLabs expectations)
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS recording_requested BOOLEAN,
  ADD COLUMN IF NOT EXISTS recording_audio_provider TEXT,
  ADD COLUMN IF NOT EXISTS recording_expected_from TEXT;
