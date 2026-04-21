import { useEffect, useRef, useState } from 'react';

type ToastPayload = {
  id: number;
  message: string;
};

type GlobalToastProps = {
  toast: ToastPayload | null;
  onDone: () => void;
};

const TOAST_LIFETIME_MS = 3000;
const TOAST_FADE_IN_MS = 300;
const TOAST_FADE_OUT_MS = 500;

export function GlobalToast({ toast, onDone }: GlobalToastProps) {
  const onDoneRef = useRef(onDone);
  const [renderedToast, setRenderedToast] = useState<ToastPayload | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!toast) {
      setIsVisible(false);
      const clearTimer = window.setTimeout(() => {
        setRenderedToast(null);
      }, TOAST_FADE_OUT_MS);

      return () => {
        window.clearTimeout(clearTimer);
      };
    }

    setRenderedToast(toast);
    setIsVisible(false);

    const enterFrame = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });
    const exitTimer = window.setTimeout(() => {
      setIsVisible(false);
    }, TOAST_LIFETIME_MS - TOAST_FADE_OUT_MS);
    const clearTimer = window.setTimeout(() => {
      setRenderedToast((current) => (current?.id === toast.id ? null : current));
      onDoneRef.current();
    }, TOAST_LIFETIME_MS);

    return () => {
      window.cancelAnimationFrame(enterFrame);
      window.clearTimeout(exitTimer);
      window.clearTimeout(clearTimer);
    };
  }, [toast]);

  if (!renderedToast) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <div
        className="rounded-[14px] px-8 py-2 text-center text-xs font-medium text-white"
        style={{
          width: 'min(60vw, 56rem)',
          maxWidth: '92vw',
          background:
            'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.88) 18%, rgba(0,0,0,0.92) 50%, rgba(0,0,0,0.88) 82%, rgba(0,0,0,0) 100%)',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.28)',
          opacity: isVisible ? 1 : 0,
          transition: `opacity ${isVisible ? TOAST_FADE_IN_MS : TOAST_FADE_OUT_MS}ms ease`
        }}
      >
        {renderedToast.message}
      </div>
    </div>
  );
}
