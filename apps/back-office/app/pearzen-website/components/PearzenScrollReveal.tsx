'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type PearzenScrollRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  variant?: 'up' | 'scale' | 'left' | 'right';
};

export default function PearzenScrollReveal({
  children,
  className = '',
  delay = 0,
  variant = 'up',
}: PearzenScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const style = { '--pearzen-reveal-delay': `${delay}ms` } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`pearzen-reveal pearzen-reveal--${variant} ${visible ? 'is-visible' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
