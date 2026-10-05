import type { ComponentProps } from 'react';
import { DentalScheduleCalendar } from './dental/DentalScheduleCalendar';

/** Local scheduling presentation adapter; booking remains in each domain service. */
export function LocalScheduleCalendar({domain,...props}:ComponentProps<typeof DentalScheduleCalendar>&{domain:'dental'|'real_estate'}){
  const translate=props.t;
  return <DentalScheduleCalendar {...props} showAppointmentContext={domain==='real_estate'||props.showAppointmentContext} views={domain==='real_estate'?['day','week','month','rooms']:props.views}
    t={domain==='real_estate'?(key,fallback,values)=>key.startsWith('erp.dental.schedule.')?translate(key.replace('erp.dental.schedule.','erp.realEstate.schedule.'),fallback,values):translate(key,fallback,values):translate}/>;
}
