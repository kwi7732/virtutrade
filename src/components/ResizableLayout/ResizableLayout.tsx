'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import styles from './ResizableLayout.module.css';

interface ResizableLayoutProps {
  children: React.ReactNode[];
  defaultSizes: number[];   // percentages (must sum to 100)
  minSizes?: number[];      // minimum widths in px
  direction?: 'horizontal' | 'vertical';
  className?: string;
}

export default function ResizableLayout({
  children,
  defaultSizes,
  minSizes,
  direction = 'horizontal',
  className = '',
}: ResizableLayoutProps) {
  const [sizes, setSizes] = useState<number[]>(defaultSizes);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    index: number;
    startPos: number;
    startSizes: number[];
  } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    dragState.current = {
      index,
      startPos: direction === 'horizontal' ? e.clientX : e.clientY,
      startSizes: [...sizes],
    };
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  }, [sizes, direction]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState.current || !containerRef.current) return;
      const { index, startPos, startSizes } = dragState.current;
      const containerRect = containerRef.current.getBoundingClientRect();
      const containerSize = direction === 'horizontal' ? containerRect.width : containerRect.height;
      const currentPos = direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = ((currentPos - startPos) / containerSize) * 100;

      const newSizes = [...startSizes];
      const minA = minSizes?.[index] ? (minSizes[index] / containerSize) * 100 : 5;
      const minB = minSizes?.[index + 1] ? (minSizes[index + 1] / containerSize) * 100 : 5;

      let sizeA = startSizes[index] + delta;
      let sizeB = startSizes[index + 1] - delta;

      if (sizeA < minA) { sizeA = minA; sizeB = startSizes[index] + startSizes[index + 1] - minA; }
      if (sizeB < minB) { sizeB = minB; sizeA = startSizes[index] + startSizes[index + 1] - minB; }

      newSizes[index] = sizeA;
      newSizes[index + 1] = sizeB;
      setSizes(newSizes);
    };

    const handleMouseUp = () => {
      dragState.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, minSizes]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${isHorizontal ? styles.horizontal : styles.vertical} ${className}`}
    >
      {children.map((child, i) => (
        <React.Fragment key={i}>
          <div
            className={styles.panel}
            style={isHorizontal ? { width: `${sizes[i]}%` } : { height: `${sizes[i]}%` }}
          >
            {child}
          </div>
          {i < children.length - 1 && (
            <div
              className={`${styles.splitter} ${isHorizontal ? styles.splitterH : styles.splitterV}`}
              onMouseDown={(e) => handleMouseDown(e, i)}
            >
              <div className={styles.splitterLine} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
