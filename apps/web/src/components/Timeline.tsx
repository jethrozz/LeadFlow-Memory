import type { DashboardLeadDetail } from "../types";

export function Timeline({ detail }: { detail: DashboardLeadDetail | null }) {
  return (
    <section className="timeline-card">
      <h2>Memory Timeline</h2>
      {(detail?.timeline ?? []).map((event) => (
        <article className="timeline-event" key={event.id}>
          <strong>{event.type}</strong>
          <p>{event.summary}</p>
          <small>{event.createdAt}</small>
        </article>
      ))}
    </section>
  );
}
