import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Global cache for route scroll positions
const scrollPosMap = new Map();

/**
 * Captures current window and container scroll positions for a given route key
 */
export const captureCurrentScrollPos = (pathKey) => {
  if (!pathKey || typeof window === 'undefined') return;

  const windowY = window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
  const containerScrolls = [];

  const scrollableElements = document.querySelectorAll(
    'main, [role="main"], .overflow-y-auto, .overflow-auto, #root > div, section, article, [data-scroll-container]'
  );

  scrollableElements.forEach((el) => {
    if (el && typeof el.scrollTop === 'number' && el.scrollTop > 0) {
      if (!el.closest('aside, nav, [data-sidebar], .sidebar, .admin-sidebar-scroll, [data-no-scroll-reset]')) {
        containerScrolls.push({ element: el, scrollTop: el.scrollTop });
      }
    }
  });

  scrollPosMap.set(pathKey, { windowY, containerScrolls });
};

/**
 * Resets scroll to top for new page navigation (PUSH/REPLACE)
 */
export const scrollToAllTops = () => {
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    window.scrollTo(0, 0);
  }

  if (typeof document !== 'undefined') {
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    const scrollableElements = document.querySelectorAll(
      'main, [role="main"], .overflow-y-auto, .overflow-auto, #root > div, section, article'
    );
    scrollableElements.forEach((el) => {
      if (el && typeof el.scrollTop === 'number' && el.scrollTop > 0) {
        if (el.closest('aside, nav, [data-sidebar], .sidebar, .admin-sidebar-scroll, [data-no-scroll-reset]')) {
          return;
        }
        el.scrollTop = 0;
      }
    });
  }
};

/**
 * Restores saved scroll position when navigating back (POP)
 */
export const restoreScrollPosition = (pathKey) => {
  if (!pathKey || !scrollPosMap.has(pathKey)) return false;

  const savedState = scrollPosMap.get(pathKey);
  if (!savedState) return false;

  const { windowY, containerScrolls } = savedState;

  const applyRestore = () => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: windowY, left: 0, behavior: 'instant' });
      if (document.documentElement) document.documentElement.scrollTop = windowY;
      if (document.body) document.body.scrollTop = windowY;
    }

    if (containerScrolls && containerScrolls.length > 0) {
      containerScrolls.forEach(({ element, scrollTop }) => {
        if (element && typeof element.scrollTop === 'number') {
          element.scrollTop = scrollTop;
        }
      });
    }
  };

  applyRestore();
  const t1 = setTimeout(applyRestore, 30);
  const t2 = setTimeout(applyRestore, 100);
  const t3 = setTimeout(applyRestore, 250);
  const t4 = setTimeout(applyRestore, 500);

  return true;
};

const GlobalScrollToTop = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const prevKeyRef = useRef(location.key || location.pathname);

  // Continuously capture scroll position on scroll and route departure
  useEffect(() => {
    const currentKey = location.key || location.pathname;

    const handleScroll = () => {
      captureCurrentScrollPos(currentKey);
      captureCurrentScrollPos(location.pathname);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      captureCurrentScrollPos(currentKey);
      captureCurrentScrollPos(location.pathname);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [location.key, location.pathname]);

  // Handle scroll position on route changes
  useEffect(() => {
    const currentKey = location.key || location.pathname;

    if (navType === 'POP') {
      // User clicked BACK or FORWARD -> Restore exact previous scroll position!
      const restored = restoreScrollPosition(currentKey) || restoreScrollPosition(location.pathname);
      if (!restored) {
        scrollToAllTops();
      }
    } else {
      // User clicked a NEW link (PUSH/REPLACE) -> Start fresh from top!
      scrollToAllTops();
    }

    prevKeyRef.current = currentKey;
  }, [location.pathname, location.search, location.hash, location.key, navType]);

  return null;
};

export default GlobalScrollToTop;
