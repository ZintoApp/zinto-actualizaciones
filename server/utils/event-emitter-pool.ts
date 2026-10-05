/**
 * Centralized EventEmitter Pool
 * 
 * Addresses memory usage issues by:
 * 1. Sharing EventEmitter instances across channel services
 * 2. Automatic cleanup of unused listeners
 * 3. Memory usage monitoring and optimization
 * 4. Efficient event routing with namespace isolation
 */

import { EventEmitter } from 'events';

interface PooledEventEmitter extends EventEmitter {
  namespace: string;
  activeListeners: Map<string, Set<(...args: any[]) => void>>;
  lastActivity: Date;
  cleanupTimeout?: NodeJS.Timeout;
}

interface EventSubscription {
  emitter: PooledEventEmitter;
  eventName: string;
  listener: (...args: any[]) => void;
  namespace: string;
  createdAt: Date;
}

class EventEmitterPool {
  private pool: Map<string, PooledEventEmitter> = new Map();
  private subscriptions: Map<string, EventSubscription> = new Map();
  private cleanupInterval!: NodeJS.Timeout;
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  private readonly maxListenersPerEmitter: number;

  constructor() {
    this.maxListenersPerEmitter = EventEmitterPool.resolveMaxListenersPerEmitter();
    this.startCleanupProcess();
  }

