import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  isDark?: boolean;
  scrollAmount?: number;
  showButtonsAlways?: boolean;
  leftButtonOffset?: string;
  rightButtonOffset?: string;
}

export function ScrollContainer({
  children,
  className = '',
  isDark = true,
  scrollAmount = 280,
  showButtonsAlways = true,
}: ScrollContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (!containerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    // Allow small margin of error
    setCanScrollLeft(scrollLeft > 3);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 3);
  };

  useEffect(() => {
    checkScroll();
    const el = containerRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll, { passive: true });
      window.addEventListener('resize', checkScroll);
    }
    // Re-check after render
    const timer = setTimeout(checkScroll, 100);
    return () => {
      if (el) el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
      clearTimeout(timer);
    };
  }, [children]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;
    const delta = direction === 'left' ? -scrollAmount : scrollAmount;
    containerRef.current.scrollBy({ left: delta, behavior: 'smooth' });
    setTimeout(checkScroll, 350);
  };

  return (
    <div className="relative group/scroll flex items-center w-full max-w-full min-w-0">
      {/* Left Scroll Button */}
      <button
        type="button"
        onClick={() => handleScroll('left')}
        disabled={!canScrollLeft}
        aria-label="Scroll Left"
        title="Scroll Left"
        className={`absolute -left-2 z-30 p-1.5 rounded-full shadow-xl border transition-all duration-200 cursor-pointer flex items-center justify-center shrink-0 ${
          !canScrollLeft
            ? 'opacity-20 cursor-not-allowed scale-90'
            : 'opacity-90 hover:opacity-100 hover:scale-110 active:scale-95 shadow-indigo-500/20'
        } ${
          isDark
            ? 'bg-slate-900 border-indigo-500/50 text-indigo-300 hover:bg-slate-800 hover:border-indigo-400'
            : 'bg-white border-indigo-300 text-indigo-700 hover:bg-slate-50 hover:border-indigo-500 shadow-slate-300'
        }`}
      >
        <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
      </button>

      {/* Scrollable Content Container */}
      <div
        ref={containerRef}
        className={`overflow-x-auto scroll-smooth custom-scrollbar w-full ${className}`}
      >
        {children}
      </div>

      {/* Right Scroll Button */}
      <button
        type="button"
        onClick={() => handleScroll('right')}
        disabled={!canScrollRight}
        aria-label="Scroll Right"
        title="Scroll Right"
        className={`absolute -right-2 z-30 p-1.5 rounded-full shadow-xl border transition-all duration-200 cursor-pointer flex items-center justify-center shrink-0 ${
          !canScrollRight
            ? 'opacity-20 cursor-not-allowed scale-90'
            : 'opacity-90 hover:opacity-100 hover:scale-110 active:scale-95 shadow-indigo-500/20'
        } ${
          isDark
            ? 'bg-slate-900 border-indigo-500/50 text-indigo-300 hover:bg-slate-800 hover:border-indigo-400'
            : 'bg-white border-indigo-300 text-indigo-700 hover:bg-slate-50 hover:border-indigo-500 shadow-slate-300'
        }`}
      >
        <ChevronRight className="w-4 h-4 stroke-[2.5]" />
      </button>
    </div>
  );
}
