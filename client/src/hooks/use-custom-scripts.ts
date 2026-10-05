import React, { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { accountNetworkPaused } from '@/lib/account-network';

interface CustomScriptsSettings {
  enabled: boolean;
  scripts: string;
  lastModified: string;
}

export function useCustomScripts() {
  const injectedScriptsRef = useRef<HTMLElement[]>([]);


  const { data: customScriptsData } = useQuery({
    queryKey: ['/public/custom-scripts'],
    queryFn: async () => {

      let res = await fetch('/public/custom-scripts', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {

        res = await apiRequest('GET', '/api/admin/settings/custom-scripts');
        if (!res.ok) {
          return {
            enabled: false,
            scripts: '',
            lastModified: new Date().toISOString()
          };
        }
      }

      return res.json();
    },
    staleTime: 1 * 60 * 1000, // 1 minute (shorter cache for scripts)
    refetchOnWindowFocus: false,
  });


  const customScriptsSettings: CustomScriptsSettings | undefined = React.useMemo(() => {
    if (!customScriptsData) {
      return undefined;
    }
    return customScriptsData;
  }, [customScriptsData]);

  const cleanupInjectedScripts = () => {

    injectedScriptsRef.current.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    injectedScriptsRef.current = [];
  };

  const injectCustomScripts = (scripts: string) => {
    try {
      cleanupInjectedScripts();

      if (!scripts.trim()) {
        return;
      }




      const sanitizedScripts = scripts;


      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = sanitizedScripts;

      Array.from(tempContainer.children).forEach((element) => {
        const clonedElement = element.cloneNode(true) as HTMLElement;
        clonedElement.setAttribute('data-custom-script', 'true');

        if (clonedElement.tagName.toLowerCase() === 'script') {
          const newScript = document.createElement('script');


          Array.from(clonedElement.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
          });


          if (!clonedElement.getAttribute('src')) {
            newScript.textContent = clonedElement.textContent;
          }

          newScript.setAttribute('data-custom-script', 'true');
          document.head.appendChild(newScript);
          injectedScriptsRef.current.push(newScript);
        } else {

          document.head.appendChild(clonedElement);
          injectedScriptsRef.current.push(clonedElement);
        }
      });


    } catch (error) {
      console.error('Error injecting custom scripts:', error);
    }
  };

  useEffect(() => {
    if (customScriptsSettings?.enabled && customScriptsSettings.scripts) {
      injectCustomScripts(customScriptsSettings.scripts);
    } else {
      cleanupInjectedScripts();
    }

    return () => {
      cleanupInjectedScripts();
    };
  }, [customScriptsSettings]);


  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'customScriptsUpdated') {
          const { data } = message;
          if (data?.enabled && data.scripts) {
            injectCustomScripts(data.scripts);
          } else {
            cleanupInjectedScripts();
          }
        }
      } catch (error) {

      }
    };


    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let socket: WebSocket | null = null;

    const disconnect = () => {
      if (socket) {
        socket.removeEventListener('message', handleWebSocketMessage);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        socket = null;
      }
    };
    const reconnect = () => {
      disconnect();
      if (accountNetworkPaused()) return;
      socket = new WebSocket(wsUrl);
      socket.addEventListener('message', handleWebSocketMessage);
    };
    reconnect();
    window.addEventListener('account-network-state', reconnect);
    return () => { disconnect(); window.removeEventListener('account-network-state', reconnect); };
  }, []);

  return {
    customScriptsSettings,
    isEnabled: customScriptsSettings?.enabled || false,
    scriptsCount: injectedScriptsRef.current.length
  };
}
