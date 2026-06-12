import "./styles.css";

export function App() {
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Walrus Track Demo</p>
        <h1>LeadFlow Memory</h1>
        <p>可验证长期记忆销售 Agent 工作台</p>
      </header>
      <section className="dashboard-grid">
        <aside className="panel">
          <h2>线索列表</h2>
        </aside>
        <section className="panel">
          <h2>客户长期记忆</h2>
        </section>
        <aside className="panel">
          <h2>Inspector</h2>
        </aside>
      </section>
    </main>
  );
}
