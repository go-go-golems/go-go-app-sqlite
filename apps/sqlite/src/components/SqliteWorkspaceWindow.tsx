export interface SqliteWorkspaceWindowProps {
  apiBasePrefix: string;
}

export function SqliteWorkspaceWindow({ apiBasePrefix }: SqliteWorkspaceWindowProps) {
  return (
    <section style={{ padding: 12, display: 'grid', gap: 8, height: '100%', alignContent: 'start' }}>
      <strong>SQLite</strong>
      <span>Workspace scaffold ready.</span>
      <code>API base: {apiBasePrefix}</code>
      <span style={{ color: '#666', fontSize: 12 }}>
        Query workbench and HyperCard integration are implemented in later phases.
      </span>
    </section>
  );
}
