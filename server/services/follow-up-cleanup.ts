import { storage } from '../storage';
import { logger } from '../utils/logger';
import { followUpSchedules, followUpExecutionLog } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * Follow-up Cleanup Service
 * Handles cleanup of expired follow-ups and maintenance tasks
 */
class FollowUpCleanupService {
  private static instance: FollowUpCleanupService;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  private readonly RETENTION_DAYS = 90; // Keep logs for 90 days

  constructor() {}

  static getInstance(): FollowUpCleanupService {
    if (!FollowUpCleanupService.instance) {
      FollowUpCleanupService.instance = new FollowUpCleanupService();
    }
    return FollowUpCleanupService.instance;
  }

  /**
   * Start the cleanup service
   */
  start(): void {
    if (this.cleanupInterval) {
      logger.info('follow-up-cleanup', 'Cleanup service is already running');
      return;
    }

    logger.info('follow-up-cleanup', 'Starting follow-up cleanup service...');
    

    this.runCleanup();
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Stop the cleanup service
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('follow-up-cleanup', 'Follow-up cleanup service stopped');
    }
  }

  /**
   * Run all cleanup tasks
   */
  private async runCleanup(): Promise<void> {
    try {
      logger.info('follow-up-cleanup', 'Running follow-up cleanup tasks...');
      
      await Promise.all([
        this.expireOldSchedules(),
        this.cleanupOldExecutionLogs(),
        this.updateFailedSchedules(),
        this.cleanupCancelledFollowUps()
      ]);
      
      logger.info('follow-up-cleanup', 'Follow-up cleanup completed successfully');
    } catch (error) {
      logger.error('follow-up-cleanup', 'Error during cleanup', error);
    }
  }

  /**
   * Mark expired follow-up schedules as expired
   */
  private async expireOldSchedules(): Promise<void> {
    try {
      const now = new Date();
      

      const expiredSchedules = await db.select()
        .from(followUpSchedules)
        .where(
          and(
            eq(followUpSchedules.status, 'scheduled'),
            sql`${followUpSchedules.expiresAt} <= ${now}`
          )
        );

      if (expiredSchedules.length === 0) {
        return;
      }

      logger.info('follow-up-cleanup', `Found ${expiredSchedules.length} expired follow-up schedules`);


      for (const schedule of expiredSchedules) {
        await storage.updateFollowUpSchedule(schedule.scheduleId, {
          status: 'expired'
        });


        await storage.createFollowUpExecutionLog({
          scheduleId: schedule.scheduleId,
          executionAttempt: (schedule.retryCount ?? 0) + 1,
          status: 'expired',
          errorMessage: 'Follow-up schedule expired',
          executionDurationMs: 0,
          executedAt: now
        });
      }

      logger.info('follow-up-cleanup', `Marked ${expiredSchedules.length} follow-up schedules as expired`);
    } catch (error) {
      logger.error('follow-up-cleanup', 'Error expiring old schedules', error);
    }
  }

  /**
   * Clean up old execution logs
   */
  private async cleanupOldExecutionLogs(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

      const deleteResult = await db.delete(followUpExecutionLog)
        .where(
          sql`${followUpExecutionLog.executedAt} < ${cutoffDate}`
        );

      const deletedCount = deleteResult.rowCount ?? 0;
      if (deletedCount > 0) {
        logger.info('follow-up-cleanup', `Cleaned up ${deletedCount} old execution logs`);
      }
    } catch (error) {
      logger.error('follow-up-cleanup', 'Error cleaning up execution logs', error);
    }
  }

  /**
   * Clean up cancelled follow-ups older than retention period
   */
  private async cleanupCancelledFollowUps(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.RETENTION_DAYS);

      const cancelledSchedules = await db.select()
        .from(followUpSchedules)
        .where(
          and(
            eq(followUpSchedules.status, 'cancelled'),
            sql`${followUpSchedules.updatedAt} < ${cutoffDate}`
          )
        );

      if (cancelledSchedules.length === 0) {
        return;
      }

      logger.info('follow-up-cleanup', `Found ${cancelledSchedules.length} cancelled follow-up schedules to clean up`);

      for (const schedule of cancelledSchedules) {
        // Delete associated execution logs first (foreign key constraint)
        await db.delete(followUpExecutionLog)
          .where(eq(followUpExecutionLog.scheduleId, schedule.scheduleId));

        // Delete the cancelled follow-up schedule
        await db.delete(followUpSchedules)
          .where(eq(followUpSchedules.scheduleId, schedule.scheduleId));
      }

      logger.info('follow-up-cleanup', `Cleaned up ${cancelledSchedules.length} cancelled follow-up schedules`);
    } catch (error) {
      logger.error('follow-up-cleanup', 'Error cleaning up cancelled follow-ups', error);
    }
  }

  /**
   * Update failed schedules that have exceeded max retries
   */
  private async updateFailedSchedules(): Promise<void> {
    try {

      const failedSchedules = await db.select()
        .from(followUpSchedules)
        .where(
          and(
            eq(followUpSchedules.status, 'scheduled'),
            sql`${followUpSchedules.retryCount} >= ${followUpSchedules.maxRetries}`,
            sql`${followUpSchedules.scheduledFor} <= NOW()`
          )
        );

      if (failedSchedules.length === 0) {
        return;
      }

      logger.info('follow-up-cleanup', `Found ${failedSchedules.length} failed follow-up schedules to mark as failed`);


      for (const schedule of failedSchedules) {
        await storage.updateFollowUpSchedule(schedule.scheduleId, {
          status: 'failed',
          failedReason: 'Maximum retry attempts exceeded'
        });


        await storage.createFollowUpExecutionLog({
          scheduleId: schedule.scheduleId,
          executionAttempt: (schedule.retryCount ?? 0) + 1,
          status: 'failed',
          errorMessage: 'Maximum retry attempts exceeded',
          executionDurationMs: 0,
          executedAt: new Date()
        });
      }

      logger.info('follow-up-cleanup', `Marked ${failedSchedules.length} follow-up schedules as permanently failed`);
    } catch (error) {
      logger.error('follow-up-cleanup', 'Error updating failed schedules', error);
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    totalSchedules: number;
    scheduledCount: number;
    sentCount: number;
    failedCount: number;
    cancelledCount: number;
    expiredCount: number;
    oldestLog: Date | null;
    newestLog: Date | null;
  }> {
    try {

      const scheduleCounts = await db.select({
        status: followUpSchedules.status,
        count: sql`COUNT(*)`.as('count')
      })
      .from(followUpSchedules)
      .groupBy(followUpSchedules.status);


      const logStats = await db.select({
        oldest: sql<Date | null>`MIN(${followUpExecutionLog.executedAt})`.as('oldest'),
        newest: sql<Date | null>`MAX(${followUpExecutionLog.executedAt})`.as('newest')
      })
      .from(followUpExecutionLog);

      const oldestValue = logStats[0]?.oldest;
      const newestValue = logStats[0]?.newest;
      
      const stats = {
        totalSchedules: 0,
        scheduledCount: 0,
        sentCount: 0,
        failedCount: 0,
        cancelledCount: 0,
        expiredCount: 0,
        oldestLog: oldestValue instanceof Date ? oldestValue : oldestValue ? new Date(oldestValue) : null,
        newestLog: newestValue instanceof Date ? newestValue : newestValue ? new Date(newestValue) : null
      };


      for (const row of scheduleCounts) {
        const count = parseInt(row.count as string);
        stats.totalSchedules += count;
        
        switch (row.status) {
          case 'scheduled':
            stats.scheduledCount = count;
            break;
          case 'sent':
            stats.sentCount = count;
            break;
          case 'failed':
            stats.failedCount = count;
            break;
          case 'cancelled':
            stats.cancelledCount = count;
            break;
          case 'expired':
            stats.expiredCount = count;
            break;
        }
      }

      return stats;
    } catch (error) {
      logger.error('follow-up-cleanup', 'Error getting cleanup stats', error);
      throw error;
    }
  }

  /**
   * Manual cleanup trigger
   */
  async runManualCleanup(): Promise<void> {
    logger.info('follow-up-cleanup', 'Running manual cleanup...');
    await this.runCleanup();
  }

  /**
   * Clean up specific schedule and its logs
   */
  async cleanupSchedule(scheduleId: string): Promise<boolean> {
    try {

      await db.delete(followUpExecutionLog)
        .where(eq(followUpExecutionLog.scheduleId, scheduleId));


      const result = await db.delete(followUpSchedules)
        .where(eq(followUpSchedules.scheduleId, scheduleId));

      logger.info('follow-up-cleanup', `Cleaned up schedule ${scheduleId}`);
      return true;
    } catch (error) {
      logger.error('follow-up-cleanup', `Error cleaning up schedule ${scheduleId}`, error);
      return false;
    }
  }

  /**
   * Get service status
   */
  getStatus(): { isRunning: boolean; cleanupInterval: number; retentionDays: number } {
    return {
      isRunning: this.cleanupInterval !== null,
      cleanupInterval: this.CLEANUP_INTERVAL,
      retentionDays: this.RETENTION_DAYS
    };
  }
}

export default FollowUpCleanupService;
