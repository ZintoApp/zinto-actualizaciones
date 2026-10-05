import { storage } from '../storage';
import { getUserPermissions } from '../middleware';
import { PERMISSIONS } from '../../shared/schema';

export async function requireMediaConversation(user: any, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw Object.assign(new Error('Invalid conversation ID'), { status: 400 });
  const conversation = await storage.getConversation(id);
  if (!user || !conversation || (!user.isSuperAdmin && conversation.companyId !== user.companyId)) {
    throw Object.assign(new Error('Conversation not found'), { status: 404 });
  }
  if (!user.isSuperAdmin) {
    const permissions = await getUserPermissions(user);
    if (!permissions[PERMISSIONS.VIEW_ALL_CONVERSATIONS] &&
        !(permissions[PERMISSIONS.VIEW_ASSIGNED_CONVERSATIONS] && conversation.assignedToUserId === user.id)) {
      throw Object.assign(new Error('Conversation not found'), { status: 404 });
    }
  }
  if (conversation.isGroup || conversation.groupJid) {
    const setting = await storage.getCompanySetting(conversation.companyId!, 'inbox_show_group_chats');
    if (setting?.value !== true || !['whatsapp', 'whatsapp_unofficial'].includes(conversation.channelType)) {
      throw Object.assign(new Error('Group conversation unavailable'), { status: 403 });
    }
  }
  return conversation;
}
