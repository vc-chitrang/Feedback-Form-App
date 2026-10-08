import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { cx } from '@ff/form-renderer';

export type PreviewDevice = 'tablet' | 'phone';
const SIZES: Record<PreviewDevice, { w: number; h: number }> = {
  tablet: { w: 1180, h: 820 }, // landscape kiosk tablet
  phone: { w: 390, h: 780 }, // visitor phone (QR link)
};

/**
 * Renders children at real device pixel size and scales the whole frame down to fit,
 * so the preview is pixel-identical to the kiosk / phone (the renderer uses container queries).
 */
export function DevicePreview({ device, children }: { device: PreviewDevice; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const size = SIZES[device];

  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxW = device === 'phone' ? Math.min(width, 340) : width;
  // The frame adds 16px of padding (p-2 each side); keep the total within the column.
  const scale = maxW > 16 ? Math.min(1, (maxW - 16) / size.w) : 0;

  return (
    <div ref={outer} className="w-full">
      <div
        className={cx('mx-auto overflow-hidden bg-stone-900 shadow-xl ring-1 ring-stone-900/10', device === 'phone' ? 'rounded-[2rem] p-2' : 'rounded-2xl p-2')}
        style={{ width: size.w * scale + 16, height: size.h * scale + 16 }}
      >
        <div className={cx('overflow-hidden bg-white', device === 'phone' ? 'rounded-[1.6rem]' : 'rounded-lg')} style={{ width: size.w * scale, height: size.h * scale }}>
          <div style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function DeviceToggle({ value, onChange }: { value: PreviewDevice; onChange: (d: PreviewDevice) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-stone-200/70 p-0.5" role="radiogroup" aria-label="Preview device">
      {(['tablet', 'phone'] as const).map((d) => {
        const Icon = d === 'tablet' ? Monitor : Smartphone;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value === d}
            onClick={() => onChange(d)}
            className={cx('flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium capitalize', value === d ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600')}
          >
            <Icon className="size-3.5" aria-hidden /> {d === 'tablet' ? 'Kiosk' : 'Phone'}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-stone-200/70 p-0.5" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-md px-2.5 py-1 text-xs font-medium', value === o.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
