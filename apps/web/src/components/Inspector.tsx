import type { DashboardLeadDetail } from "../types";

export function Inspector({ detail }: { detail: DashboardLeadDetail | null }) {
  return (
    <>
      <h2>Inspector</h2>
      <section>
        <h3>MemWal Memory</h3>
        {(detail?.memories ?? []).map((memory) => (
          <p className="inspector-item" key={memory.id}>{memory.content}</p>
        ))}
      </section>
      <section>
        <h3>Walrus Artifacts</h3>
        {(detail?.artifacts ?? []).map((artifact) => (
          <p className="inspector-item" key={artifact.id}>{artifact.type}: {artifact.blobId}</p>
        ))}
      </section>
    </>
  );
}
