import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopProps {
  container: HTMLDivElement | null;
}

export const ScrollToTop: React.FC<ScrollToTopProps> = ({ container }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!container) return;

    const toggleVisibility = () => {
      if (container.scrollTop > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    container.addEventListener('scroll', toggleVisibility);
    return () => container.removeEventListener('scroll', toggleVisibility);
  }, [container]);

  const scrollToTop = () => {
    if (container) {
      container.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  return (
    <button
      onClick={scrollToTop}
      className={`fixed bottom-8 right-8 p-3 rounded-full bg-slate-900 text-white shadow-lg transition-all duration-300 hover:bg-slate-700 hover:scale-110 z-50 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'
      }`}
      aria-label="Scroll to top"
    >
      <ArrowUp size={24} />
    </button>
  );
};
