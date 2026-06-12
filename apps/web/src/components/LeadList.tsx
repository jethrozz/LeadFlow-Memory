import type { DashboardLeadItem } from "../types";

export function LeadList(props: {
  leads: DashboardLeadItem[];
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
}) {
  return (
    <>
      <h2>线索列表</h2>
      {props.leads.map((lead) => (
        <button
          className={lead.id === props.selectedLeadId ? "lead-card is-selected" : "lead-card"}
          key={lead.id}
          onClick={() => props.onSelectLead(lead.id)}
        >
          <strong>
            {lead.displayName}
            {lead.isDemoSeed && (
              <span style={{
                marginLeft: '6px',
                fontSize: '0.65em',
                fontWeight: 'normal',
                color: '#fff',
                background: '#f97316',
                borderRadius: '3px',
                padding: '1px 5px',
                verticalAlign: 'middle',
                letterSpacing: '0.02em',
              }}>演示数据</span>
            )}
          </strong>
          <span>{lead.intentLevel} · {lead.status}</span>
          <small>{lead.summary}</small>
        </button>
      ))}
    </>
  );
}
