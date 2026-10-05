import { EventEmitter } from 'events';
import { logger } from './logger';

/**
 * EventEmitter Memory Leak Monitor
 * Provides utilities to monitor and debug EventEmitter listener counts
 */

interface EventEmitterInfo {
  name: string;
  emitter: EventEmitter;
  maxListeners: number;
  events: Record<string, number>;
  totalListeners: number;
}

class EventEmitterMonitor {
  private registeredEmitters: Map<string, EventEmitter> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_INTERVAL = 60000; // 1 minute
  private readonly WARNING_THRESHOLD = 8; // Warn when approaching max listeners

  /**
   * Register an EventEmitter for monitoring
   */
  register(name: string, emitter: EventEmitter): void {
    this.registeredEmitters.set(name, emitter);
    logger.debug('event-monitor', `Registered EventEmitter: ${name}`);
  }

  /**
   * Unregister an EventEmitter from monitoring
   */
  unregister(name: string): void {
    this.registeredEmitters.delete(name);
    logger.debug('event-monitor', `Unregistered EventEmitter: ${name}`);
  }

  /**
   * Get current status of all registered EventEmitters
   */
  getStatus(): EventEmitterInfo[] {
    const status: EventEmitterInfo[] = [];

    this.registeredEmitters.forEach((emitter, name) => {
      const events: Record<string, number> = {};
      let totalListeners = 0;


      const eventNames = emitter.eventNames();
      eventNames.forEach(eventName => {
        const count = emitter.listenerCount(eventName as string);
        events[eventName.toString()] = count;
        totalListeners += count;
      });

      status.push({
        name,
        emitter,
        maxListeners: emitter.getMaxListeners(),
        events,
        totalListeners
      });
    });

    return status;
  }

  /**
   * Check for potential memory leaks
   */
  checkForLeaks(): void {
    const status = this.getStatus();
    
    status.forEach(info => {

      Object.entries(info.events).forEach(([eventName, count]) => {
        if (count >= this.WARNING_THRESHOLD) {
          logger.warn('event-monitor', 
            `High listener count detected: ${info.name}.${eventName} has ${count} listeners (max: ${info.maxListeners})`
          );
        }
      });


      if (info.totalListeners >= info.maxListeners * 0.8) {
        logger.warn('event-monitor', 
          `EventEmitter ${info.name} has ${info.totalListeners} total listeners (max: ${info.maxListeners})`
        );
      }
    });
  }

  /**
   * Start periodic monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    this.monitoringInterval = setInterval(() => {
      this.checkForLeaks();
    }, this.MONITORING_INTERVAL);

    logger.info('event-monitor', 'Started EventEmitter monitoring');
  }

  /**
   * Stop periodic monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('event-monitor', 'Stopped EventEmitter monitoring');
    }
  }

  /**
   * Log detailed status of all EventEmitters
   */
  logDetailedStatus(): void {
    const status = this.getStatus();
    
    logger.info('event-monitor', '=== EventEmitter Status Report ===');
    status.forEach(info => {
      logger.info('event-monitor', `${info.name}:`);
      logger.info('event-monitor', `  Max Listeners: ${info.maxListeners}`);
      logger.info('event-monitor', `  Total Listeners: ${info.totalListeners}`);
      logger.info('event-monitor', `  Events:`);
      
      Object.entries(info.events).forEach(([eventName, count]) => {
        const warning = count >= this.WARNING_THRESHOLD ? ' ⚠️' : '';
        logger.info('event-monitor', `    ${eventName}: ${count}${warning}`);
      });
    });
    logger.info('event-monitor', '=== End Status Report ===');
  }

  /**
   * Get a summary for API endpoints
   */
  getSummary(): any {
    const status = this.getStatus();
    
    return {
      totalEmitters: status.length,
      emitters: status.map(info => ({
        name: info.name,
        maxListeners: info.maxListeners,
        totalListeners: info.totalListeners,
        events: info.events,
        hasWarnings: Object.values(info.events).some(count => count >= this.WARNING_THRESHOLD)
      })),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Force cleanup of all listeners on a specific emitter
   */
  forceCleanup(emitterName: string): boolean {
    const emitter = this.registeredEmitters.get(emitterName);
    if (!emitter) {
      return false;
    }

    const beforeCount = emitter.eventNames().reduce((total, eventName) => {
      return total + emitter.listenerCount(eventName as string);
    }, 0);

    emitter.removeAllListeners();

    const afterCount = emitter.eventNames().reduce((total, eventName) => {
      return total + emitter.listenerCount(eventName as string);
    }, 0);

    logger.warn('event-monitor', 
      `Force cleanup on ${emitterName}: removed ${beforeCount - afterCount} listeners`
    );

    return true;
  }
}


export const eventEmitterMonitor = new EventEmitterMonitor();

/**
 * Utility function to safely increase max listeners with logging
 */
export function setMaxListenersSafely(emitter: EventEmitter, maxListeners: number, name?: string): void {
  const currentMax = emitter.getMaxListeners();
  emitter.setMaxListeners(maxListeners);
  
  if (name) {
    logger.debug('event-monitor', 
      `Set max listeners for ${name}: ${currentMax} -> ${maxListeners}`
    );
  }
}

/**
 * Wrapper function to create monitored EventEmitter
 */
export function createMonitoredEventEmitter(name: string, maxListeners: number = 50): EventEmitter {
  const emitter = new EventEmitter();
  setMaxListenersSafely(emitter, maxListeners, name);
  eventEmitterMonitor.register(name, emitter);
  return emitter;
}

export default eventEmitterMonitor;
