import { Button } from "react-aria-components";
import { ArrowRight, Blocks } from "lucide-react";

export function ComingSoon({
  title,
  onOpenSale,
}: {
  title: string;
  onOpenSale: () => void;
}) {
  return (
    <main className="module-page">
      <header className="module-header">
        <div>
          <span className="module-kicker">DOM FRIOS</span>
          <h1>{title}</h1>
          <p>Esta área já tem lugar definido na nova estrutura do sistema.</p>
        </div>
      </header>
      <section className="coming-soon">
        <span>
          <Blocks size={32} />
        </span>
        <p className="coming-label">EM BREVE</p>
        <h2>{title} será desenvolvido na próxima etapa</h2>
        <p>
          A navegação está pronta para o sistema crescer sem misturar esta
          função com o caixa ou com a impressão.
        </p>
        <Button className="primary-action" onPress={onOpenSale}>
          Ir para Venda+ <ArrowRight size={18} />
        </Button>
      </section>
    </main>
  );
}
