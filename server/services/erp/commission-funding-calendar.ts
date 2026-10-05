/** Cash receipts use ERP UTC timestamps; credit allocations keep journal dates.
 * Callers supply only a trusted SQL alias and parameter expression. */
export function commissionFundingDateSql(alias:string,timezoneSql:string):string {
 if(!/^[a-z]+$/.test(alias)||!/^\$\d+$/.test(timezoneSql))throw new Error('Invalid commission calendar SQL parameter');
 return `(CASE WHEN ${alias}.funding_type='receipt' THEN (${alias}.funding_date AT TIME ZONE 'UTC' AT TIME ZONE ${timezoneSql})::date ELSE ${alias}.funding_date::date END)`;
}
