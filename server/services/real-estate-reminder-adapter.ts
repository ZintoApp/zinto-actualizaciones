import { getPool } from '../db';
import { realEstateSettingsSchema } from '../../shared/real-estate-reservations';
import { createDentalReminderRepository, type AppointmentReminderAdapter } from './dental-reminder-repository';
import { prepareDentalReminderMessage } from './dental-reminder-delivery';
import { DentalReminderSkip, type DentalReminderJob } from './dental-reminder-engine';
export const realEstateReminderAdapter: AppointmentReminderAdapter = {
  domain: 'real_estate', settingsKey: 'realEstateSettings',
  parseSettings: value => realEstateSettingsSchema.parse(value ?? {}).automaticReminders,
};
export const realEstateReminderRepository = createDentalReminderRepository(getPool, realEstateReminderAdapter);
export async function prepareRealEstateReminder(job: DentalReminderJob) {
  const context = await realEstateReminderRepository.loadDentalReminderContext(job);
  if (!context) throw new DentalReminderSkip('Appointment or reminder settings are no longer eligible');
  // Only company-local linked appointments; no Calendar/flow adapter or copied CRM values.
  const result = await getPool().query(`SELECT a.title,a.status,a.description,a.location,
    a.scheduled_at AT TIME ZONE 'UTC' AS "scheduledAt",a.duration_minutes AS "durationMinutes",
    COALESCE(u.full_name,u.username) AS provider
    FROM contact_appointments a JOIN real_estate_appointments e ON e.appointment_id=a.id AND e.company_id=a.company_id
    JOIN users u ON u.id=e.agent_user_id AND u.company_id=e.company_id
    WHERE a.id=$1 AND a.company_id=$2 AND a.contact_id=$3`,[job.appointmentId,job.companyId,context.appointment.contactId]);
  const appointment = result.rows[0];
  if (!appointment) throw new DentalReminderSkip('Local appointment unavailable');
  return prepareDentalReminderMessage(job,{...context,loadAppointment:async()=>appointment,
    loadDetails:async()=>({provider:appointment.provider,office:appointment.location})});
}
