import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

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
        // Do NOT reset scroll position for sidebars, navigation panels, or elements inside sidebar/nav
        if (el.closest('aside, nav, [data-sidebar], .sidebar, .admin-sidebar-scroll, [data-no-scroll-reset]')) {
          return;
        }
        el.scrollTop = 0;
      }
    });
  }
};

const GlobalScrollToTop = () => {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    scrollToAllTops();

    const t1 = setTimeout(scrollToAllTops, 30);
    const t2 = setTimeout(scrollToAllTops, 100);
    const t3 = setTimeout(scrollToAllTops, 300);

    const rafId = requestAnimationFrame(scrollToAllTops);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      cancelAnimationFrame(rafId);
    };
  }, [pathname, search, hash]);

  return null;
};

export default GlobalScrollToTop;
