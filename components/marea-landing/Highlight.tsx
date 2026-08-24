import { ReactNode } from "react";

export function Highlight({ children }: { children: ReactNode }) {
  return <span className="ml-highlight">{children}</span>;
}
