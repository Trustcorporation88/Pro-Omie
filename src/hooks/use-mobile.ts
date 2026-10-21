import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function assinar(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    assinar,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  );
}
