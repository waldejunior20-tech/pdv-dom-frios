import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { Button } from "react-aria-components";
import { CreditCard, Search, Trash2, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { SaleSchema, type CartItem } from "./schemas";
import { PrintingSettings } from "./printing/PrintingSettings";
import { enqueueReceipt, loadPrinting, makeReceipt } from "./printing/service";
import { AppShell, type AppSection } from "./shell/AppShell";
import { ComingSoon } from "./shell/ComingSoon";
import { OrdersHome } from "./orders/OrdersHome";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const paymentToDb = {
  Pix: "pix",
  Dinheiro: "dinheiro",
  Cartão: "cartao",
  Prazo: "prazo",
} as const;

type Payment = keyof typeof paymentToDb;
type Category = "Todos" | "Frios" | "Molhos" | "Massas" | "Outros";
type Product = {
  id: string;
  nome: string;
  unidade: string;
  preco_padrao: number;
};

const categories: Category[] = ["Todos", "Frios", "Molhos", "Massas", "Outros"];

function categoryOf(name: string): Exclude<Category, "Todos"> {
  const n = name.toLocaleLowerCase("pt-BR");
  if (
    /mussarela|muçarela|presunto|apresuntado|bacon|calabresa|mortadela|queijo|peito/.test(
      n,
    )
  )
    return "Frios";
  if (/ketchup|maionese|molho|mostarda/.test(n)) return "Molhos";
  if (/massa|farinha|pastel/.test(n)) return "Massas";
  return "Outros";
}

function shortCategory(category: ReturnType<typeof categoryOf>) {
  return category === "Frios"
    ? "FR"
    : category === "Molhos"
      ? "ML"
      : category === "Massas"
        ? "MS"
        : "PR";
}

function newId() {
  return crypto.randomUUID();
}

function Login({ onSession }: { onSession: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("Validando acesso...");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setPending(false);
    if (error || !data.session) {
      setMessage(error?.message || "Não foi possível entrar.");
      return;
    }
    onSession(data.session);
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <span className="login-brand">DOM FRIOS</span>
        <h1>Gestão e PDV</h1>
        <p>Entre para acessar a operação.</p>
        <label>
          E-mail
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
          />
        </label>
        <label>
          Senha
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button className="login-button" disabled={pending}>
          {pending ? "Entrando..." : "Entrar"}
        </button>
        <div className="login-message">{message}</div>
      </form>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [category, setCategory] = useState<Category>("Todos");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [display, setDisplay] = useState("0");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleId, setSaleId] = useState(newId());
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [screen, setScreen] = useState<AppSection>("orders");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  const productsQuery = useQuery({
    queryKey: ["touch-products"],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produtos")
        .select("id,nome,unidade,preco_padrao")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        preco_padrao: Number(row.preco_padrao),
      })) as Product[];
    },
  });

  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  );
  const selectedProduct =
    products.find((p) => p.id === selectedProductId) ?? null;
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.total, 0),
    [cart],
  );

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return products.filter((product) => {
      const categoryOk =
        category === "Todos" || categoryOf(product.nome) === category;
      const searchOk =
        !term || product.nome.toLocaleLowerCase("pt-BR").includes(term);
      return categoryOk && searchOk;
    });
  }, [products, category, search]);

  if (session === undefined)
    return <div className="boot-screen">Carregando caixa...</div>;
  if (!session) return <Login onSession={setSession} />;
  const ownerId = session.user.id;

  function pressNumber(value: string) {
    if (value === "." && display.includes(".")) return;
    if (display.length >= 8) return;
    setDisplay((current) =>
      current === "0" && value !== "." ? value : current + value,
    );
  }

  function addSelected() {
    if (!selectedProduct) return setStatus("Toque em um produto primeiro.");
    const quantity = Number(display);
    if (!Number.isFinite(quantity) || quantity <= 0)
      return setStatus("Digite um peso/quantidade maior que zero.");
    if (!(selectedProduct.preco_padrao > 0))
      return setStatus("Este produto está sem preço válido.");

    setCart((current) => {
      const existing = current.find(
        (item) => item.productId === selectedProduct.id,
      );
      if (existing) {
        return current.map((item) =>
          item.productId === selectedProduct.id
            ? {
                ...item,
                quantity: Number((item.quantity + quantity).toFixed(3)),
                total: Number(
                  (
                    (item.quantity + quantity) * item.unitPrice -
                    item.discount
                  ).toFixed(2),
                ),
              }
            : item,
        );
      }
      return [
        ...current,
        {
          productId: selectedProduct.id,
          name: selectedProduct.nome,
          unit: selectedProduct.unidade || "un",
          quantity,
          unitPrice: selectedProduct.preco_padrao,
          discount: 0,
          total: Number((quantity * selectedProduct.preco_padrao).toFixed(2)),
          requestId: newId(),
        },
      ];
    });
    setDisplay("0");
    setStatus(`${selectedProduct.nome} adicionado.`);
  }

  function removeItem(productId: string) {
    setCart((current) =>
      current.filter((item) => item.productId !== productId),
    );
  }

  function clearSale() {
    setCart([]);
    setSelectedProductId(null);
    setDisplay("0");
    setCustomer("");
    setSaleId(newId());
    setStatus("Venda limpa.");
  }

  async function alreadySaved() {
    const { data, error } = await supabase
      .from("pedidos")
      .select("id")
      .eq("venda_id", saleId)
      .limit(1);
    return !error && Boolean(data?.length);
  }

  async function finalize(payment: Payment) {
    if (saving || !cart.length) return;

    const parsed = SaleSchema.safeParse({
      saleId,
      customer: customer.trim() || "Venda rápida",
      payment,
      items: cart,
    });
    if (!parsed.success) {
      setStatus(
        parsed.error.issues[0]?.message || "Confira os dados da venda.",
      );
      return;
    }

    setSaving(true);
    setStatus("Salvando venda...");
    const rows = parsed.data.items.map((item) => ({
      cliente_nome: parsed.data.customer,
      whatsapp: null,
      bairro: null,
      endereco: null,
      produto_id: item.productId,
      produto_nome: item.name,
      quantidade: item.quantity,
      unidade: item.unit,
      preco_unitario: item.unitPrice,
      desconto: item.discount,
      forma_pagamento: paymentToDb[payment],
      status: "pendente",
      observacao: "Venda Touch POS V2",
      request_id: item.requestId,
      venda_id: parsed.data.saleId,
    }));

    try {
      const subtotal = parsed.data.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPrice,
        0,
      );
      const discount = parsed.data.items.reduce(
        (sum, item) => sum + item.discount,
        0,
      );
      const printing = await loadPrinting(ownerId);
      const saleStatus = printing.settings.auto_approve
        ? "aprovado"
        : "recebido";
      const { error } = await supabase.rpc("finalize_sale", {
        p_sale: {
          id: saleId,
          cliente_nome: parsed.data.customer,
          subtotal,
          desconto: discount,
          taxa: 0,
          forma_pagamento: paymentToDb[payment],
          situacao_pagamento: "confirmado",
          status: saleStatus,
          observacao: "Venda Touch POS V2",
        },
        p_items: rows,
      });
      if (error && !(error.code === "23505" && (await alreadySaved())))
        throw error;
      try {
        const eventMatches =
          printing.settings.print_when === "received" ||
          (printing.settings.print_when === "approved" &&
            saleStatus === "aprovado") ||
          printing.settings.print_when === "payment_confirmed";
        if (printing.settings.auto_print && eventMatches)
          await enqueueReceipt(
            ownerId,
            saleId,
            makeReceipt(
              saleId,
              parsed.data.customer,
              payment,
              parsed.data.items,
              printing.settings,
            ),
            printing.settings,
            printing.printers,
          );
      } catch (printError) {
        console.error(
          "Venda salva; falha ao enfileirar impressão.",
          printError,
        );
      }
      setPaymentOpen(false);
      setCart([]);
      setSelectedProductId(null);
      setDisplay("0");
      setCustomer("");
      setSaleId(newId());
      setStatus(`Venda finalizada em ${payment}: ${money.format(total)}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro desconhecido";
      setStatus(
        navigator.onLine
          ? `Não foi possível salvar: ${message}`
          : "Sem internet. A venda continua na tela.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (screen === "orders")
    return (
      <AppShell
        active={screen}
        email={session.user.email}
        onNavigate={setScreen}
        onSignOut={() => supabase.auth.signOut()}
      >
        <OrdersHome ownerId={ownerId} onNewSale={() => setScreen("sale")} />
      </AppShell>
    );

  if (screen === "printing")
    return (
      <AppShell
        active={screen}
        email={session.user.email}
        onNavigate={setScreen}
        onSignOut={() => supabase.auth.signOut()}
      >
        <PrintingSettings
          ownerId={ownerId}
          onBack={() => setScreen("system")}
        />
      </AppShell>
    );

  if (screen !== "sale") {
    const titles: Partial<Record<AppSection, string>> = {
      catalog: "Cardápio",
      finance: "Financeiro",
      delivery: "Entrega",
      loyalty: "Fidelidade",
      system: "Sistema",
    };
    return (
      <AppShell
        active={screen}
        email={session.user.email}
        onNavigate={setScreen}
        onSignOut={() => supabase.auth.signOut()}
      >
        <ComingSoon
          title={titles[screen] ?? "Módulo"}
          onOpenSale={() => setScreen("sale")}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      active={screen}
      email={session.user.email}
      onNavigate={setScreen}
      onSignOut={() => supabase.auth.signOut()}
    >
      <div className="pos-shell">
        <main className="pos-layout">
          <section className="catalog">
            <div className="customer-row">
              <label>
                <span>Cliente</span>
                <input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Venda rápida / nome do cliente"
                />
              </label>
              <label>
                <span>Pesquisar produto</span>
                <div className="search-input">
                  <Search size={18} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Digite o nome..."
                  />
                </div>
              </label>
            </div>

            <nav className="categories" aria-label="Categorias">
              {categories.map((item) => (
                <Button
                  key={item}
                  className={`category ${category === item ? "active" : ""}`}
                  onPress={() => setCategory(item)}
                >
                  {item}
                </Button>
              ))}
            </nav>

            <div className="product-grid" aria-busy={productsQuery.isFetching}>
              {productsQuery.isLoading && (
                <div className="state-card">Carregando produtos...</div>
              )}
              {productsQuery.isError && (
                <div className="state-card error">
                  Falha ao carregar produtos. Toque em atualizar no navegador.
                </div>
              )}
              {!productsQuery.isLoading &&
                !productsQuery.isError &&
                visibleProducts.length === 0 && (
                  <div className="state-card">Nenhum produto encontrado.</div>
                )}
              {visibleProducts.map((product) => {
                const selected = product.id === selectedProductId;
                const productCategory = categoryOf(product.nome);
                return (
                  <Button
                    key={product.id}
                    className={`product-card ${selected ? "selected" : ""}`}
                    onPress={() => {
                      setSelectedProductId(product.id);
                      setDisplay("0");
                      setStatus("");
                    }}
                  >
                    <span className="product-mark">
                      {shortCategory(productCategory)}
                    </span>
                    <strong>{product.nome}</strong>
                    <small>
                      {money.format(product.preco_padrao)}/{product.unidade}
                    </small>
                  </Button>
                );
              })}
            </div>
          </section>

          <aside className="checkout">
            <section className="receipt">
              <header className="receipt-header">
                <div>
                  <span>COMANDA</span>
                  <strong>Detalhes da venda</strong>
                </div>
                <Button className="clear-button" onPress={clearSale}>
                  <Trash2 size={15} /> Limpar
                </Button>
              </header>
              <div className="receipt-columns">
                <span>Qtd</span>
                <span>Produto</span>
                <span>Total</span>
                <span></span>
              </div>
              <div className="cart-list">
                {cart.length === 0 && (
                  <div className="cart-empty">Nenhum item selecionado</div>
                )}
                {cart.map((item) => (
                  <div className="cart-row" key={item.productId}>
                    <span>
                      {item.quantity.toLocaleString("pt-BR", {
                        maximumFractionDigits: 3,
                      })}
                    </span>
                    <strong>{item.name}</strong>
                    <b>{money.format(item.total)}</b>
                    <Button
                      className="remove-button"
                      aria-label={`Remover ${item.name}`}
                      onPress={() => removeItem(item.productId)}
                    >
                      <X size={17} />
                    </Button>
                  </div>
                ))}
              </div>
              <footer className="receipt-total">
                <span>Total</span>
                <strong>{money.format(total)}</strong>
              </footer>
            </section>

            <section className="keypad-zone">
              <div className="selected-strip">
                <span>PRODUTO SELECIONADO</span>
                <strong>
                  {selectedProduct?.nome ?? "Toque em um produto"}
                </strong>
                <small>
                  {selectedProduct
                    ? `${money.format(selectedProduct.preco_padrao)}/${selectedProduct.unidade}`
                    : "Depois informe o peso/quantidade."}
                </small>
              </div>
              <div className="display">
                <span>PESO / QTD</span>
                <strong>{display.replace(".", ",")}</strong>
              </div>
              <div className="keypad">
                {["7", "8", "9"].map((n) => (
                  <Button
                    key={n}
                    className="key"
                    onPress={() => pressNumber(n)}
                  >
                    {n}
                  </Button>
                ))}
                <Button className="key action teal" onPress={addSelected}>
                  QTD
                </Button>
                {["4", "5", "6"].map((n) => (
                  <Button
                    key={n}
                    className="key"
                    onPress={() => pressNumber(n)}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  className="key action red"
                  onPress={() => setDisplay("0")}
                >
                  LIMPAR
                </Button>
                {["1", "2", "3"].map((n) => (
                  <Button
                    key={n}
                    className="key"
                    onPress={() => pressNumber(n)}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  className="pay-key"
                  isDisabled={!cart.length}
                  onPress={() => setPaymentOpen(true)}
                >
                  <CreditCard size={22} />
                  <span>PAGAR</span>
                  <small>{money.format(total)}</small>
                </Button>
                <Button className="key zero" onPress={() => pressNumber("0")}>
                  0
                </Button>
                <Button className="key" onPress={() => pressNumber(".")}>
                  .
                </Button>
                <Button
                  className="key action dark"
                  onPress={() =>
                    setDisplay((current) =>
                      current.length > 1 ? current.slice(0, -1) : "0",
                    )
                  }
                  aria-label="Apagar último número"
                >
                  ⌫
                </Button>
              </div>
              <div className="status-line" role="status">
                {status}
              </div>
            </section>
          </aside>
        </main>

        <Dialog.Root
          open={paymentOpen}
          onOpenChange={(open) => !saving && setPaymentOpen(open)}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-card">
              <div className="dialog-head">
                <div>
                  <Dialog.Title>Finalizar venda</Dialog.Title>
                  <Dialog.Description>
                    Escolha a forma de pagamento.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <Button className="dialog-close" aria-label="Fechar">
                    <X />
                  </Button>
                </Dialog.Close>
              </div>
              <strong className="dialog-total">{money.format(total)}</strong>
              <div className="payment-grid">
                {(["Pix", "Dinheiro", "Cartão", "Prazo"] as Payment[]).map(
                  (method) => (
                    <Button
                      key={method}
                      className="payment-button"
                      isDisabled={saving}
                      onPress={() => finalize(method)}
                    >
                      {saving ? "Salvando..." : method}
                    </Button>
                  ),
                )}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </AppShell>
  );
}
