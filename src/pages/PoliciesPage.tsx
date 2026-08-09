export function PoliciesPage() {
  return (
    <div className="page">
      <header className="page-header">
        <span className="eyebrow">Privacidade</span>
        <h1>Privacidade</h1>
        <p>Privacidade da experiência web da rádio.</p>
      </header>

      <section className="policy-grid">
        <article className="glass-panel policy-card">
          <h2>Dados técnicos</h2>
          <p>
            O site consulta dados públicos da transmissão, incluindo status do stream, faixa
            atual, programação e disponibilidade da câmera, para manter a rádio atualizada.
          </p>
        </article>
        <article className="glass-panel policy-card">
          <h2>Preferências locais</h2>
          <p>
            Volume, equalizador e alguns ajustes de navegação podem ser guardados neste
            navegador para melhorar a experiência sem pedir a mesma configuração toda vez.
          </p>
        </article>
        <article className="glass-panel policy-card">
          <h2>Mensagens e pedidos</h2>
          <p>
            Informações enviadas pelo ouvinte são usadas apenas para contato com a rádio,
            organização de pedidos musicais e moderação quando necessário.
          </p>
        </article>
        <article className="glass-panel policy-card">
          <h2>Publicidade e segurança</h2>
          <p>
            Anúncios podem registrar exibições e cliques para controle interno. A área
            administrativa é restrita e não expõe configurações sensíveis do sistema.
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
