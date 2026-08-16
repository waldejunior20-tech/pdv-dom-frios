create or replace function public.finalize_sale(p_sale jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_sale_id uuid := (p_sale->>'id')::uuid;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'sale requires items'; end if;

  insert into public.vendas (id, owner_id, cliente_nome, subtotal, desconto, taxa, forma_pagamento, situacao_pagamento, status, observacao)
  values (v_sale_id, v_owner, p_sale->>'cliente_nome', (p_sale->>'subtotal')::numeric, (p_sale->>'desconto')::numeric, (p_sale->>'taxa')::numeric, p_sale->>'forma_pagamento', p_sale->>'situacao_pagamento', p_sale->>'status', p_sale->>'observacao');

  insert into public.pedidos (owner_id, cliente_nome, whatsapp, bairro, endereco, produto_id, produto_nome, quantidade, unidade, preco_unitario, desconto, forma_pagamento, status, observacao, request_id, venda_id)
  select v_owner, x.cliente_nome, x.whatsapp, x.bairro, x.endereco, x.produto_id, x.produto_nome, x.quantidade, x.unidade, x.preco_unitario, x.desconto, x.forma_pagamento, x.status, x.observacao, x.request_id, v_sale_id
  from jsonb_to_recordset(p_items) as x(cliente_nome text, whatsapp text, bairro text, endereco text, produto_id uuid, produto_nome text, quantidade numeric, unidade text, preco_unitario numeric, desconto numeric, forma_pagamento text, status text, observacao text, request_id uuid, venda_id uuid);
  return v_sale_id;
end;
$$;

revoke all on function public.finalize_sale(jsonb, jsonb) from public, anon;
grant execute on function public.finalize_sale(jsonb, jsonb) to authenticated;
