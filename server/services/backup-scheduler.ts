import { EventEmitter } from 'events';
import * as cron from 'node-cron';
import { storage } from '../storage';
import { BackupService, BackupConfig, BackupSchedule } from './backup-service';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface ScheduledTask {
  id: string;
  task: cron.ScheduledTask;
}

/**
 * Backup Scheduler Service
 * Handles scheduled database backups and cleanup of old backups
 */
export class BackupScheduler extends EventEmitter {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private cleanupTask: cron.ScheduledTask | null = null;
  private isRunning = false;
  private backupService: BackupService;

  constructor() {
    super();
    this.backupService = new BackupService();
  }

  /**
   * Start the backup scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.info('backup-scheduler', 'Backup scheduler already running');
      return;
    }

    this.isRunning = true;
    logger.info('backup-scheduler', 'Starting backup scheduler');

    try {

      await this.loadAndScheduleBackups();


      this.scheduleCleanupJob();

      this.emit('started');
      logger.info('backup-scheduler', 'Backup scheduler started successfully');
    } catch (error) {
      logger.error('backup-scheduler', 'Failed to start backup scheduler:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the backup scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.info('backup-scheduler', 'Backup scheduler not running');
      return;
    }

    this.isRunning = false;
    logger.info('backup-scheduler', 'Stopping backup scheduler');


    for (const [scheduleId, scheduledTask] of this.scheduledTasks.entries()) {
      scheduledTask.task.stop();
      logger.info('backup-scheduler', `Stopped scheduled backup: ${scheduleId}`);
    }
    this.scheduledTasks.clear();


    if (this.cleanupTask) {
      this.cleanupTask.stop();
      this.cleanupTask = null;
      logger.info('backup-scheduler', 'Stopped cleanup task');
    }

    this.emit('stopped');
    logger.info('backup-scheduler', 'Backup scheduler stopped');
  }

  /**
   * Reload backup schedules from configuration
   */
  async reload(): Promise<void> {
    logger.info('backup-scheduler', 'Reloading backup schedules');


    for (const [scheduleId, scheduledTask] of this.scheduledTasks.entries()) {
      scheduledTask.task.stop();
      logger.info('backup-scheduler', `Stopped scheduled backup: ${scheduleId}`);
    }
    this.scheduledTasks.clear();


    await this.loadAndScheduleBackups();

    logger.info('backup-scheduler', 'Backup schedules reloaded');
  }

  /**
   * Load backup configuration and schedule all enabled backups
   */
  private async loadAndScheduleBackups(): Promise<void> {
    try {
      const configSetting = await storage.getAppSetting('backup_config');
      if (!configSetting) {
        logger.info('backup-scheduler', 'No backup configuration found');
        return;
      }

      const config = configSetting.value as BackupConfig;
      if (!config.enabled) {
        logger.info('backup-scheduler', 'Backup system is disabled');
        return;
      }

      const enabledSchedules = config.schedules.filter(s => s.enabled);
      logger.info('backup-scheduler', `Found ${enabledSchedules.length} enabled backup schedules`);

      for (const schedule of enabledSchedules) {
        await this.scheduleBackup(schedule);
      }
    } catch (error) {
      logger.error('backup-scheduler', 'Error loading backup configuration:', error);
      throw error;
    }
  }

  /**
   * Schedule a single backup based on its configuration
   */
  private async scheduleBackup(schedule: BackupSchedule): Promise<void> {
    try {
      const cronExpression = this.scheduleToCron(schedule);

      if (!cron.validate(cronExpression)) {
        logger.error('backup-scheduler', `Invalid cron expression for schedule ${schedule.id}: ${cronExpression}`);
        return;
      }

      const task = cron.schedule(cronExpression, () => {
        this.executeScheduledBackup(schedule).catch(error => {
          logger.error('backup-scheduler', `Error executing scheduled backup ${schedule.id}:`, error);
        });
      }, {
        timezone: 'UTC'
      });

      task.start();

      this.scheduledTasks.set(schedule.id, {
        id: schedule.id,
        task
      });

      logger.info('backup-scheduler', `Scheduled backup ${schedule.id} (${schedule.frequency}) with cron: ${cronExpression}`);
    } catch (error) {
      logger.error('backup-scheduler', `Failed to schedule backup ${schedule.id}:`, error);
    }
  }

