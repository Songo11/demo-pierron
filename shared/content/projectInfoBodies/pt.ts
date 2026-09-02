export const PROJECT_INFO_BODY = `PIERRON — INFORMAÇÕES DO PROJETO
Versão 1.3 · Solana · Token-2022

P.I.E.R.R.O.N. significa “PROGRAMMED IMMORTAL ECONOMIC RESILIENT REDISTRIBUTION OPEN NETWORK”,
ou, coloquialmente, CPDDC (Centralized Pool Decentralized Digital Currency).

É uma criptomoeda na Solana que, por meio da combinação de 49 mecanismos distintos, forma um ecossistema autônomo e descentralizado, projetado para oferecer o mais alto nível de segurança financeira ao usuário individual.

O projeto foi concebido para proporcionar transparência absoluta ao usuário e para que este não precise confiar no produto.

As regras incorporadas ao projeto são definitivas e não podem ser alteradas.

O ecossistema PIERRON é totalmente autônomo: não requer administrador e não possui nenhum. O projeto também não tem central de suporte nem atendimento ao cliente. Todas as decisões e ações realizadas por um usuário no ecossistema são de responsabilidade exclusiva do próprio usuário. O criador do projeto não se responsabiliza por decisões equivocadas ou erros do usuário.

PIERRON possui mais de 2200 provas formais sem assume, admit, external_body, vacuity ou underspecified branches.

━━━━━━━━━━━━━━━━━━━━
1. O QUE É PIERRON
━━━━━━━━━━━━━━━━━━━━

Pierron é um protocolo de token na blockchain Solana. As regras econômicas (limites, contribuição de 1% ao pool, cooldown, redistribuição, bônus de fidelidade, emissão e queima) são aplicadas on-chain por programas de contratos inteligentes — não apenas descritas na documentação.

O token PIERRON (SPL Token-2022) combina:

• negociação oficial em DEX com limites por operação e cooldown,
• contribuição de 1% ao pool de redistribuição — recuperável após um ciclo de atividade (não é uma “penalidade por negociar”),
• ciclos de atividade e resgate de uma parcela do pool,
• bônus de fidelidade baseado em volume,
• emissão controlada no pool de mercado e cronograma de queima,
• taxa de piso de preço em SOL nos swaps oficiais,
• Safe Send (transferências mais privadas) e Pierron Pay (pagamentos a comerciantes).

O aplicativo móvel e a dapp constroem as transações. A fonte de verdade das regras é o código implantado na Solana.

━━━━━━━━━━━━━━━━━━━━
2. PRINCÍPIOS DE PROJETO
━━━━━━━━━━━━━━━━━━━━

• Regras no código — limites e elegibilidade são verificados pelo programa.
• Atividade em vez de especulação em massa — tetos rígidos por transação e por época.
• Parcela do pool por atividade real no ciclo, não apenas por manter tokens ociosos.
• Deflação estrutural — grande alocação para queima e cronograma fixo de queima.
• Caminhos de risco separados — settlement e stealth são programas distintos; pagamentos dos vaults exigem vouchers válidos.

━━━━━━━━━━━━━━━━━━━━
3. TOKENOMIA (OFERTA)
━━━━━━━━━━━━━━━━━━━━

Unidade: token de UI (6 casas decimais on-chain).

Oferta total: 150,000,000,000 PIERRON (150 bilhões)

Alocação:
• Pool de mercado (escrow → DEX): 60B (40%)
• Carteira do desenvolvedor: 21B (14%)
• Bônus de fidelidade: 7B (~4.7%)
• Queima (vault + cronograma): 56B (~37.3%)
• Tesouraria: 6B (4%)

Emissão: a cada época, o protocolo libera tokens de escrow para o pool DEX conforme uma cota por época — maior no genesis e depois padrão.

Queima: a partir do vault de queima, a uma taxa fixa por cerca de 20 anos civis de épocas, até que a alocação de queima se esgote.

Duração da época: 21,600 segundos (6 horas). A época 0 começa no timestamp de genesis do protocolo.

━━━━━━━━━━━━━━━━━━━━
4. ARQUITETURA (RESUMO)
━━━━━━━━━━━━━━━━━━━━

• Programa Pierron — contabilidade, limites da DEX, registro de operações, bônus de fidelidade, redistribuição, ticks, queima, piso de preço
• Transfer Hook — classificação de transferências Token-2022; limites e contribuição de 1% nos caminhos oficiais
• Settlement — pagamentos dos vaults (redistribuição, bônus de fidelidade, recompensas de keepers) após preparar o voucher
• Stealth — registrar, enviar e resgatar (Safe Send)
• TradeBook / conta do usuário — atividade, volume, bilhetes, bitmap de épocas, número de resgates
• Keepers da rede — avançam épocas, emissão/queima e sorteios; não resgatam redistribuição nem prêmios pelos usuários

━━━━━━━━━━━━━━━━━━━━
5. REGRAS DE NEGOCIAÇÃO
━━━━━━━━━━━━━━━━━━━━

CAMINHO OFICIAL
Negocie via swap no aplicativo Pierron (pool DEX sob a política do protocolo), com instruções de limite e transfer hook. Transferências fora dos caminhos permitidos podem ser rejeitadas ou classificadas de outra forma.

CONTRIBUIÇÃO DE 1% (RECUPERÁVEL — NÃO É PENALIDADE)
1% do volume oficial de negociação vai para um pool compartilhado de redistribuição. Não é uma taxa punitiva nem uma queima permanente de seus fundos: com atividade suficiente no ecossistema, você pode recuperar sua parcela do pool após o fim do ciclo.

Um ciclo de redistribuição dura 28 épocas. Com épocas de 6 horas, isso equivale a 7 dias. Após o encerramento do ciclo, usuários elegíveis resgatam sua parcela do pool no aplicativo.

Condição de recuperação: atividade suficiente no ciclo (incluindo pelo menos 9 épocas ativas no bitmap de 28 épocas e manutenção de pelo menos 10 PIERRON) — consulte Redistribuição. Sem atividade no ecossistema não há parcela do pool; com contribuição e atividade, negociar gera o direito de recuperar do pool — não apenas um custo de negociação.

A contribuição de 1% não pode ser desativada nas configurações — ela faz parte do protocolo.

PISO DE PREÇO (SOL)
Swaps oficiais exigem uma taxa em SOL proporcional ao volume de PIERRON (100 lamports por 1 PIERRON). Os fundos vão para a tesouraria do piso de preço e podem sustentar a liquidez / o piso.

LIMITE POR TRANSAÇÃO
O máximo de PIERRON por transação depende dos resgates de redistribuição recebidos:

• 0–24 resgates: 13,000,000 PIERRON
• ≥ 25 resgates: 16,000,000 PIERRON
• ≥ 75 resgates: 19,000,000 PIERRON
• ≥ 175 resgates: 24,000,000 PIERRON
• ≥ 375 resgates: 34,000,000 PIERRON (teto)

COOLDOWN ENTRE SWAPS
• 0–24 resgates: 120 s
• ≥ 25: 90 s
• ≥ 75: 75 s
• ≥ 175: 60 s
• ≥ 375: 40 s

Uma tentativa antecipada de swap é rejeitada on-chain.

PRIMEIRO SWAP
A primeira transação oficial de uma conta deve ser de pelo menos 2 PIERRON.

TETO GLOBAL DE VENDAS POR ÉPOCA
O total vendido por todos os usuários em uma época compartilha um teto que aumenta com o total de resgates do protocolo:

• menos de 25 reivindicações total: 2,000,000,000 PIERRON
• menos de 75: 3,000,000,000
• menos de 175: 5,000,000,000
• menos de 375: 7,000,000,000
• 375+: 9,000,000,000

Também se aplicam limites de volume e transações por usuário em cada época (incluindo até 100 txs por época e um teto de volume por usuário).

━━━━━━━━━━━━━━━━━━━━
6. REDISTRIBUIÇÃO — RECUPERANDO A CONTRIBUIÇÃO DE 1%
━━━━━━━━━━━━━━━━━━━━

POR QUE EXISTE O 1%
Cada swap oficial coloca 1% em um pool compartilhado. Após 28 épocas (7 dias com épocas de 6 horas), o pool é dividido entre as pessoas suficientemente ativas no ecossistema. Negociação ativa + atividade no ciclo = direito de resgatar do pool. Inatividade = nenhuma parcela. É um mecanismo de fidelidade / recuperação da contribuição, não uma penalidade por negociar.

A contribuição de 1% foi concebida para vincular temporariamente parte do capital ao ecossistema e desestimular indiretamente ataques Sybil.

FONTE DO POOL
A contribuição de 1% dos swaps oficiais financia o vault de redistribuição.

CICLO E PRAZOS
• ciclo: 28 épocas = 7 dias (época = 6 h),
• após o encerramento do ciclo, o pool é dividido (parcela ≈ pool / número de elegíveis),
• resgate no aplicativo quando a elegibilidade for atingida.

ELEGIBILIDADE (ATIVIDADE SUFICIENTE)
• pelo menos 9 épocas ativas no bitmap de 28 épocas,
• manter saldo de pelo menos 10 PIERRON,
• atividade reconhecida pelo protocolo (negociação oficial / caminhos do protocolo).

RESGATE
• o usuário inicia o resgate no aplicativo (prepare → settle → consume),
• keepers não resgatam pelo usuário,
• vouchers permanecem válidos por cerca de 28 épocas — os não resgatados podem expirar,
• a taxa do protocolo pelo resgate em PIERRON é 0; o usuário paga a taxa de rede em SOL,
• um resgate bem-sucedido aumenta o contador de resgates → maior limite de swap e cooldown menor.

━━━━━━━━━━━━━━━━━━━━
7. BÔNUS DE FIDELIDADE
━━━━━━━━━━━━━━━━━━━━

BILHETES
• obtidos pelo volume oficial de negociação (limiar: volume de 10 PIERRON → 1 bilhete),
• máximo de 50 bilhetes por usuário por janela,
• janelas de sorteio a cada 7 épocas dentro do ciclo de 28 épocas.

SORTEIO
• keepers enviam commits de aleatoriedade (commit–reveal),
• sorteios exigem uma quantidade mínima de commits (piso de produção: 20) e um pool mínimo de bilhetes,
• após a janela: sortear ou pular (bilhetes insuficientes),
• prêmio: 2,000,000 PIERRON por sorteio (da alocação do bônus de fidelidade),
• pagamento: prepare → settle → resgate pelo vencedor.

VALIDADE DO VOUCHER
O voucher para resgatar o airdrop da loteria é válido por 7 épocas e depois expira.

━━━━━━━━━━━━━━━━━━━━
8. SAFE SEND E PIERRON PAY
━━━━━━━━━━━━━━━━━━━━

SAFE SEND
Registrar → enviar ao vault stealth → resgate pelo destinatário. O resgate pode exigir duas transações. É um caminho de transferência mais privado — não contorna os limites de swap nem a contribuição de 1%.

PIERRON PAY
Pagamento para uma conta de comerciante com uma instrução pay. O hook classifica a transferência como Pay, não como uma venda DEX normal.

REGRAS
• não use esses caminhos para contornar limites oficiais de negociação ou a contribuição de 1%,
• sempre verifique o endereço / QR do destinatário antes de enviar — erros on-chain são irreversíveis.

━━━━━━━━━━━━━━━━━━━━
9. REGRAS DE USO DO APLICATIVO
━━━━━━━━━━━━━━━━━━━━

1. Conecte apenas uma carteira confiável. Nunca compartilhe sua frase-semente com o “suporte” ou desconhecidos.
2. Swap: aprove a sequência completa na carteira; não feche a carteira durante a assinatura.
3. Respeite o cooldown — tocar novamente não substitui as regras on-chain.
4. Resgate de redistribuição / bônus de fidelidade: somente quando o aplicativo indicar que está pronto; após o sucesso, aguarde a sincronização da rede antes do próximo swap.
5. No Android (OEMs agressivos): permaneça na carteira até CONFIRM e depois volte ao Pierron; não encerre o aplicativo em segundo plano.
6. Proibido: ataques aos programas, phishing em nome da Pierron, spam de RPC, tentativas de explorar settlement / hook.

━━━━━━━━━━━━━━━━━━━━
10. CICLO ECONÔMICO
━━━━━━━━━━━━━━━━━━━━

O escrow libera tokens no pool da DEX a cada época.
A negociação coloca uma contribuição de 1% no pool de redistribuição (recuperável após 7 dias / 28 épocas com atividade suficiente), gera bilhetes do bônus de fidelidade e a taxa de piso de preço em SOL.
A atividade no ciclo de 28 épocas qualifica você para recuperar uma parcela do pool.
Os sorteios do bônus de fidelidade ocorrem em janelas de 7 épocas.
A queima reduz a oferta paralelamente conforme o cronograma.
Os usuários resgatam redistribuição e prêmios por conta própria; os keepers mantêm o relógio do protocolo.

━━━━━━━━━━━━━━━━━━━━
11. RISCOS
━━━━━━━━━━━━━━━━━━━━

• risco de contratos inteligentes e de atualização,
• risco de mercado para o preço do PIERRON (sem valorização garantida apesar da queima / piso),
• taxas em SOL sobre transações falhas ou repetidas,
• nenhuma garantia de lucro — a redistribuição e o bônus de fidelidade não são produtos de depósito.

Usar o aplicativo significa aceitar as regras on-chain e os riscos acima.

Pierron — tokenomia transparente e uso real.`;
