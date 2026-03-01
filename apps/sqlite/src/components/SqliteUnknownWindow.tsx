export interface SqliteUnknownWindowProps {
  instanceId: string;
}

export function SqliteUnknownWindow({ instanceId }: SqliteUnknownWindowProps) {
  return (
    <section style={{ padding: 12, display: 'grid', gap: 8 }}>
      <strong>SQLite</strong>
      <span>Unknown sqlite window instance: {instanceId}</span>
    </section>
  );
}
