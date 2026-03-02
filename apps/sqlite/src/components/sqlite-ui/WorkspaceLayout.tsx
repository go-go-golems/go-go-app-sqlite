import type { ReactNode } from 'react';
import './sqlite-workspace.css';

export interface WorkspaceLayoutProps {
  children: ReactNode;
}

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  return <div data-part="sqlite-layout">{children}</div>;
}