  /**
   * Execute a scheduled backup
   */
  private async executeScheduledBackup(schedule: BackupSchedule): Promise<void> {
    const startTime = Date.now();
    logger.info('backup-scheduler', `Executing scheduled backup: ${schedule.id} (${schedule.frequency})`);

    try {
      const backup = await this.backupService.createBackup({
        type: 'scheduled',
        description: `Scheduled backup (${schedule.frequency})`,
        storage_locations: schedule.storage_locations
      });

      const executionTime = Date.now() - startTime;


      await this.logBackupExecution(schedule.id, 'success', backup.id, executionTime);

      logger.info('backup-scheduler', `Completed scheduled backup ${schedule.id}: ${backup.filename} (${executionTime}ms)`);
      this.emit('backup-completed', { scheduleId: schedule.id, backupId: backup.id });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';


      await this.logBackupExecution(schedule.id, 'failed', null, executionTime, errorMessage);

      logger.error('backup-scheduler', `Failed scheduled backup ${schedule.id}: ${errorMessage}`);
      this.emit('backup-failed', { scheduleId: schedule.id, error: errorMessage });
    }
  }

  /**
   * Schedule daily cleanup job
   */
  private scheduleCleanupJob(): void {
    try {

      const cronExpression = '0 3 * * *';

      this.cleanupTask = cron.schedule(cronExpression, () => {
        this.executeCleanup().catch(error => {
          logger.error('backup-scheduler', 'Error executing cleanup:', error);
        });
      }, {
        timezone: 'UTC'
      });

      this.cleanupTask.start();
      logger.info('backup-scheduler', 'Scheduled daily cleanup job at 3 AM UTC');
    } catch (error) {
      logger.error('backup-scheduler', 'Failed to schedule cleanup job:', error);
    }
  }

  /**
   * Execute cleanup of old backups
   */
  private async executeCleanup(): Promise<void> {
    const startTime = Date.now();
    logger.info('backup-scheduler', 'Executing backup cleanup');

    try {
      const configSetting = await storage.getAppSetting('backup_config');
      if (!configSetting) {
        logger.info('backup-scheduler', 'No backup configuration found for cleanup');
        return;
      }

      const config = configSetting.value as BackupConfig;
      const retentionDays = config.retention_days || 30;

      const result = await this.backupService.cleanupOldBackups(retentionDays);
      const executionTime = Date.now() - startTime;

      logger.info('backup-scheduler', `Cleanup completed: deleted ${result.deleted} backups (${executionTime}ms)`);

      if (result.errors.length > 0) {
        logger.warn('backup-scheduler', `Cleanup had ${result.errors.length} errors:`, result.errors);
      }


      await this.logBackupExecution('manual', 'success', null, executionTime, undefined, {
        event_type: 'cleanup',
        deleted_count: result.deleted,
        retention_days: retentionDays,
        errors: result.errors
      });

      this.emit('cleanup-completed', { deleted: result.deleted, errors: result.errors });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('backup-scheduler', `Cleanup failed: ${errorMessage}`);

      await this.logBackupExecution('manual', 'failed', null, executionTime, errorMessage, {
        event_type: 'cleanup'
      });

      this.emit('cleanup-failed', { error: errorMessage });
    }
  }

  /**
   * Convert schedule configuration to cron expression
   */
  private scheduleToCron(schedule: BackupSchedule): string {
    const [hour, minute] = schedule.time.split(':').map(Number);

    switch (schedule.frequency) {
      case 'daily':
        return `${minute} ${hour} * * *`;

      case 'weekly':
        const dayOfWeek = schedule.day_of_week ?? 0; // Default to Sunday
        return `${minute} ${hour} * * ${dayOfWeek}`;

      case 'monthly':
        const dayOfMonth = schedule.day_of_month ?? 1; // Default to 1st
        return `${minute} ${hour} ${dayOfMonth} * *`;

      default:
        logger.warn('backup-scheduler', `Unknown frequency: ${schedule.frequency}, defaulting to daily`);
        return `${minute} ${hour} * * *`;
    }
  }

  /**
   * Log backup execution to database_backup_logs table
   */
  private async logBackupExecution(
    scheduleId: string,
    status: 'success' | 'failed',
    backupId: string | null,
    executionTime: number,
    errorMessage?: string,
    metadata?: any
  ): Promise<void> {
    try {
      const { getDb } = await import('../db');
      const { databaseBackupLogs } = await import('../../shared/schema');

      const logEntry = {
        id: crypto.randomUUID(),
        scheduleId: scheduleId,
        backupId: backupId,
        status,
        timestamp: new Date(),
        errorMessage: errorMessage || null,
        metadata: {
          execution_time_ms: executionTime,
          ...metadata
        }
      };

      await getDb().insert(databaseBackupLogs).values(logEntry);
    } catch (error) {
      logger.error('backup-scheduler', 'Error logging backup execution:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    scheduledBackupsCount: number;
    schedules: Array<{ id: string; frequency: string }>;
  } {
    const schedules = Array.from(this.scheduledTasks.values()).map(task => ({
      id: task.id,
      frequency: 'unknown' // We don't store frequency in the task
    }));

    return {
      isRunning: this.isRunning,
      scheduledBackupsCount: this.scheduledTasks.size,
      schedules
    };
  }
}


export const backupScheduler = new BackupScheduler();

