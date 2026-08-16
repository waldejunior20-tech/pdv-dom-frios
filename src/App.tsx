import { type FormEvent, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Button } from 'react-aria-components';
import { ArrowLeft, CreditCard, Search, Settings, Trash2, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import PrintingSettings from './features/printing/PrintingSettings';
import { getPrintSettings } from './features/printing/repository';
import { maybeAutoPrintSale } from './features/printing/service';
import { supabase } from './lib/supabase';
import { SaleSchema, type CartItem } from './schemas';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const paymentToDb = { Pix: 'pix', Dinheiro: 'dinheiro', Cartão: 'cartao', Prazo: 'prazo' } as const;

type Payment = keyof typeof paymentToDb;
type Category = 'Todos' | 'Frios' | 'Molhos' | 'Massas' | 'Outros';
type Product = { id: string; nome: string; unidade: string; preco_padrao: number };
type OrderType = 'retirada' | 'entrega' | 'mesa';

const categories: Category[] = ['Todos', 'Frios', 'Molhos', 'Massas', 'Outros'];

function categoryOf(name: string): Exclude<Category, 'Todos'> {
  const n = name.toLocaleLowerCase('pt-BR');
  if (/mussarela|muçarela|presunto|apresuntado|bacon|calabresa|mortadela|queijo|peito/.test(n)) return 'Frios';
  if (/ketchup|maionese|molho|mostarda/.test(n)) return 'Molhos';
  if (/massa|farinha|pastel/.test(n)) return 'Massas';
  return 'Outros';
}

function shortCategory(category: ReturnType<typeof categoryOf>) {
  return category === 'Frios' ? 'FR' : category === 'Molhos' ? 'ML' : category === 'Massas' ? 'MS' : 'PR';
}

function newId() {
  return crypto.randomUUID();
}

function Login({ onSession }: { onSession: (session: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('Validando acesso...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setPending(false);
    if (error || !data.session) {
      setMessage(error?.message || 'Não foi possível entrar.');
      return;
    }
    onSession(data.session);
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <span className="login-brand">DOM FRIOS</span>
        <h1>Touch POS</h1>
        <p>Entre para abrir o caixa.</p>
        <label>
          E-mail
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
        </label>
        <label>
          Senha
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
        </label>
        <button className="login-button" disabled={pending}>{pending ? 'Entrando...' : 'Entrar'}</button>
        <div className="login-message">{message}</div>
      </form>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [view, setView] = useState<'pos' | 'printing'>('pos');
  const [category, setCategory] = useState<Category>('Todos');
  const [search, setSearch] = useState('');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('retirada');
  const [table, setTable] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [display, setDisplay] = useState('0');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleId, setSaleId] = useState(newId());
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const productsQuery = useQuery({
    queryKey: ['touch-products'],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id,nome,unidade,preco_padrao')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, preco_padrao: Number(row.preco_padrao) })) as Product[];
    },
  });

  const products = productsQuery.data ?? [];
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.total, 0), [cart]);

  const visibleProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return products.filter((product) => {
      const categoryOk = category === 'Todos' || categoryOf(product.nome) === category;
      const searchOk = !term || product.nome.toLocaleLowerCase('pt-BR').includes(term);
      return categoryOk && searchOk;
    });
  }, [products, category, search]);

  if (session === undefined) return <div className="boot-screen">Carregando caixa...</div>;
  if (!session) return <Login onSession={setSession} />;
  if (view === 'printing') {
    return <PrintingSettings accessToken={session.access_token} onBack={() => setView('pos')} />;
  }

  function pressNumber(value: string) {
    if (value === '.' && display.includes('.')) return;
    if (display.length >= 8) return;
    setDisplay((current) => (current === '0' && value !== '.' ? value : current + value));
  }

  function addSelected() {
    if (!selectedProduct) return setStatus('Toque em um produto primeiro.');
    const quantity = Number(display);
    if (!Number.isFinite(quantity) || quantity <= 0) return setStatus('Digite um peso/quantidade maior que zero.');
    if (!(selectedProduct.preco_padrao > 0)) return setStatus('Este produto está sem preço válido.');

    setCart((current) => {
      const existing = current.find((item) => item.productId === selectedProduct.id);
      if (existing) {
        return current.map((item) =>
          item.productId === selectedProduct.id
            ? {
                ...item,
                quantity: Number((item.quantity + quantity).toFixed(3)),
                total: Number(((item.quantity + quantity) * item.unitPrice - item.discount).toFixed(2)),
              }
            : item,
        );
      }
      return [
        ...current,
        {
          productId: selectedProduct.id,
          name: selectedProduct.nome,
          unit: selectedProduct.unidade || 'un',
          quantity,
          unitPrice: selectedProduct.preco_padrao,
          discount: 0,
          total: Number((quantity * selectedProduct.preco_padrao).toFixed(2)),
          requestId: newId(),
        },
      ];
    });
    setDisplay('0');
    setStatus(`${selectedProduct.nome} adicionado.`);
  }

  function removeItem(productId: string) {
    setCart((current) => current.filter((item) => item.productId !== productId));
  }

  function clearSale() {
    setCart([]);
    setSelectedProductId(null);
    setDisplay('0');
    setCustomer('');
    setPhone('');
    setAddress('');
    setOrderType('retirada');
    setTable('');
    setSaleId(newId());
  }

  async function finalize(payment: Payment) {
    if (saving || !cart.length) return;

    const parsed = SaleSchema.safeParse({
      saleId,
      customer: customer.trim() || 'Venda rápida',
      phone: phone.trim(),
      address: address.trim(),
      orderType,
      table: table.trim(),
      fee: 0,
      payment,
      items: cart,
    });
    if (!parsed.success) {
      setStatus(parsed.error.issues[0]?.message || 'Confira os dados da venda.');
      return;
    }

    setSaving(true);
    setStatus('Salvando venda...');
    try {
      const printSettings = await getPrintSettings();
      const paymentStatus = payment === 'Prazo' ? 'pendente' : 'confirmado';
      const saleStatus = printSettings.auto_approve ? 'aprovado' : 'recebido';
      const { data, error } = await supabase.rpc('finalizar_venda', {
        p_venda: {
          id: parsed.data.saleId,
          customer: parsed.data.customer,
          phone: parsed.data.phone ?? '',
          neighborhood: '',
          address: parsed.data.address ?? '',
          orderType: parsed.data.orderType,
          table: parsed.data.orderType === 'mesa' ? (parsed.data.table ?? '') : '',
          fee: parsed.data.fee,
          paymentMethod: paymentToDb[payment],
          paymentStatus,
          status: saleStatus,
          notes: 'Venda Touch POS V2',
        },
        p_itens: parsed.data.items,
      });
      if (error) throw error;

      const savedSaleId = String(data ?? parsed.data.saleId);
      let printMessage = 'Venda salva.';
      try {
        const printResult = await maybeAutoPrintSale(savedSaleId, session.access_token);
        printMessage = printResult.message ?? printMessage;
      } catch (printError) {
        printMessage =
          printError instanceof Error
            ? `Venda salva. Impressão pendente: ${printError.message}`
            : 'Venda salva. A impressão ficou pendente.';
      }

      setPaymentOpen(false);
      clearSale();
      setStatus(`${printMessage} Pagamento: ${payment} · ${money.format(total)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      setStatus(navigator.onLine ? `Não foi possível salvar: ${message}` : 'Sem internet. A venda continua na tela.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pos-shell">
      <header className="topbar">
        <div className="brand"><strong>DOM FRIOS</strong><span>TOUCH POS V2</span></div>
        <div className="top-actions">
          <span>{session.user.email}</span>
          <Button className="ghost-top" onPress={() => setView('printing')}><Settings size={16} /> Configurações</Button>
          <Button className="ghost-top" onPress={() => supabase.auth.signOut()}><ArrowLeft size={16} /> Sair</Button>
        </div>
      </header>

      <main className="pos-layout">
        <section className="catalog">
          <div className="customer-row order-customer-grid">
            <label><span>Cliente</span><input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Venda rápida / nome do cliente" /></label>
            <label><span>Telefone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(64) 99999-9999" inputMode="tel" /></label>
            <label><span>Tipo</span><select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)}><option value="retirada">Retirada</option><option value="entrega">Entrega</option><option value="mesa">Mesa</option></select></label>
            {orderType === 'entrega' && <label><span>Endereço</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Rua, número, complemento" /></label>}
            {orderType === 'mesa' && <label><span>Mesa</span><input value={table} onChange={(event) => setTable(event.target.value)} placeholder="Ex.: 4" /></label>}
            <label className="search-field"><span>Pesquisar produto</span><div className="search-input"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite o nome..." /></div></label>
          </div>

          <nav className="categories" aria-label="Categorias">
            {categories.map((item) => <Button key={item} className={`category ${category === item ? 'active' : ''}`} onPress={() => setCategory(item)}>{item}</Button>)}
          </nav>

          <div className="product-grid" aria-busy={productsQuery.isFetching}>
            {productsQuery.isLoading && <div className="state-card">Carregando produtos...</div>}
            {productsQuery.isError && <div className="state-card error">Falha ao carregar produtos. Toque em atualizar no navegador.</div>}
            {!productsQuery.isLoading && !productsQuery.isError && visibleProducts.length === 0 && <div className="state-card">Nenhum produto encontrado.</div>}
            {visibleProducts.map((product) => {
              const selected = product.id === selectedProductId;
              const productCategory = categoryOf(product.nome);
              return <Button key={product.id} className={`product-card ${selected ? 'selected' : ''}`} onPress={() => { setSelectedProductId(product.id); setDisplay('0'); setStatus(''); }}><span className="product-mark">{shortCategory(productCategory)}</span><strong>{product.nome}</strong><small>{money.format(product.preco_padrao)}/{product.unidade}</small></Button>;
            })}
          </div>
        </section>

        <aside className="checkout">
          <section className="receipt">
            <header className="receipt-header"><div><span>COMANDA</span><strong>Detalhes da venda</strong></div><Button className="clear-button" onPress={() => { clearSale(); setStatus('Venda limpa.'); }}><Trash2 size={15} /> Limpar</Button></header>
            <div className="receipt-columns"><span>Qtd</span><span>Produto</span><span>Total</span><span></span></div>
            <div className="cart-list">
              {cart.length === 0 && <div className="cart-empty">Nenhum item selecionado</div>}
              {cart.map((item) => <div className="cart-row" key={item.productId}><span>{item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</span><strong>{item.name}</strong><b>{money.format(item.total)}</b><Button className="remove-button" aria-label={`Remover ${item.name}`} onPress={() => removeItem(item.productId)}><X size={17} /></Button></div>)}
            </div>
            <footer className="receipt-total"><span>Total</span><strong>{money.format(total)}</strong></footer>
          </section>

          <section className="keypad-zone">
            <div className="selected-strip"><span>PRODUTO SELECIONADO</span><strong>{selectedProduct?.nome ?? 'Toque em um produto'}</strong><small>{selectedProduct ? `${money.format(selectedProduct.preco_padrao)}/${selectedProduct.unidade}` : 'Depois informe o peso/quantidade.'}</small></div>
            <div className="display"><span>PESO / QTD</span><strong>{display.replace('.', ',')}</strong></div>
            <div className="keypad">
              {['7', '8', '9'].map((number) => <Button key={number} className="key" onPress={() => pressNumber(number)}>{number}</Button>)}
              <Button className="key action teal" onPress={addSelected}>QTD</Button>
              {['4', '5', '6'].map((number) => <Button key={number} className="key" onPress={() => pressNumber(number)}>{number}</Button>)}
              <Button className="key action red" onPress={() => setDisplay('0')}>LIMPAR</Button>
              {['1', '2', '3'].map((number) => <Button key={number} className="key" onPress={() => pressNumber(number)}>{number}</Button>)}
              <Button className="pay-key" isDisabled={!cart.length} onPress={() => setPaymentOpen(true)}><CreditCard size={22} /><span>PAGAR</span><small>{money.format(total)}</small></Button>
              <Button className="key zero" onPress={() => pressNumber('0')}>0</Button>
              <Button className="key" onPress={() => pressNumber('.')}>.</Button>
              <Button className="key action dark" onPress={() => setDisplay((current) => current.length > 1 ? current.slice(0, -1) : '0')} aria-label="Apagar último número">⌫</Button>
            </div>
            <div className="status-line" role="status">{status}</div>
          </section>
        </aside>
      </main>

      <Dialog.Root open={paymentOpen} onOpenChange={(open) => !saving && setPaymentOpen(open)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-card">
            <div className="dialog-head"><div><Dialog.Title>Finalizar venda</Dialog.Title><Dialog.Description>Escolha a forma de pagamento.</Dialog.Description></div><Dialog.Close asChild><Button className="dialog-close" aria-label="Fechar"><X /></Button></Dialog.Close></div>
            <strong className="dialog-total">{money.format(total)}</strong>
            <div className="payment-grid">
              {(['Pix', 'Dinheiro', 'Cartão', 'Prazo'] as Payment[]).map((method) => <Button key={method} className="payment-button" isDisabled={saving} onPress={() => finalize(method)}>{saving ? 'Salvando...' : method}</Button>)}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
