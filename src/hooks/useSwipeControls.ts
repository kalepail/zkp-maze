import { useEffect, useRef } from 'react';
import { NORTH, EAST, SOUTH, WEST } from '../constants/maze';

interface SwipeConfig {
  onSwipe: (direction: number) => void;
  minSwipeDistance?: number;
  enabled?: boolean;
}

export function useSwipeControls({
  onSwipe,
  minSwipeDistance = 50,
  enabled = true,
}: SwipeConfig) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Determine if swipe was significant enough
      if (absX < minSwipeDistance && absY < minSwipeDistance) {
        touchStartRef.current = null;
        return;
      }

      // Determine direction based on larger delta
      if (absX > absY) {
        // Horizontal swipe
        if (deltaX > 0) {
          onSwipe(EAST);
        } else {
          onSwipe(WEST);
        }
      } else {
        // Vertical swipe
        if (deltaY > 0) {
          onSwipe(SOUTH);
        } else {
          onSwipe(NORTH);
        }
      }

      touchStartRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipe, minSwipeDistance, enabled]);
}
