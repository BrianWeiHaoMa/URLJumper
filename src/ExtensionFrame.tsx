import type { ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
};

export function ExtensionFrame({ title, children }: Props) {
  return (
    <div className="extension-shell">
      <header className="extension-titlebar">
        <h1 className="extension-titlebar-title">{title}</h1>
      </header>
      <div className="extension-body">{children}</div>
    </div>
  );
}