  /** Default 500; override with MAX_WS_LISTENERS (floored at 500). */
  private static resolveMaxListenersPerEmitter(): number {
    const raw = process.env.MAX_WS_LISTENERS;
    if (raw !== undefined && raw !== '') {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        return Math.max(500, parsed);
      }
    }
    return 500;
  }

  /**
   * Get or create a pooled EventEmitter for a namespace
   */
  getEmitter(namespace: string): PooledEventEmitter {
    let emitter = this.pool.get(namespace);
    
    if (!emitter) {
      emitter = this.createPooledEmitter(namespace);
      this.pool.set(namespace, emitter);
    }
    
    emitter.lastActivity = new Date();
    this.resetCleanupTimeout(emitter);
    
    return emitter;
  }

  /**
   * Subscribe to an event with automatic cleanup
   */
  subscribe(
    namespace: string, 
    eventName: string, 
    listener: (...args: any[]) => void,
    options: { once?: boolean; priority?: 'high' | 'normal' } = {}
  ): () => void {
    const emitter = this.getEmitter(namespace);
    const subscriptionId = this.generateSubscriptionId(namespace, eventName, listener);
    

    if (emitter.listenerCount(eventName) >= this.maxListenersPerEmitter) {
      const count = emitter.listenerCount(eventName);
      const evicted = this.evictOldestSubscriptionForEvent(emitter, eventName);
      if (!evicted) {
        const detail = new Error(
          `EventEmitter pool: max listeners (${this.maxListenersPerEmitter}) for ${namespace}.${eventName} (listenerCount=${count}); no subscription record to evict`
        );
        console.warn(detail.message, detail.stack);
        throw detail;
      }
      console.warn(
        `EventEmitter pool: Evicted oldest listener for ${namespace}.${eventName} (at cap ${this.maxListenersPerEmitter}, was ${count}).`,
        new Error().stack
      );
    }


    if (options.priority === 'high') {
      emitter.prependListener(eventName, listener);
    } else if (options.once) {
      emitter.once(eventName, listener);
    } else {
      emitter.on(eventName, listener);
    }


    this.subscriptions.set(subscriptionId, {
      emitter,
      eventName,
      listener,
      namespace,
      createdAt: new Date()
    });


    if (!emitter.activeListeners.has(eventName)) {
      emitter.activeListeners.set(eventName, new Set());
    }
    emitter.activeListeners.get(eventName)!.add(listener);


    return () => this.unsubscribe(subscriptionId);
  }

  /**
   * Emit event to specific namespace
   */
  emit(namespace: string, eventName: string, ...args: any[]): boolean {
    const emitter = this.pool.get(namespace);
    if (!emitter) return false;
    
    emitter.lastActivity = new Date();
    return emitter.emit(eventName, ...args);
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalEmitters: number;
    totalSubscriptions: number;
    memoryUsage: { [namespace: string]: number };
    oldestSubscription: Date | null;
  } {
    const memoryUsage: { [namespace: string]: number } = {};
    let oldestSubscription: Date | null = null;
    
    this.pool.forEach((emitter, namespace) => {

      let totalListeners = 0;
      emitter.activeListeners.forEach(listeners => {
        totalListeners += listeners.size;
      });
      memoryUsage[namespace] = totalListeners;
    });
    
    this.subscriptions.forEach(subscription => {
      if (!oldestSubscription || subscription.createdAt < oldestSubscription) {
        oldestSubscription = subscription.createdAt;
      }
    });
    
    return {
      totalEmitters: this.pool.size,
      totalSubscriptions: this.subscriptions.size,
      memoryUsage,
      oldestSubscription
    };
  }

  /**
   * Force cleanup of idle emitters
   */
  cleanup(): void {
    const now = new Date();
    const emittersToRemove: string[] = [];
    
    this.pool.forEach((emitter, namespace) => {
      const idleTime = now.getTime() - emitter.lastActivity.getTime();
      
      if (idleTime > this.IDLE_TIMEOUT && emitter.activeListeners.size === 0) {
        emittersToRemove.push(namespace);
      }
    });
    
    emittersToRemove.forEach(namespace => {
      this.removeEmitter(namespace);
    });
    

  }

  /**
   * Shutdown the pool and cleanup all resources
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    

    this.pool.forEach((_emitter, namespace) => {
      this.removeEmitter(namespace);
    });
    
    this.pool.clear();
    this.subscriptions.clear();
  }

  private createPooledEmitter(namespace: string): PooledEventEmitter {
    const emitter = new EventEmitter() as PooledEventEmitter;
    emitter.namespace = namespace;
    emitter.activeListeners = new Map();
    emitter.lastActivity = new Date();
    emitter.setMaxListeners(this.maxListenersPerEmitter);
    
    return emitter;
  }

  /**
   * When at cap, remove the oldest tracked subscription for this emitter/event so a new listener can be added.
   */
  private evictOldestSubscriptionForEvent(emitter: PooledEventEmitter, eventName: string): boolean {
    let oldestId: string | null = null;
    let oldestMs = Infinity;
    this.subscriptions.forEach((sub, id) => {
      if (sub.emitter === emitter && sub.eventName === eventName) {
        const t = sub.createdAt.getTime();
        if (t < oldestMs) {
          oldestMs = t;
          oldestId = id;
        }
      }
    });
    if (oldestId) {
      this.unsubscribe(oldestId);
      return true;
    }
    return false;
  }

  private generateSubscriptionId(namespace: string, eventName: string, _listener: (...args: any[]) => void): string {
    return `${namespace}:${eventName}:${Date.now()}:${Math.random().toString(36).substring(2, 11)}`;
  }

  private resetCleanupTimeout(emitter: PooledEventEmitter): void {
    if (emitter.cleanupTimeout) {
      clearTimeout(emitter.cleanupTimeout);
    }
    
    emitter.cleanupTimeout = setTimeout(() => {
      if (emitter.activeListeners.size === 0) {
        this.removeEmitter(emitter.namespace);
      }
    }, this.IDLE_TIMEOUT);
  }

  private removeEmitter(namespace: string): void {
    const emitter = this.pool.get(namespace);
    if (!emitter) return;
    

    if (emitter.cleanupTimeout) {
      clearTimeout(emitter.cleanupTimeout);
    }
    

    emitter.removeAllListeners();
    

    this.pool.delete(namespace);
    

    const subscriptionsToRemove: string[] = [];
    this.subscriptions.forEach((subscription, id) => {
      if (subscription.namespace === namespace) {
        subscriptionsToRemove.push(id);
      }
    });
    
    subscriptionsToRemove.forEach(id => {
      this.subscriptions.delete(id);
    });
  }

  private unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    const { emitter, eventName, listener } = subscription;
    

    emitter.removeListener(eventName, listener);
    

    const listeners = emitter.activeListeners.get(eventName);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        emitter.activeListeners.delete(eventName);
      }
    }
    

    this.subscriptions.delete(subscriptionId);
    

    emitter.lastActivity = new Date();
  }

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }
}


export const eventEmitterPool = new EventEmitterPool();


process.on('SIGTERM', () => {
  eventEmitterPool.shutdown();
});

process.on('SIGINT', () => {
  eventEmitterPool.shutdown();
});

export default eventEmitterPool;
