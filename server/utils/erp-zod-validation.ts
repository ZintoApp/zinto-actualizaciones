import type { Response } from 'express';
import type { ZodError } from 'zod';

type FlattenedZodIssue = {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
};

function flattenedZodErrorParts(details: FlattenedZodIssue): string[] {
  const parts: string[] = [...details.formErrors];
  for (const [field, msgs] of Object.entries(details.fieldErrors)) {
    if (msgs?.length) {
      parts.push(`${field}: ${msgs.join('; ')}`);
    }
  }
  return parts;
}

/** Response helper for ERP routes — keeps `details` as flattened Zod output for clients. */
export function sendValidationError(res: Response, error: ZodError) {
  const details = error.flatten() as FlattenedZodIssue;
  const parts = flattenedZodErrorParts(details);
  const errorMsg = parts.length ? `Validation failed: ${parts.join(', ')}` : 'Validation failed';
  return res.status(400).json({
    success: false,
    error: errorMsg,
    details,
  });
}
