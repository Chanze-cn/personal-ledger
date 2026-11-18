import { useEffect, useRef } from 'react';

/**
 * 鼠标跟随背景光斑。
 * 性能要点：
 * 1. 只渲染两个固定位置的合成层，使用 translate3d 移动，不触发重排；
 * 2. requestAnimationFrame 中做线性插值，鼠标静止后自动停止循环，空闲时零开销；
 * 3. 触摸设备与 prefers-reduced-motion 下直接不启用。
 */
export function CursorGlow({ dark = false }: { dark?: boolean }) {
  const brandRef = useRef<HTMLDivElement>(null);
  const mintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reduceMotion.matches) return;

    const brand = brandRef.current;
    const mint = mintRef.current;
    if (!brand || !mint) return;

    const target = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.3 };
    const brandPos = { ...target };
    const mintPos = { ...target };
    let frame = 0;
    let brandSize = { w: brand.offsetWidth, h: brand.offsetHeight };
    let mintSize = { w: mint.offsetWidth, h: mint.offsetHeight };

    const measure = () => {
      brandSize = { w: brand.offsetWidth, h: brand.offsetHeight };
      mintSize = { w: mint.offsetWidth, h: mint.offsetHeight };
    };

    const render = () => {
      brand.style.transform = `translate3d(${brandPos.x - brandSize.w / 2}px, ${
        brandPos.y - brandSize.h / 2
      }px, 0)`;
      mint.style.transform = `translate3d(${mintPos.x - mintSize.w / 2}px, ${
        mintPos.y - mintSize.h / 2
      }px, 0)`;
    };

    const tick = () => {
      brandPos.x += (target.x - brandPos.x) * 0.16;
      brandPos.y += (target.y - brandPos.y) * 0.16;
      mintPos.x += (target.x - mintPos.x) * 0.07;
      mintPos.y += (target.y - mintPos.y) * 0.07;
      render();

      const brandSettled =
        Math.abs(target.x - brandPos.x) < 0.4 && Math.abs(target.y - brandPos.y) < 0.4;
      const mintSettled = Math.abs(target.x - mintPos.x) < 0.4 && Math.abs(target.y - mintPos.y) < 0.4;
      if (brandSettled && mintSettled) {
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      target.x = event.clientX;
      target.y = event.clientY;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    render();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', measure, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', measure);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={`cursor-layer ${dark ? 'dark-surface' : ''}`} aria-hidden="true">
      <div ref={brandRef} className="cursor-orb cursor-orb--brand" />
      <div ref={mintRef} className="cursor-orb cursor-orb--mint" />
    </div>
  );
}
