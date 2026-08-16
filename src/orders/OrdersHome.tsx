import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import {
  ArrowRight,
  ClipboardList,
  Plus,
  Search,
  ShoppingBag,
} from "lucide-react";
import { supabase } from "../lib/supabase";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

type SaleRow = {
  id: string;
  cliente_nome: string;
  total: number;
  status: "recebido" | "aprovado" | "cancelado" | "concluido";
  situacao_pagamento: string;
  forma_pagamento: string;
  tipo_pedido: string;
  created_at: string;
};

export function OrdersHome({
  ownerId,
  onNewSale,
}: {
  ownerId: string;
  onNewSale: () => void;
}) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["sales-dashboard", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendas")
        .select(
          "id,cliente_nome,total,status,situacao_pagamento,forma_pagamento,tipo_pedido,created_at",
        )
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        total: Number(row.total),
      })) as SaleRow[];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return query.data ?? [];
    return (query.data ?? []).filter(
      (sale) =>
        sale.cliente_nome.toLocaleLowerCase("pt-BR").includes(term) ||
        sale.id.toLowerCase().includes(term),
    );
  }, [query.data, search]);
  const counts = useMemo(
    () => ({
      received: (query.data ?? []).filter((s) => s.status === "recebido")
        .length,
      approved: (query.data ?? []).filter((s) => s.status === "aprovado")
        .length,
      completed: (query.data ?? []).filter((s) => s.status === "concluido")
        .length,
      total: (query.data ?? []).length,
    }),
    [query.data],
  );

  return (
    <main className="module-page orders-page">
      <header className="module-header">
        <div>
          <span className="module-kicker">CENTRAL DE OPERAÇÃO</span>
          <h1>Pedidos</h1>
          <p>Acompanhe as vendas recentes e comece um novo atendimento.</p>
        </div>
        <Button className="primary-action" onPress={onNewSale}>
          <Plus size={20} /> Nova venda
        </Button>
      </header>
      <section className="order-metrics" aria-label="Resumo dos pedidos">
        <article>
          <span>Todos</span>
          <strong>{counts.total}</strong>
          <small>últimas 50 vendas</small>
        </article>
        <article>
          <span>Aguardando aprovação</span>
          <strong>{counts.received}</strong>
          <small>pedidos recebidos</small>
        </article>
        <article>
          <span>Em andamento</span>
          <strong>{counts.approved}</strong>
          <small>pedidos aprovados</small>
        </article>
        <article>
          <span>Concluídos</span>
          <strong>{counts.completed}</strong>
          <small>pedidos finalizados</small>
        </article>
      </section>
      <section className="orders-panel">
        <div className="panel-toolbar">
          <div>
            <h2>Pedidos recentes</h2>
            <p>Dados reais registrados no caixa.</p>
          </div>
          <label className="orders-search">
            <Search size={19} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cliente ou código do pedido"
            />
          </label>
        </div>
        {query.isLoading && (
          <div className="orders-state">Carregando pedidos...</div>
        )}
        {query.isError && (
          <div className="orders-state error">
            Não foi possível carregar os pedidos. Tente novamente.
          </div>
        )}
        {!query.isLoading && !query.isError && rows.length === 0 && (
          <div className="orders-empty">
            <span>
              <ClipboardList size={30} />
            </span>
            <h3>
              {search ? "Nenhum pedido encontrado" : "Nenhum pedido por aqui"}
            </h3>
            <p>
              {search
                ? "Tente outro nome ou código."
                : "A primeira venda registrada aparecerá nesta lista."}
            </p>
            {!search && (
              <Button className="secondary-action" onPress={onNewSale}>
                Abrir Venda+ <ArrowRight size={18} />
              </Button>
            )}
          </div>
        )}
        {rows.length > 0 && (
          <div className="orders-list">
            {rows.map((sale) => (
              <article className="order-row" key={sale.id}>
                <span className="order-icon">
                  <ShoppingBag size={20} />
                </span>
                <div className="order-main">
                  <strong>{sale.cliente_nome}</strong>
                  <small>
                    #{sale.id.slice(0, 8).toUpperCase()} ·{" "}
                    {date.format(new Date(sale.created_at))}
                  </small>
                </div>
                <span className="order-type">{sale.tipo_pedido}</span>
                <span className={`status-pill status-${sale.status}`}>
                  {sale.status}
                </span>
                <div className="order-value">
                  <strong>{money.format(sale.total)}</strong>
                  <small>
                    {sale.forma_pagamento} · {sale.situacao_pagamento}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
