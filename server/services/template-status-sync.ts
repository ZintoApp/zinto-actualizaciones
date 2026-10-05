import { db } from '../db';
import { campaignTemplates, channelConnections } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import axios from 'axios';
import { logger } from '../utils/logger';

const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com';
const WHATSAPP_API_VERSION = 'v23.0';


const SYNC_INTERVAL = 5 * 60 * 1000;

/**
 * Fetch template status from WhatsApp API
 */
async function fetchTemplateStatus(
  templateId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const url = `${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${templateId}?fields=id,name,status,category,language`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      timeout: 10000
    });

    if (response.data && response.data.status) {
      return response.data.status.toLowerCase();
    }

    return null;
  } catch (error: any) {
    logger.error('template-status-sync', 'Error fetching template status', {
      templateId,
      error: error.message,
      status: error.response?.status
    });
    return null;
  }
}

/**
 * Sync template statuses with WhatsApp API
 */
export async function syncTemplateStatuses(): Promise<void> {
  try {
    logger.info('template-status-sync', 'Starting template status sync');


    const templatesToSync = await db
      .select({
        id: campaignTemplates.id,
        whatsappTemplateId: campaignTemplates.whatsappTemplateId,
        whatsappTemplateStatus: campaignTemplates.whatsappTemplateStatus,
        connectionId: campaignTemplates.connectionId,
        name: campaignTemplates.name,
      })
      .from(campaignTemplates)
      .where(
        and(
          eq(campaignTemplates.whatsappTemplateStatus, 'pending' as const),
          eq(campaignTemplates.whatsappChannelType, 'official')
        )
      );

    if (templatesToSync.length === 0) {
      logger.info('template-status-sync', 'No templates to sync');
      return;
    }

    logger.info('template-status-sync', `Found ${templatesToSync.length} templates to sync`);


    const templatesByConnection = new Map<number, typeof templatesToSync>();
    
    for (const template of templatesToSync) {
      if (!template.connectionId || !template.whatsappTemplateId) {
        continue;
      }

      if (!templatesByConnection.has(template.connectionId)) {
        templatesByConnection.set(template.connectionId, []);
      }
      templatesByConnection.get(template.connectionId)!.push(template);
    }


    let updatedCount = 0;
    let errorCount = 0;

    for (const [connectionId, templates] of Array.from(templatesByConnection.entries())) {
      try {

        const connection = await db
          .select()
          .from(channelConnections)
          .where(eq(channelConnections.id, connectionId))
          .limit(1);

        if (!connection || connection.length === 0) {
          logger.warn('template-status-sync', 'Connection not found', { connectionId });
          errorCount += templates.length;
          continue;
        }

        const connectionData = connection[0].connectionData as any;
        const accessToken = connectionData?.accessToken || connectionData?.access_token;

        if (!accessToken) {
          logger.warn('template-status-sync', 'Access token not found for connection', { connectionId });
          errorCount += templates.length;
          continue;
        }


        for (const template of templates) {
          try {
            const newStatus = await fetchTemplateStatus(template.whatsappTemplateId!, accessToken);

            if (newStatus && newStatus !== template.whatsappTemplateStatus) {

              await db
                .update(campaignTemplates)
                .set({
                  whatsappTemplateStatus: newStatus as 'pending' | 'approved' | 'rejected' | 'disabled',
                })
                .where(eq(campaignTemplates.id, template.id));

              logger.info('template-status-sync', 'Updated template status', {
                templateId: template.id,
                templateName: template.name,
                oldStatus: template.whatsappTemplateStatus,
                newStatus: newStatus
              });

              updatedCount++;
            }
          } catch (error: any) {
            logger.error('template-status-sync', 'Error syncing template', {
              templateId: template.id,
              templateName: template.name,
              error: error.message
            });
            errorCount++;
          }


          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error: any) {
        logger.error('template-status-sync', 'Error processing connection', {
          connectionId,
          error: error.message
        });
        errorCount += templates.length;
      }
    }

    logger.info('template-status-sync', 'Template status sync completed', {
      total: templatesToSync.length,
      updated: updatedCount,
      errors: errorCount,
      unchanged: templatesToSync.length - updatedCount - errorCount
    });
  } catch (error: any) {
    logger.error('template-status-sync', 'Error in template status sync', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Start the template status sync scheduler
 */
export function startTemplateStatusSync(): NodeJS.Timeout {
  logger.info('template-status-sync', 'Starting template status sync scheduler', {
    intervalMinutes: SYNC_INTERVAL / 60000
  });


  syncTemplateStatuses().catch(error => {
    logger.error('template-status-sync', 'Error in initial sync', {
      error: error.message
    });
  });


  const intervalId = setInterval(() => {
    syncTemplateStatuses().catch(error => {
      logger.error('template-status-sync', 'Error in scheduled sync', {
        error: error.message
      });
    });
  }, SYNC_INTERVAL);

  return intervalId;
}

/**
 * Stop the template status sync scheduler
 */
export function stopTemplateStatusSync(intervalId: NodeJS.Timeout): void {
  clearInterval(intervalId);
  logger.info('template-status-sync', 'Stopped template status sync scheduler');
}

/**
 * Manually trigger a sync for specific templates
 */
export async function syncSpecificTemplates(templateIds: number[]): Promise<void> {
  try {
    logger.info('template-status-sync', 'Starting manual sync for specific templates', {
      templateIds
    });

    const templatesToSync = await db
      .select({
        id: campaignTemplates.id,
        whatsappTemplateId: campaignTemplates.whatsappTemplateId,
        whatsappTemplateStatus: campaignTemplates.whatsappTemplateStatus,
        connectionId: campaignTemplates.connectionId,
        name: campaignTemplates.name,
      })
      .from(campaignTemplates)
      .where(
        and(
          inArray(campaignTemplates.id, templateIds),
          eq(campaignTemplates.whatsappChannelType, 'official')
        )
      );

    if (templatesToSync.length === 0) {
      logger.info('template-status-sync', 'No templates found to sync');
      return;
    }


    const templatesByConnection = new Map<number, typeof templatesToSync>();
    
    for (const template of templatesToSync) {
      if (!template.connectionId || !template.whatsappTemplateId) {
        continue;
      }

      if (!templatesByConnection.has(template.connectionId)) {
        templatesByConnection.set(template.connectionId, []);
      }
      templatesByConnection.get(template.connectionId)!.push(template);
    }

    for (const [connectionId, templates] of Array.from(templatesByConnection.entries())) {
      const connection = await db
        .select()
        .from(channelConnections)
        .where(eq(channelConnections.id, connectionId))
        .limit(1);

      if (!connection || connection.length === 0) {
        continue;
      }

      const connectionData = connection[0].connectionData as any;
      const accessToken = connectionData?.accessToken || connectionData?.access_token;

      if (!accessToken) {
        continue;
      }

      for (const template of templates) {
        const newStatus = await fetchTemplateStatus(template.whatsappTemplateId!, accessToken);

        if (newStatus) {
          await db
            .update(campaignTemplates)
            .set({
              whatsappTemplateStatus: newStatus as 'pending' | 'approved' | 'rejected' | 'disabled',
            })
            .where(eq(campaignTemplates.id, template.id));

          logger.info('template-status-sync', 'Updated template status (manual)', {
            templateId: template.id,
            templateName: template.name,
            newStatus: newStatus
          });
        }
      }
    }
  } catch (error: any) {
    logger.error('template-status-sync', 'Error in manual sync', {
      error: error.message
    });
    throw error;
  }
}

