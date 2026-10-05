import { Router, type RequestHandler } from 'express';
import type { User } from '@shared/schema';
import {
  normalizeSidebarMenuOrder,
  sidebarMenuOrderUpdateSchema,
} from '@shared/sidebar-menu';

export type SidebarMenuPreferenceStorage = {
  updateUserSidebarMenuOrder(id: number, itemOrder: string[]): Promise<User>;
};

export function createSidebarMenuOrderRouter(
  preferenceStorage: SidebarMenuPreferenceStorage,
  authenticate: RequestHandler,
) {
  const router = Router();

  router.get('/', authenticate, (req, res) => {
    const user = req.user as User;
    res.json({ itemOrder: normalizeSidebarMenuOrder(user.sidebarMenuOrder) });
  });

  router.put('/', authenticate, async (req, res) => {
    const parsed = sidebarMenuOrderUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid sidebar menu order',
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    try {
      const user = req.user as User;
      const updatedUser = await preferenceStorage.updateUserSidebarMenuOrder(user.id, parsed.data.itemOrder);
      res.json({ itemOrder: normalizeSidebarMenuOrder(updatedUser.sidebarMenuOrder) });
    } catch (error) {
      console.error('Error updating sidebar menu order:', error);
      res.status(500).json({ message: 'Failed to update sidebar menu order' });
    }
  });

  return router;
}
