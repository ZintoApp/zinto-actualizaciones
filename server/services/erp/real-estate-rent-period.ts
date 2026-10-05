import {calendarDateToDate} from '../../../shared/date-format';
import {erpMinorUnits} from '../../../shared/erp-carrying-amount';
import {prorateErpDecimal} from './decimal-math';

/** Same inclusive actual-day lease period for generation and forecasts. */
export function calculateLeaseRentPeriod(start:string,end:string,monthlyAmount:string,dueDay:number,period:string,digits:number){
 calendarDateToDate(start);calendarDateToDate(end);
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||end<start)throw new Error('Choose a valid lease rent period');
 if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31)throw new Error('Choose a valid rent due day');
 erpMinorUnits(monthlyAmount,digits);
 const [year,month]=period.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const first=`${period}-01`,last=`${period}-${String(days).padStart(2,'0')}`;
 if(first>end||last<start)throw new Error('Rent period is outside the lease');
 const issueDate=start>first?start:first,periodEnd=end<last?end:last;
 const chargedDays=Math.round((calendarDateToDate(periodEnd).getTime()-calendarDateToDate(issueDate).getTime())/86400000)+1;
 const amount=prorateErpDecimal(monthlyAmount,String(chargedDays),String(days),digits);
 const contractualDue=`${period}-${String(Math.min(days,dueDay)).padStart(2,'0')}`;
 return {amount,issueDate,dueDate:contractualDue<issueDate?issueDate:contractualDue,periodEnd,chargedDays,days};
}
