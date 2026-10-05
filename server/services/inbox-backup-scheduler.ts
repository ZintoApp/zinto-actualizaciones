import * as cron from 'node-cron';
import { getDb } from '../db';
import {
  backupSchedules,
  inboxBackups,
  InsertBackupSchedule
} from '@shared/schema';
import { eq, and, lt, desc, sql } from 'drizzle-orm';
import { inboxBackupService } from './inbox-backup';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

interface ScheduledTask {
  id: number;
  task: cron.ScheduledTask;
}

class InboxBackupSchedulerService {
  private scheduledTasks: Map<number, ScheduledTask> = new Map();
  private cleanupTask: cron.ScheduledTask | null = null;
  private readonly backupDir = path.join(process.cwd(), 'backups');

  constructor() {

  }

  private async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const result = await getDb().execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = ${tableName}
        );
      `);
      return result.rows[0]?.exists === true;
    } catch (error) {
      logger.error('InboxBackupScheduler', `Error checking if table ${tableName} exists:`, error);
      return false;
    }
  }

  async initializeScheduler() {
    try {

      const tableExists = await this.checkTableExists('backup_schedules');
      if (!tableExists) {
        logger.info('InboxBackupScheduler', 'backup_schedules table does not exist yet, skipping initialization');
        return;
      }

      const activeSchedules = await getDb().select()
        .from(backupSchedules)
        .where(eq(backupSchedules.isActive, true));

      for (const schedule of activeSchedules) {
        await this.scheduleBackup(schedule);
      }



      this.cleanupTask = cron.schedule('0 2 * * *', () => {
        this.cleanupExpiredBackups().catch(error => {
          logger.error('InboxBackupScheduler', 'Failed to cleanup expired backups:', error);
        });
      });
      this.cleanupTask.start();

      logger.info('InboxBackupScheduler', `Initialized inbox backup scheduler with ${activeSchedules.length} active schedules`);
    } catch (error) {
      logger.error('InboxBackupScheduler', 'Failed to initialize inbox backup scheduler', error);
    }
  }

  async createSchedule(scheduleData: InsertBackupSchedule): Promise<number> {
    try {
      const schedule = await getDb().insert(backupSchedules).values({
        ...scheduleData,
        nextRunAt: this.calculateNextRun(scheduleData.frequency || 'daily', scheduleData.cronExpression || undefined)
      }).returning({ id: backupSchedules.id });

      const scheduleId = schedule[0].id;

      if (scheduleData.isActive) {
        const fullSchedule = await this.getSchedule(scheduleId);
        if (fullSchedule) {
          await this.scheduleBackup(fullSchedule);
        }
      }

      logger.info('InboxBackupScheduler', `Created inbox backup schedule ${scheduleId}: ${scheduleData.name}`);
      return scheduleId;
    } catch (error) {
      logger.error('InboxBackupScheduler', 'Failed to create inbox backup schedule', error);
      throw error;
    }
  }

  async updateSchedule(scheduleId: number, updates: Partial<InsertBackupSchedule>): Promise<boolean> {
    try {

      await getDb().update(backupSchedules)
        .set({
          ...updates,
          nextRunAt: updates.frequency || updates.cronExpression
            ? this.calculateNextRun(updates.frequency || 'daily', updates.cronExpression || undefined)
            : undefined,
          updatedAt: new Date()
        })
        .where(eq(backupSchedules.id, scheduleId));


      const schedule = await this.getSchedule(scheduleId);
      if (schedule) {
        this.unscheduleBackup(scheduleId);
        if (schedule.isActive) {
          await this.scheduleBackup(schedule);
        }
      }

      logger.info('InboxBackupScheduler', `Updated inbox backup schedule ${scheduleId}`);
      return true;
    } catch (error) {
      logger.error('InboxBackupScheduler', `Failed to update inbox backup schedule ${scheduleId}`, error);
      return false;
    }
  }

  async deleteSchedule(scheduleId: number): Promise<boolean> {
    try {
      this.unscheduleBackup(scheduleId);
      
      await getDb().delete(backupSchedules)
        .where(eq(backupSchedules.id, scheduleId));

      logger.info('InboxBackupScheduler', `Deleted inbox backup schedule ${scheduleId}`);
      return true;
    } catch (error) {
      logger.error('InboxBackupScheduler', `Failed to delete inbox backup schedule ${scheduleId}`, error);
      return false;
    }
  }

  async getSchedules(companyId: number) {
    try {
      return await getDb().select()
        .from(backupSchedules)
        .where(eq(backupSchedules.companyId, companyId))
        .orderBy(desc(backupSchedules.createdAt));
    } catch (error) {
      logger.error('InboxBackupScheduler', 'Failed to get inbox backup schedules', error);
      return [];
    }
  }

  async getSchedule(scheduleId: number) {
    try {
      const schedule = await getDb().select()
        .from(backupSchedules)
        .where(eq(backupSchedules.id, scheduleId))
        .limit(1);

      return schedule[0] || null;
    } catch (error) {
      logger.error('InboxBackupScheduler', `Failed to get inbox backup schedule ${scheduleId}`, error);
      return null;
    }
  }

  private async scheduleBackup(schedule: any) {
    try {
      const cronExpression = schedule.cronExpression || this.frequencyToCron(schedule.frequency);

      if (!cron.validate(cronExpression)) {
        logger.error('InboxBackupScheduler', `Invalid cron expression for schedule ${schedule.id}: ${cronExpression}`);
        return;
      }

      const task = cron.schedule(cronExpression, async () => {
        await this.executeScheduledBackup(schedule);
      }, {
        timezone: 'UTC'
      });

      this.scheduledTasks.set(schedule.id, {
        id: schedule.id,
        task
      });

      logger.info('InboxBackupScheduler', `Scheduled inbox backup ${schedule.id} with cron: ${cronExpression}`);
    } catch (error) {
      logger.error('InboxBackupScheduler', `Failed to schedule inbox backup ${schedule.id}`, error);
    }
  }

  private unscheduleBackup(scheduleId: number) {
    const scheduledTask = this.scheduledTasks.get(scheduleId);
    if (scheduledTask) {
      scheduledTask.task.stop();
      scheduledTask.task.destroy();
      this.scheduledTasks.delete(scheduleId);
      logger.info('InboxBackupScheduler', `Unscheduled inbox backup ${scheduleId}`);
    }
  }

  private async executeScheduledBackup(schedule: any) {
    try {
      logger.info('InboxBackupScheduler', `Executing scheduled inbox backup: ${schedule.name}`);

      const backupName = `${schedule.name} - ${new Date().toISOString().split('T')[0]}`;

      await inboxBackupService.createBackup({
        companyId: schedule.companyId,
        createdByUserId: schedule.createdByUserId,
        name: backupName,
        description: `Automated backup from schedule: ${schedule.name}`,
        includeContacts: schedule.includeContacts,
        includeConversations: schedule.includeConversations,
        includeMessages: schedule.includeMessages
      });


      await getDb().update(backupSchedules)
        .set({
          lastRunAt: new Date(),
          nextRunAt: this.calculateNextRun(schedule.frequency || 'daily', schedule.cronExpression || undefined),
          updatedAt: new Date()
        })
        .where(eq(backupSchedules.id, schedule.id));

      logger.info('InboxBackupScheduler', `Completed scheduled inbox backup: ${schedule.name}`);
    } catch (error) {
      logger.error('InboxBackupScheduler', `Failed to execute scheduled inbox backup ${schedule.id}`, error);
    }
  }

  private frequencyToCron(frequency: string): string {
    switch (frequency) {
      case 'daily':
        return '0 2 * * *'; // 2 AM daily
      case 'weekly':
        return '0 2 * * 0'; // 2 AM every Sunday
      case 'monthly':
        return '0 2 1 * *'; // 2 AM on the 1st of every month
      default:
        return '0 2 * * *'; // Default to daily
    }
  }

  private calculateNextRun(frequency?: string, cronExpression?: string): Date {
    const now = new Date();


    switch (frequency) {
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth() + 1, 1, 2, 0, 0);
      default:
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  private async cleanupExpiredBackups() {
    try {
      logger.info('InboxBackupScheduler', 'Starting cleanup of expired inbox backups');


      const schedules = await getDb().select()
        .from(backupSchedules)
        .where(eq(backupSchedules.isActive, true));

      for (const schedule of schedules) {
        if (schedule.retentionDays && schedule.retentionDays > 0) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - schedule.retentionDays);


          const expiredBackups = await getDb().select()
            .from(inboxBackups)
            .where(and(
              eq(inboxBackups.companyId, schedule.companyId),
              eq(inboxBackups.type, 'scheduled'),
              lt(inboxBackups.createdAt, cutoffDate)
            ));

          for (const backup of expiredBackups) {
            try {

              if (backup.filePath) {
                try {
                  await fs.unlink(backup.filePath);
                  logger.info('InboxBackupScheduler', `Deleted expired inbox backup file: ${backup.filePath}`);
                } catch (error) {
                  logger.warn('InboxBackupScheduler', `Failed to delete inbox backup file ${backup.filePath}`, error);
                }
              }


              await getDb().delete(inboxBackups)
                .where(eq(inboxBackups.id, backup.id));

              logger.info('InboxBackupScheduler', `Cleaned up expired inbox backup: ${backup.name} (${backup.id})`);
            } catch (error) {
              logger.error('InboxBackupScheduler', `Failed to cleanup inbox backup ${backup.id}`, error);
            }
          }
        }
      }

      logger.info('InboxBackupScheduler', 'Completed cleanup of expired inbox backups');
    } catch (error) {
      logger.error('InboxBackupScheduler', 'Failed to cleanup expired inbox backups', error);
    }
  }

  async getScheduleStatus() {
    return {
      activeSchedules: this.scheduledTasks.size,
      scheduledTasks: Array.from(this.scheduledTasks.keys())
    };
  }

  /**
   * Stop all scheduled tasks
   * Used during maintenance operations
   */
  async stopAll(): Promise<void> {
    logger.info('InboxBackupScheduler', 'Stopping all scheduled tasks...');
    

    for (const [scheduleId, scheduledTask] of this.scheduledTasks.entries()) {
      scheduledTask.task.stop();
      scheduledTask.task.destroy();
      logger.info('InboxBackupScheduler', `Stopped scheduled backup task: ${scheduleId}`);
    }
    this.scheduledTasks.clear();


    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask.destroy();
      this.cleanupTask = null;
      logger.info('InboxBackupScheduler', 'Stopped cleanup task');
    }

    logger.info('InboxBackupScheduler', 'All scheduled tasks stopped');
  }

  /**
   * Start all scheduled tasks
   * Used after maintenance operations
   */
  async startAll(): Promise<void> {
    logger.info('InboxBackupScheduler', 'Starting all scheduled tasks...');
    await this.initializeScheduler();
    logger.info('InboxBackupScheduler', 'All scheduled tasks started');
  }
}

export const inboxBackupSchedulerService = new InboxBackupSchedulerService();
