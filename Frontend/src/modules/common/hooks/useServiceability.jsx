import { useState, useEffect } from 'react';
import { loadBusinessSettings } from '@common/utils/businessSettings';

/**
 * Hook to check if a specific module is enabled globally in the admin settings.
 * @param {string} activeTab - The active tab identifier ('food', 'quick')
 * @returns {{ isModuleEnabled: boolean, loading: boolean }}
 */
export function useServiceability(activeTab) {
  const [isModuleEnabled, setIsModuleEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const checkStatus = async () => {
      try {
        setLoading(true);
        // Map activeTab to module key in global business settings
        const moduleMap = {
          food: 'food',
          quick: 'quickCommerce'
        };
        const moduleKey = moduleMap[activeTab];
        
        const settings = await loadBusinessSettings();
        if (settings && settings.modules && isMounted) {
          // If the module is explicitly set to false, it is disabled. Otherwise default to true.
          setIsModuleEnabled(settings.modules[moduleKey] !== false);
        }
      } catch (err) {
         if (isMounted) setIsModuleEnabled(true); // Fallback to true so we don't accidentally block the UI
      } finally {
         if (isMounted) setLoading(false);
      }
    };
    
    checkStatus();

    // Listen for settings updates dynamically
    const handleSettingsUpdate = () => {
       checkStatus();
    };
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate);

    return () => { 
      isMounted = false; 
      window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate);
    };
  }, [activeTab]);

  return { isModuleEnabled, loading };
}
