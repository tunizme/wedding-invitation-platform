'use client';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './v2/responsive.module.css';
const Desktop = createContext(false);
export const useDesktopLayout = () => useContext(Desktop);
/** The observed host surrounds the capped child, so 480px never masks the 768px threshold. */
export function InvitationViewport({
  children,
  policy = 'adaptive',
}: {
  children: ReactNode;
  policy?: 'adaptive' | 'mobile';
}) {
  const host = useRef<HTMLDivElement>(null),
    [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = (width: number) =>
      setDesktop(policy === 'adaptive' && width >= 768);
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((item) => item.target === element);
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(element);
    const css = getComputedStyle(element);
    update(
      element.clientWidth -
        parseFloat(css.paddingLeft) -
        parseFloat(css.paddingRight),
    );
    return () => observer.disconnect();
  }, [policy]);
  return (
    <div
      ref={host}
      data-invitation-host
      data-host-policy={policy}
      className={policy === 'mobile' ? styles.mobileHost : styles.host}
    >
      <Desktop.Provider value={desktop}>{children}</Desktop.Provider>
    </div>
  );
}
