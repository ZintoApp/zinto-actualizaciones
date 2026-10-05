import {Router} from 'express';
import {requireAnyPermission} from '../../middleware';
import {getErpCompanyCalendar} from '../../services/erp/company-calendar';
import {REAL_ESTATE_SECTIONS} from '../../../shared/real-estate';
const router=Router();
router.get('/calendar',requireAnyPermission(REAL_ESTATE_SECTIONS.flatMap(({key})=>[`view_real_estate_${key}`,`manage_real_estate_${key}`])),async(_req,res,next)=>{
 try{res.json(await getErpCompanyCalendar(res.locals.companyId));}catch(error){next(error);}
});
export default router;
