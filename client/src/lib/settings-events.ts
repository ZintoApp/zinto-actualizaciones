
export type SettingsEventType = 'FRONTEND_WEBSITE_TOGGLED';

export const SETTINGS_EVENTS: Record<SettingsEventType, SettingsEventType> = {
  FRONTEND_WEBSITE_TOGGLED: 'FRONTEND_WEBSITE_TOGGLED'
};

class SettingsEventEmitter {
  private listeners: Map<SettingsEventType, Array<(data?: any) => void>> = new Map();

  subscribe(event: SettingsEventType, callback: (data?: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    const eventListeners = this.listeners.get(event)!;
    eventListeners.push(callback);
    

    return () => {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    };
  }

  emit(event: SettingsEventType, data?: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in settings event listener for ${event}:`, error);
        }
      });
    }
  }
}


export const settingsEvents = new SettingsEventEmitter();


if (typeof window !== 'undefined') {
  (window as any).settingsEvents = settingsEvents;
}
