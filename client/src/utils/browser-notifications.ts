/**
 * Browser Notifications Utility
 * 
 * Provides cross-browser notification support with permission management,
 * intelligent context detection, and focus detection for the inbox system.
 */

export type NotificationPermission = 'granted' | 'denied' | 'default';

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: any;
  requireInteraction?: boolean;
  silent?: boolean;
  forceShow?: boolean; // Bypass focus detection for test notifications
}

export interface NotificationClickHandler {
  (data?: any): void;
}

class BrowserNotificationManager {
  private isSupported: boolean;
  private clickHandlers: Map<string, NotificationClickHandler> = new Map();

  constructor() {
    this.isSupported = 'Notification' in window;
    this.setupClickHandlers();
    this.setupVisibilityHandlers();
  }

  /**
   * Check if browser notifications are supported
   */
  isNotificationSupported(): boolean {
    return this.isSupported;
  }

  /**
   * Get current notification permission status
   */
  getPermissionStatus(): NotificationPermission {
    if (!this.isSupported) return 'denied';
    return Notification.permission as NotificationPermission;
  }

  /**
   * Request notification permission from the user
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) {
      return 'denied';
    }

    try {

      if ('requestPermission' in Notification) {
        const permission = await Notification.requestPermission();
        return permission as NotificationPermission;
      }
      

      return new Promise((resolve) => {
        Notification.requestPermission((permission) => {
          resolve(permission as NotificationPermission);
        });
      });
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }

  /**
   * Check if the page/tab is currently visible and focused
   */
  isPageVisible(): boolean {
    return !document.hidden && document.hasFocus();
  }

  /**
   * Check if the user is currently actively viewing the inbox
   * Returns true if user is on inbox page AND tab is focused
   */
  isActivelyViewingInbox(): boolean {
    const currentPath = window.location.pathname;
    const isOnInboxPage = currentPath === '/inbox' || currentPath === '/';
    const isTabFocused = this.isPageVisible();

    return isOnInboxPage && isTabFocused;
  }

  /**
   * Determine if we should show a notification based on user context
   * Shows notifications when:
   * - User is on a different page (not inbox)
   * - User is on inbox but tab is not focused/visible
   */
  shouldShowNotificationBasedOnContext(): boolean {

    if (this.isActivelyViewingInbox()) {
      return false;
    }


    return true;
  }



  /**
   * Show a browser notification
   */
  async showNotification(options: NotificationOptions): Promise<boolean> {



    if (!this.isSupported) {

      return false;
    }

    const permission = this.getPermissionStatus();
    if (permission !== 'granted') {

      return false;
    }


    if (!options.forceShow && !this.shouldShowNotificationBasedOnContext()) {

      return false;
    }

    try {

      const notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        tag: options.tag,
        data: options.data,
        requireInteraction: options.requireInteraction || false,
        silent: options.silent || false,

        badge: '/favicon.ico'
      });




      notification.onclick = (event) => {
        event.preventDefault();



        window.focus();

        const notificationTag = options.tag || 'default';

        let handler = this.clickHandlers.get(notificationTag);


        if (!handler && notificationTag.startsWith('conversation-')) {
          handler = this.clickHandlers.get('conversation');
        }

        if (handler) {

          handler(options.data);
        } else {

        }


        notification.close();
      };


      if (!options.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 10000);
      }


      return true;
    } catch (error) {
      console.error('Error showing notification:', error);
      return false;
    }
  }

  /**
   * Register a click handler for notifications with a specific tag
   */
  registerClickHandler(tag: string, handler: NotificationClickHandler): void {
    this.clickHandlers.set(tag, handler);
  }

  /**
   * Unregister a click handler
   */
  unregisterClickHandler(tag: string): void {
    this.clickHandlers.delete(tag);
  }

  /**
   * Setup global click handlers for notifications
   */
  private setupClickHandlers(): void {

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'notification-click') {
          const { tag, data } = event.data;
          const handler = this.clickHandlers.get(tag);
          if (handler) {
            handler(data);
          }
        }
      });
    }
  }

  /**
   * Setup visibility change handlers
   */
  private setupVisibilityHandlers(): void {

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {

        this.closeAllNotifications();
      }
    });


    window.addEventListener('focus', () => {
      this.closeAllNotifications();
    });
  }

  /**
   * Close all notifications (if possible)
   */
  private closeAllNotifications(): void {


    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'close-all-notifications'
        });
      }
    } catch (error) {

    }
  }

  /**
   * Test notification functionality
   */
  async testNotification(): Promise<boolean> {






    if (this.isSupported && this.getPermissionStatus() === 'granted') {
      try {

        const directNotification = new Notification('BotHive Test', {
          body: 'Direct notification test',
          icon: '/favicon.ico'
        });


        setTimeout(() => {
          directNotification.close();
        }, 5000);

        return true;
      } catch (error) {
        console.error('Direct notification failed:', error);
      }
    }


    return this.showNotification({
      title: 'BotHive Notifications',
      body: 'Notifications are working! You\'ll receive alerts for new messages.',
      tag: 'test-notification',
      requireInteraction: false,
      forceShow: true // Bypass focus detection for test
    });
  }

  /**
   * Get user-friendly permission status message
   */
  getPermissionStatusMessage(): string {
    const status = this.getPermissionStatus();
    switch (status) {
      case 'granted':
        return 'Notifications are enabled';
      case 'denied':
        return 'Notifications are blocked. Please enable them in your browser settings.';
      case 'default':
        return 'Click to enable notifications';
      default:
        return 'Notifications not supported';
    }
  }

  /**
   * Check if we can request permission (not already denied)
   */
  canRequestPermission(): boolean {
    return this.isSupported && this.getPermissionStatus() !== 'denied';
  }
}


export const notificationManager = new BrowserNotificationManager();


export const showMessageNotification = async (
  senderName: string,
  messagePreview: string,
  conversationId: number,
  isGroup: boolean = false
): Promise<boolean> => {
  const title = isGroup ? `${senderName} (Group)` : senderName;
  const body = messagePreview.length > 100 
    ? messagePreview.substring(0, 100) + '...' 
    : messagePreview;

  return notificationManager.showNotification({
    title,
    body,
    tag: `conversation-${conversationId}`,
    data: { conversationId, isGroup },
    icon: '/favicon.ico'
  });
};

export const requestNotificationPermission = () => notificationManager.requestPermission();
export const isNotificationSupported = () => notificationManager.isNotificationSupported();
export const getNotificationPermission = () => notificationManager.getPermissionStatus();
export const canRequestNotificationPermission = () => notificationManager.canRequestPermission();
export const testNotification = () => notificationManager.testNotification();
export const registerNotificationClickHandler = (tag: string, handler: NotificationClickHandler) =>
  notificationManager.registerClickHandler(tag, handler);


export const debugNotifications = () => {











  if (typeof Notification !== 'undefined') {


  } else {

  }


  if (Notification.permission === 'granted') {

    try {
      const testNotif = new Notification('Debug Test', {
        body: 'This is a debug notification',
        icon: '/favicon.ico'
      });

      setTimeout(() => testNotif.close(), 3000);
    } catch (error) {
      console.error('Simple notification failed:', error);
    }
  }
};


(window as any).debugNotifications = debugNotifications;
