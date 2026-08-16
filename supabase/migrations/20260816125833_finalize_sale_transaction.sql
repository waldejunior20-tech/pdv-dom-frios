create or replace function public.finalizar_venda(p_venda jsonb, p_itens jsonb)
returns uuid
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid := coalesce(nullif(p_venda->>'id','')::uuid, gen_random_uuid());
  v_subtotal numeric(12,2);
  v_desconto numeric(12,2);
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'sale must contain at least one item'; end if;
  if exists (select 1 from public.vendas where id = v_id and owner_id = v_owner) then return v_id; end if;

  select round(sum(((i->>'quantity')::numeric) * ((i->>'unitPrice')::numeric)), 2),
         round(sum(coalesce((i->>'discount')::numeric, 0)), 2)
    into v_subtotal, v_desconto
    from jsonb_array_elements(p_itens) i;
  if v_subtotal is null or v_subtotal <= 0 then raise exception 'invalid sale subtotal'; end if;
  if v_desconto < 0 or v_desconto > v_subtotal then raise exception 'invalid sale discount'; end if;

  insert into public.vendas (
    id, owner_id, cliente_nome, whatsapp, bairro, endereco, tipo_pedido, mesa,
    subtotal, desconto, taxa, forma_pagamento, situacao_pagamento, status, observacao
  ) values (
    v_id, v_owner, coalesce(nullif(trim(p_venda->>'customer'), ''), 'Venda rápida'),
    nullif(trim(p_venda->>'phone'), ''), nullif(trim(p_venda->>'neighborhood'), ''),
    nullif(trim(p_venda->>'address'), ''), coalesce(nullif(p_venda->>'orderType',''), 'retirada'),
    nullif(trim(p_venda->>'table'), ''), v_subtotal, v_desconto,
    coalesce(nullif(p_venda->>'fee','')::numeric, 0), p_venda->>'paymentMethod',
    coalesce(nullif(p_venda->>'paymentStatus',''), 'confirmado'),
    coalesce(nullif(p_venda->>'status',''), 'aprovado'), nullif(trim(p_venda->>'notes'), '')
  );

  insert into public.pedidos (
    owner_id, cliente_nome, whatsapp, bairro, endereco, produto_id, produto_nome,
    quantidade, unidade, preco_unitario, desconto, forma_pagamento, status,
    observacao, request_id, venda_id, complementos, observacao_item
  )
  select v_owner, coalesce(nullif(trim(p_venda->>'customer'), ''), 'Venda rápida'),
    nullif(trim(p_venda->>'phone'), ''), nullif(trim(p_venda->>'neighborhood'), ''),
    nullif(trim(p_venda->>'address'), ''), nullif(i->>'productId','')::uuid, trim(i->>'name'),
    (i->>'quantity')::numeric, coalesce(nullif(i->>'unit',''), 'un'), (i->>'unitPrice')::numeric,
    coalesce(nullif(i->>'discount','')::numeric, 0), p_venda->>'paymentMethod', 'pendente',
    nullif(trim(p_venda->>'notes'), ''), (i->>'requestId')::uuid, v_id,
    case when jsonb_typeof(i->'complements') = 'array' then i->'complements' else '[]'::jsonb end,
    nullif(trim(i->>'notes'), '')
  from jsonb_array_elements(p_itens) i;

  return v_id;
end;
$$;

revoke all on function public.finalizar_venda(jsonb, jsonb) from public;
grant execute on function public.finalizar_venda(jsonb, jsonb) to authenticated;
