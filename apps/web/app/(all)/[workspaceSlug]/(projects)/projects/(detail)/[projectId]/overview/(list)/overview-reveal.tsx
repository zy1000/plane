import { type FC, type ReactNode, useEffect, useState } from "react";
import { cn } from "@plane/utils";

type Props = {
  /** 进场延迟（毫秒），用于错落式渐入 */
  delay?: number;
  className?: string;
  children: ReactNode;
};

/** 轻量进场动画：挂载后淡入并上移，靠 transitionDelay 实现错落效果 */
export const Reveal: FC<Props> = ({ delay = 0, className, children }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out motion-reduce:transition-none",
        mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        className
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};
