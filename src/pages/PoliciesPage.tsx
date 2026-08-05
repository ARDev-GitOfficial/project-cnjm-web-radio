export function PoliciesPage() {
  return (
    <div className="page">
      <header className="page-header">
        <span className="eyebrow">Privacidade</span>
        <h1>Políticas</h1>
        <p>Termos de uso e privacidade da experiência web da rádio.</p>
      </header>

      <section className="policy-grid">
        <article className="glass-panel policy-card">
          <h2>Rádio e visualizador</h2>
          <p>
            O áudio é reproduzido pelo stream público da rádio. O visualizador usa o áudio
            liberado pelo navegador ou uma animação segura quando o navegador bloquear o acesso.
          </p>
        </article>
        <article className="glass-panel policy-card">
          <h2>Bate-papo</h2>
          <p>
            O site pode ler mensagens públicas quando o servidor responder. Mensagens digitadas
            aqui ficam somente neste navegador e não são publicadas automaticamente.
          </p>
        </article>
        <article className="glass-panel policy-card">
          <h2>Pedidos</h2>
          <p>
            Pedidos musicais são preparados para envio externo por WhatsApp. A confirmação final
            acontece fora do site, por ação explícita do ouvinte.
          </p>
        </article>
        <article className="glass-panel policy-card">
          <h2>Contato</h2>
          <p>
            Para privacidade, moderação ou remoção de conteúdo, fale com a rádio pelo WhatsApp
            +55 92 98422-7531.
          </p>
        </article>
      </section>
    </div>
  );
}
