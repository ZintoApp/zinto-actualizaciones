import {storage,ErpValidationError} from '../../storage';
import {normalizeTimezone,validateTimezone} from '../../utils/timezone';
import {getZonedDateTimeParts} from '../../../shared/utils/agent-schedule';

/** Existing ERP timezone setting determines operational calendar dates.
 * Unconfigured companies retain the established UTC default; invalid saved
 * configuration is surfaced before it can select the wrong effective period. */
export async function getErpCompanyCalendar(companyId:number,at=new Date()){
 const configured=(await storage.getCompanySetting(companyId,'defaultTimezone'))?.value;
 const timezone=configured==null?'UTC':typeof configured==='string'?normalizeTimezone(configured):'';
 if(!timezone||!validateTimezone(timezone))throw new ErpValidationError('Configure a valid ERP company timezone');
 return {timezone,today:getZonedDateTimeParts(at,timezone).dateKey};
}
