/**
 * ══════════════════════════════════════════════════════════════
 *  SECOND BRAIN — Topic Registry
 *  hachi-public/quiz/topics.js
 * ══════════════════════════════════════════════════════════════
 *
 *  ┌── FOR CLAUDE CODE ────────────────────────────────────────┐
 *  │  Read quiz/CLAUDE.md FIRST before editing this file.      │
 *  │  • Add a topic   → copy TOPIC_TEMPLATE (bottom of file)   │
 *  │  • Add slides    → copy SLIDE_TEMPLATE  (bottom of file)  │
 *  │  • Add questions → copy QUESTION_TEMPLATE (bottom)        │
 *  │  • Before writing questions, read wikiPages[] for accuracy │
 *  └───────────────────────────────────────────────────────────┘
 *
 *  Slide `calc` types (built into index.html):
 *    'var'      VaR bell-curve simulator
 *    'el'       Expected Loss (PD × EAD × LGD)
 *    'lcr'      Liquidity Coverage Ratio
 *    'basel'    Basel III capital ratio
 *    'raroc'    RAROC dept comparison
 *    'kvcache'  KV Cache memory calculator
 *    'sw30'     Software 3.0 comparison chart
 *
 *  Slide `wikiSource`: array of wiki file paths (relative to obsidian repo root).
 *  Rendered as clickable links to the private obsidian repo — visible only when
 *  authenticated on GitHub. Safe to include in this public repo.
 *
 *  Slide `keyPoint` accent colors: 'blue' | 'green' | 'yellow' | 'red'
 */

const WIKI = 'https://github.com/hachi-admin/hachi-wiki/blob/main/';

window.TOPICS = [

/* ══════════════════════════════════════════════════════════════
   TOPIC 1 — Securities & Financial Risk
   Source wiki: wiki/concepts/, wiki/infrastructure/, wiki/entities/
══════════════════════════════════════════════════════════════ */
{
  id: 'finance',
  title: 'Securities & Financial Risk',
  icon: '📊',
  color: '#3b82f6',
  description: 'Basel III, VaR, Credit Risk, Liquidity Regulation — from the Accenture FS curriculum',
  slideCount: 6,
  wikiPages: [
    'wiki/concepts/Capital Markets.md',
    'wiki/concepts/Basel III Regulation.md',
    'wiki/concepts/Value at Risk.md',
    'wiki/concepts/Algorithmic Trading.md',
    'wiki/concepts/Derivatives.md',
    'wiki/concepts/Smart Order Routing.md',
    'wiki/infrastructure/Securities Firm Systems.md',
    'wiki/infrastructure/DVP and STP Settlement.md',
    'wiki/infrastructure/Tokyo Stock Exchange arrowhead.md',
    'wiki/entities/Japan Exchange Group.md',
    'wiki/entities/Japan Securities Clearing Corporation.md',
  ],

  slides: [
    {
      num: '01',
      title: 'Financial Risk — Overview Map',
      body: 'Financial institution risks split into "regulatory risks" and "other domains". The four primary categories are <strong>daily-exposure risks</strong> (market, credit) and <strong>sudden downside risks</strong> (operational, liquidity).',
      riskMap: true,
      table: {
        headers: ['Regulation / Framework', 'Primary Coverage', 'Type'],
        rows: [
          ['Capital Adequacy (Basel II/III)', 'Market, Credit, Operational Risk', 'Global'],
          ['LCR / NSFR', 'Liquidity Risk', 'Global'],
          ['TLAC', 'Systemic Risk (G-SIBs resolution)', 'Global'],
          ['Volcker Rule / Ring-fencing', 'Proprietary trading / bank separation', 'US / UK'],
          ['MiFID II / MiFIR', 'Best execution, transparency', 'EU'],
        ]
      },
      keyPoints: [
        { text: '4 regulatory characteristics: ① Global + local coexistence ② Phased strengthening (LCR: 60%→100% over 2015–2019) ③ Broad scope (capital, liquidity, remuneration) ④ G-SIBs additional requirements (Japan\'s 3 mega-banks included)' }
      ],
      wikiSource: ['wiki/concepts/Capital Markets.md', 'wiki/concepts/Basel III Regulation.md']
    },
    {
      num: '02',
      title: 'Market Risk — VaR (Value at Risk)',
      body: 'Risk that asset values change due to fluctuations in interest rates, FX, or equity prices.',
      formula: 'VaR = z × σ × √Holding Period × Portfolio Value',
      table: {
        headers: ['Parameter', 'Meaning', 'Example'],
        rows: [
          ['Observation period', 'How many past days of data to use', '250 days'],
          ['Holding period', 'How many days to hold the position', '10 days'],
          ['Confidence level', 'Probability the loss stays within VaR', '99% (z = 2.326)'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Reading: VaR = ¥9B (99%, 10d) → "Only 1% chance of losing ¥9B+ over the next 10 days."' },
        { color: 'green',  text: 'BPV (1bp rate shift), GPS (specific tenor), SPV (slope change) = sensitivity analysis. VaR = statistical maximum loss estimate.' },
        { color: 'yellow', text: '💡 Interest rates ↑ → Bond prices ↓ (inverse relationship). Higher market rates make existing low-coupon bonds less attractive → their price falls.' },
      ],
      calc: 'var',
      wikiSource: ['wiki/concepts/Value at Risk.md']
    },
    {
      num: '03',
      title: 'Credit Risk — Expected Loss (EL)',
      body: 'Risk that asset value decreases or disappears due to a counterparty\'s financial deterioration. The core quantitative metric is Expected Loss (EL).',
      formula: 'EL = PD × EAD × LGD',
      table: {
        headers: ['Symbol', 'Full Name', 'Meaning'],
        rows: [
          ['PD', 'Probability of Default', 'Chance of default — linked to internal credit rating'],
          ['EAD', 'Exposure at Default', 'Outstanding exposure at the time of default'],
          ['LGD', 'Loss Given Default', 'Loss rate = 1 − Recovery Rate'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Collateral coverage 60% → Recovery rate 60% → LGD = 40%. Varies by collateral type (real estate, securities, etc.) and coverage ratio.' },
        { color: 'green',  text: 'EL = average expected loss (like a loan loss provision). Credit VaR = 99th percentile max loss. The gap = Unexpected Loss (UL), covered by regulatory capital.' },
        { color: 'yellow', text: 'CVA ≈ ∫EPE × PD × LGD × discount dt — the "loan loss provision for derivatives". Charging CVA to traders naturally deters transactions with low-credit counterparties.' },
      ],
      calc: 'el',
      wikiSource: ['wiki/concepts/Basel III Regulation.md']
    },
    {
      num: '04',
      title: 'Liquidity Risk — LCR / NSFR',
      body: 'Risk that securing funds becomes difficult due to <strong>maturity mismatches</strong> or unexpected cash outflows. Introduced post-2008 financial crisis by the Basel Committee.',
      formula: 'LCR = HQLA (High-Quality Liquid Assets) / 30-day Net Cash Outflow ≥ 100%',
      table: {
        headers: ['Level', 'Asset Examples', 'Haircut'],
        rows: [
          ['Lv 1', 'Cash, central bank reserves, 0% RW government bonds', '100%'],
          ['Lv 2A', 'High-quality corporate bonds, covered bonds', '85%'],
          ['Lv 2B', 'RMBS (AA+ rated)', '75%'],
          ['Lv 3', 'Equities, BBB–A+ corporate bonds', '50%'],
        ]
      },
      keyPoints: [
        { color: 'green',  text: 'Phased in: 2015 → 60% | 2016 → 70% | 2017 → 80% | 2018 → 90% | 2019 → 100% (full compliance)' },
        { color: 'blue',   text: 'NSFR = Available Stable Funding / Required Stable Funding ≥ 100%. Prevents "3-month borrowing to fund 2-year lending" — if borrowing cannot be rolled over in a crisis, insolvency follows.' },
      ],
      calc: 'lcr',
      wikiSource: ['wiki/concepts/Basel III Regulation.md']
    },
    {
      num: '05',
      title: 'Capital Adequacy — Basel II / III',
      body: 'International regulation defining the minimum capital that financial institutions must hold. Basel III added <strong>capital quality improvements</strong> and <strong>liquidity regulation</strong> to the existing framework.',
      formula: 'Capital Ratio = Own Capital / (Credit RWA + Market Risk + Op Risk) ≥ 8%',
      table: {
        headers: ['Tier', 'Main Components', 'Basel III Minimum'],
        rows: [
          ['CET1', 'Common equity, retained earnings (highest quality)', '4.5%'],
          ['Tier 1', 'CET1 + AT1 (preferred shares, etc.)', '6.0%'],
          ['Total Capital', 'Tier 1 + Tier 2 (subordinated debt, etc.)', '8.0%'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Basel III additions: capital conservation buffer +2.5% (CET1), countercyclical buffer, G-SIBs surcharge +1–3.5%, TLAC (Total Loss-Absorbing Capacity).' },
        { color: 'yellow', text: 'FRTB (Fundamental Review of the Trading Book) and IRRBB (Interest Rate Risk in the Banking Book) are significant additional Basel III regulatory changes.' },
      ],
      calc: 'basel',
      wikiSource: ['wiki/concepts/Basel III Regulation.md']
    },
    {
      num: '06',
      title: 'RAROC — Risk-Adjusted Return on Capital',
      body: 'Instead of comparing raw revenue, deduct the embedded risk cost first. RAROC is used for <strong>economic capital allocation</strong> decisions across business units.',
      formula: 'RAROC = (Revenue − Risk Cost) / Economic Capital (EC)',
      table: {
        headers: ['', 'Unit A', 'Unit B'],
        rows: [
          ['Revenue', '¥100B', '¥100B'],
          ['Risk cost', '¥10B', '¥50B'],
          ['Econ. Capital', '¥50B', '¥50B'],
          ['RAROC', '180%', '100%'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'EC allocation flow: ① Measure risk via VaR → ② Allocate EC as unit limits → ③ Units take risk within EC → ④ Evaluate by RAROC → ⑤ Validate via backtesting.' },
        { color: 'yellow', text: 'CVA linkage: charging CVA to traders makes low-credit counterparty costs visible, naturally prioritizing high-rated counterparties — aligns incentives without mandates.' },
      ],
      calc: 'raroc',
      wikiSource: ['wiki/infrastructure/Securities Firm Systems.md', 'wiki/concepts/Basel III Regulation.md']
    },
  ],

  questions: [
    {cat:"Risk Basics",
     q:"Which of the following is NOT among the major risk categories targeted by financial regulation (Basel III)?",
     hint:"The 4 main categories are market, credit, operational, and liquidity. Think about which belongs to 'other domains'.",
     opts:["Market risk","Credit risk","Geopolitical risk","Operational risk"],ans:2,
     exp:"<strong>Geopolitical risk</strong> falls under 'other domains' (BCP-covered) — not a Basel regulatory target. The 4 Basel targets are ① market ② credit ③ operational ④ liquidity risk."},
    {cat:"Market Risk",
     q:"What are the 3 parameters that define a VaR measurement?",
     hint:"Think: how far back do you look, how long do you hold, and how confident are you?",
     opts:["Observation period, holding period, confidence level","Observation period, recovery rate, confidence level","PD, EAD, LGD","Holding period, credit rating, confidence level"],ans:0,
     exp:"<strong>Observation period</strong> (past data days), <strong>holding period</strong> (days held), and <strong>confidence level</strong> (e.g. 99%). Reading: VaR = ¥9B means only 1% chance of losing ¥9B+ over the holding period."},
    {cat:"Market Risk",
     q:"When interest rates rise, what happens to a fixed-rate bond you hold?",
     hint:"You hold a bond paying 2% coupon. Market rates move to 3%. How attractive is your bond now?",
     opts:["Its price rises","Its price falls","Its price stays the same","It depends only on duration"],ans:1,
     exp:"<strong>Interest rates ↑ → Bond prices ↓</strong> (inverse relationship). Higher market rates make existing low-coupon bonds less attractive — their market price falls to compensate."},
    {cat:"Market Risk",
     q:"Which description correctly defines GPS (Grid Point Sensitivity)?",
     hint:"There are 3 sensitivity methods — BPV, GPS, SPV. Each measures a different type of yield curve movement.",
     opts:["Shifts the entire yield curve in parallel to measure impact","Shifts only a specific maturity point to measure per-tenor risk","Measures steepening/flattening yield curve shape risk","Measures equity price sensitivity"],ans:1,
     exp:"<strong>GPS</strong> shifts only a specific maturity point locally — giving granular risk by tenor. BPV = parallel shift of the full curve. SPV = slope (steepening/flattening) change."},
    {cat:"Credit Risk",
     q:"Which formula correctly calculates Expected Loss (EL)?",
     opts:["EL = PD + EAD + LGD","EL = PD × EAD ÷ LGD","EL = PD × EAD × LGD","EL = (1 − PD) × EAD × LGD"],ans:2,
     exp:"<strong>EL = PD × EAD × LGD</strong>. Default probability × exposure at default × loss given default. This is the baseline credit risk metric — analogous to a loan loss provision."},
    {cat:"Credit Risk",
     q:"Which formula correctly defines LGD (Loss Given Default)?",
     hint:"If you have collateral covering 60%, how much do you actually lose?",
     opts:["1 + Recovery Rate","1 − Recovery Rate","Default probability × Recovery Rate","Exposure ÷ Collateral value"],ans:1,
     exp:"<strong>LGD = 1 − Recovery Rate</strong>. If collateral covers 60% → Recovery Rate = 60% → LGD = 40%. The type and coverage ratio of collateral determine LGD."},
    {cat:"Credit Risk",
     q:"Which best describes CVA (Credit Value Adjustment)?",
     hint:"Think of it as the equivalent of a loan loss provision, but applied to derivatives.",
     opts:["VaR methodology applied to credit risk","Present value of expected loss on OTC derivatives if the counterparty defaults","A liquidity metric complementing LCR","Additional capital surcharge imposed on G-SIBs"],ans:1,
     exp:"<strong>CVA</strong> is the present value of the expected loss from an OTC derivative counterparty defaulting — essentially the 'loan loss provision for derivatives'. Charging CVA to traders naturally discourages high-risk counterparties."},
    {cat:"Liquidity Risk",
     q:"Which formula correctly defines LCR?",
     opts:["HQLA ÷ 30-day net cash outflows ≥ 100%","Available stable funding ÷ required stable funding ≥ 100%","Own capital ÷ risk-weighted assets ≥ 8%","Risk-adjusted return ÷ economic capital"],ans:0,
     exp:"<strong>LCR = HQLA ÷ 30-day net cash outflows ≥ 100%</strong>. ② is NSFR, ③ is the Basel capital ratio, ④ is RAROC."},
    {cat:"Liquidity Risk",
     q:"Which HQLA level receives a 100% haircut (full value counted)?",
     hint:"Think about the safest, most liquid assets a bank can hold.",
     opts:["Investment-grade corporate bonds (A+)","Residential mortgage-backed securities (RMBS, AA+)","Cash, central bank reserves, 0% risk-weight government bonds","Covered bonds (AA+)"],ans:2,
     exp:"<strong>Level 1 assets</strong> (cash, central bank reserves, 0% RW government bonds) qualify at 100%. Level 2A (corp bonds, covered bonds) = 85%. Level 2B (RMBS AA+) = 75%."},
    {cat:"Liquidity Risk",
     q:"What core problem does NSFR address?",
     opts:["Short-term (30-day) stress — insufficient liquid assets","Maturity mismatch: funding long-term assets with short-term debt, causing insolvency when rollover fails","Counterparty default loss on derivative contracts","Global bank capital adequacy shortfall"],ans:1,
     exp:"<strong>NSFR</strong> targets maturity mismatch. Classic failure: borrow 3-month money, lend for 2 years. In a crisis, the short-term rollover fails but the long-term loan can't be recalled → insolvency."},
    {cat:"Basel III",
     q:"Which capital tier was newly introduced in Basel III?",
     opts:["Tier 1 (common equity + preferred shares)","Tier 2 (subordinated debt, etc.)","CET1 — Common Equity Tier 1","TLAC — Total Loss-Absorbing Capacity"],ans:2,
     exp:"<strong>CET1 (Common Equity Tier 1)</strong> was introduced in Basel III — consisting solely of common shares and retained earnings. It is the highest-quality capital tier, with a minimum requirement of 4.5%."},
    {cat:"Basel III",
     q:"Which formula correctly defines RAROC?",
     opts:["(Revenue + Risk) ÷ Economic Capital","(Revenue − Risk) ÷ Economic Capital","Revenue ÷ (Economic Capital × Risk)","Risk × Revenue ÷ Own Capital"],ans:1,
     exp:"<strong>RAROC = (Revenue − Risk Cost) ÷ Economic Capital</strong>. Two units with the same revenue but different risk levels will have different RAROCs. Used to allocate capital to the most efficient business units."},
    {cat:"Basel III",
     q:"What are the 3 denominator components of the Basel II capital ratio?",
     opts:["Market risk + credit risk + geopolitical risk","Credit risk + op risk + liquidity risk","Credit risk + market risk + operational risk","Market risk + liquidity risk + reputational risk"],ans:2,
     exp:"Basel II: Capital Ratio = Own Capital ÷ (<strong>Credit risk + Market risk + Operational risk</strong>) ≥ 8%. Basel III then added LCR, NSFR, leverage ratio, and various capital buffers on top."},
    {cat:"Securities Systems",
     q:"How did TSE ArrowHead (launched 2010) change order processing time?",
     opts:["5 seconds → 1 second","3 seconds → 10 milliseconds","1 second → 100 microseconds","10 seconds → 1 millisecond"],ans:1,
     exp:"<strong>ArrowHead</strong> reduced order processing from 3 seconds to <strong>10 milliseconds</strong>. Market data tick capacity also grew from 600 to 8,200 ticks/sec (~13.5×). Co-location services were introduced."},
    {cat:"Securities Systems",
     q:"What is the key SE design lesson from the J-COM stock misorder incident (2005)?",
     hint:"A trader entered '1 yen for 610,000 shares' instead of '¥610,000 for 1 share'. Think about UI default states.",
     opts:["Large orders should be blocked by the system","Confirmation dialogs should default focus to Cancel — not Confirm","Exchange connections should always be dual-line","Two-person double-check should be mandatory for all orders"],ans:1,
     exp:"<strong>'Default the dangerous action to Cancel.'</strong> Confirmation dialogs should focus the Cancel button, not Confirm — so an accidental Enter key press triggers cancellation, not execution. ¥40.4B in losses led to a ¥10.7B Supreme Court settlement against TSE."},
  ]
},

/* ══════════════════════════════════════════════════════════════
   TOPIC 2 — AI & LLM Fundamentals
   Source wiki: wiki/concepts/Software 3.0.md etc.
══════════════════════════════════════════════════════════════ */
{
  id: 'llm',
  title: 'AI & LLM Fundamentals',
  icon: '🤖',
  color: '#10b981',
  description: 'Software 3.0, Transformers, Agents & Karpathy\'s Wiki Architecture',
  slideCount: 5,
  wikiPages: [
    'wiki/concepts/Software 3.0.md',
    'wiki/concepts/Transformer Architecture.md',
    'wiki/concepts/KV Caching.md',
    'wiki/concepts/Context Window Optimization.md',
    'wiki/concepts/12-Factor Agents.md',
    'wiki/concepts/Vibe Coding.md',
    'wiki/concepts/Agentic AI.md',
    'wiki/concepts/Human-in-the-loop.md',
    'wiki/concepts/GraphRAG.md',
    'wiki/concepts/Mixture-of-Experts (MoE).md',
  ],

  slides: [
    {
      num: '01',
      title: 'Software 3.0 — The Paradigm Shift',
      body: 'Software has evolved through three paradigms. In <strong>Software 3.0</strong>, natural language becomes the primary interface and LLMs act as the programmable runtime — replacing explicit rules and gradient-trained weights with prompt-driven behavior.',
      table: {
        headers: ['Era', 'Primary Interface', 'Characteristic'],
        rows: [
          ['Software 1.0', 'Explicit code (C, Python)', 'Deterministic, hand-crafted rules'],
          ['Software 2.0', 'Training data + gradients', 'Learned behavior, neural weights'],
          ['Software 3.0', 'Natural language prompts', 'LLM as runtime, emergent capabilities'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Karpathy\'s insight: "The hot new programming language is English." Prompts are programs.' },
        { color: 'green',  text: 'This wiki implements Karpathy\'s LLM Wiki: LLMs incrementally build and maintain a compiled knowledge base — paying synthesis cost once, vs. RAG which re-synthesizes on every query.' },
        { color: 'yellow', text: '3 layers: Raw Sources (immutable) → Wiki /wiki/ (LLM-owned synthesis) → Schema /README, prompts/ (config). LLM reads raw, writes wiki, follows schema.' },
      ],
      calc: 'sw30',
      wikiSource: ['wiki/concepts/Software 3.0.md', 'wiki/concepts/Vibe Coding.md']
    },
    {
      num: '02',
      title: 'Transformer Architecture',
      body: 'The Transformer (Vaswani et al., "Attention Is All You Need", 2017) replaced sequential RNNs with <strong>parallel self-attention</strong>, enabling training at unprecedented scale.',
      formula: 'Attention(Q,K,V) = softmax(QKᵀ / √d_k) · V',
      table: {
        headers: ['Component', 'Role'],
        rows: [
          ['Self-Attention', 'Each token attends to all others — captures global context in one step'],
          ['Multi-Head Attention', 'Run attention h times in parallel — captures different relationship types'],
          ['Feed-Forward', 'Per-token dense layer — adds non-linear capacity'],
          ['Positional Encoding', 'Injects order information (no recurrence needed)'],
          ['Layer Norm + Residual', 'Enables stable training of very deep networks'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Key advantage over RNN/LSTM: fully parallel — no sequential dependency. Scales massively on GPU/TPU clusters.' },
        { color: 'green',  text: 'Chinchilla scaling laws: optimal training uses ~20 tokens per parameter. A 7B model needs ~140B training tokens for compute-optimal performance.' },
      ],
      wikiSource: ['wiki/concepts/Transformer Architecture.md']
    },
    {
      num: '03',
      title: 'KV Cache & Context Windows',
      body: 'During autoregressive inference, the model recomputes Key and Value matrices for every prior token at each step. <strong>KV Caching</strong> stores these to avoid redundant computation — trading memory for speed.',
      formula: 'KV Cache (GB) = 2 × L × H × C × bytes_per_element / 1024³',
      table: {
        headers: ['Variable', 'Meaning', 'LLaMA-3 8B example'],
        rows: [
          ['L', 'Number of layers', '32'],
          ['H', 'Hidden size', '4096'],
          ['C', 'Context length (tokens)', '128,000'],
          ['bytes', 'fp16 = 2, fp32 = 4', '2 (fp16)'],
          ['Result', 'Total KV cache', '≈ 64 GB'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Prompt caching (Anthropic / OpenAI): cache expensive system prompt prefixes. Reduces latency and cost by >80% on repeated API calls with the same prefix.' },
        { color: 'green',  text: 'GQA / MQA (Grouped / Multi-Query Attention): reduce KV cache size by sharing K,V heads across query heads — key technique behind efficient long-context models.' },
        { color: 'yellow', text: 'Context length explosion: GPT-3 (4k) → Claude 3.5 Sonnet (200k) → Gemini 1.5 (1M tokens). Larger context = larger KV cache = more GPU memory pressure.' },
      ],
      calc: 'kvcache',
      wikiSource: ['wiki/concepts/KV Caching.md', 'wiki/concepts/Context Window Optimization.md']
    },
    {
      num: '04',
      title: 'Agentic AI & 12-Factor Agents',
      body: 'LLMs as <strong>agents</strong> — not just chatbots — use tools, maintain state, and complete multi-step tasks autonomously. Reliability is the core engineering challenge.',
      table: {
        headers: ['12-Factor Principle', 'Why it matters'],
        rows: [
          ['Natural language to tool calls', 'LLM decides which tool to invoke based on context'],
          ['Own your control flow', 'Avoid infinite loops; gate on humans at key checkpoints'],
          ['Stateless where possible', 'Explicit state management prevents context drift'],
          ['Small, focused agents', 'Single-responsibility reduces failure surface area'],
          ['Structured outputs', 'JSON/schema contracts make LLM output machine-readable'],
          ['Human-in-the-loop', 'Pause for approval on irreversible or high-risk actions'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: '"Why Johnny Can\'t Use Agents" (CMU 2025): the reliability gap is the #1 barrier. Agents fail not because LLMs are wrong, but because system design is fragile.' },
        { color: 'green',  text: 'Vibe Coding (Karpathy): human as director, AI as executor. Natural language intent → Claude Code → working software. Human reviews and redirects, not codes line-by-line.' },
      ],
      wikiSource: ['wiki/concepts/12-Factor Agents.md', 'wiki/concepts/Agentic AI.md', 'wiki/concepts/Human-in-the-loop.md', 'wiki/concepts/Vibe Coding.md']
    },
    {
      num: '05',
      title: 'GraphRAG & Knowledge Architectures',
      body: 'Standard RAG retrieves text chunks from a vector store. <strong>GraphRAG</strong> first builds a knowledge graph — enabling multi-hop reasoning across interconnected entities.',
      table: {
        headers: ['Approach', 'How it works', 'Best for'],
        rows: [
          ['Keyword search', 'BM25 / inverted index', 'Exact term matching'],
          ['Standard RAG', 'Embed → cosine similarity', 'Semantic similarity queries'],
          ['GraphRAG', 'Entity graph + community summaries', 'Multi-hop relational questions'],
          ['LLM Wiki (Karpathy)', 'LLM compiles knowledge incrementally', 'Deep synthesis over time'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Karpathy\'s key insight: RAG re-synthesizes on every query. A compiled wiki pays the synthesis cost once and serves it instantly — like compiled vs. interpreted code.' },
        { color: 'yellow', text: 'This repo\'s wiki organizes pages by TYPE (concepts/, entities/, infrastructure/) — not domain — to prevent silos and allow natural cross-domain linking.' },
      ],
      wikiSource: ['wiki/concepts/GraphRAG.md']
    },
  ],

  questions: [
    {cat:"Software 3.0",
     q:"What best defines 'Software 3.0' in Karpathy's framework?",
     opts:["The third generation of the Windows OS","A paradigm where natural language + LLMs replace traditional explicit code","Software with 3 billion parameters","OpenAI's third GPT version"],ans:1,
     exp:"<strong>Software 3.0</strong> is a development paradigm where natural language serves as the primary interface and LLMs act as the programmable runtime. Karpathy: 'The hot new programming language is English.'"},
    {cat:"Transformer",
     q:"What was the key architectural innovation of the Transformer (Vaswani et al., 2017)?",
     opts:["Recurrent LSTM layers for sequential memory","Convolutional filters adapted for text","Self-attention enabling fully parallel sequence processing","Deep residual connections for gradient flow"],ans:2,
     exp:"<strong>Self-attention</strong> allows every token to attend to all others in a single step — fully parallel, not sequential. This is what made scaling on GPUs/TPUs practical and enabled modern LLMs."},
    {cat:"KV Cache",
     q:"What is the primary purpose of KV Caching in LLM inference?",
     opts:["Cache HTTP API responses from the model provider","Store Key-Value matrices from prior tokens to avoid recomputing them each step","Compress model weights to reduce VRAM","Index the training dataset for faster retrieval"],ans:1,
     exp:"<strong>KV Caching</strong> stores the Key and Value matrices already computed for prior tokens, so the model only needs to process new tokens at each generation step — trading memory for inference speed."},
    {cat:"LLM Wiki",
     q:"In Karpathy's LLM Wiki architecture, what role does the /wiki/ layer play?",
     opts:["Stores immutable raw source documents the LLM reads","Contains LLM-generated, incrementally maintained markdown synthesis pages","Holds configuration and schema (prompts) that guide the LLM","Logs all user queries for analytics"],ans:1,
     exp:"The <strong>/wiki/ layer</strong> is fully LLM-owned: summaries, entity pages, concept pages, comparisons. The LLM reads raw sources but only writes to the wiki layer, following the schema in /README."},
    {cat:"Agents",
     q:"What problem does the 12-Factor Agents methodology primarily address?",
     opts:["12 compliance requirements for deploying AI in production","Applying cloud-native engineering principles to overcome the reliability gap in LLM agents","12 prompt engineering templates for production systems","Multi-model routing and load balancing"],ans:1,
     exp:"<strong>12-Factor Agents</strong> applies cloud-native software principles (explicit state, small focused components, HITL, structured outputs) to make LLM agents production-reliable — addressing the 'reliability gap'."},
    {cat:"LLM Wiki",
     q:"Why does Karpathy's wiki organize pages 'by type, not domain'?",
     opts:["It is technically simpler to implement in file systems","Domain names change frequently and become stale","To prevent domain silos — pages remain discoverable peers that link naturally across topics","To match Obsidian's default folder structure requirements"],ans:2,
     exp:"Organizing by type (<strong>concepts/, entities/, infrastructure/</strong>) prevents domain silos. A page on JPX lives in entities/ and is findable from any domain — not buried in a financial-systems subfolder."},
    {cat:"Vibe Coding",
     q:"What best describes 'Vibe Coding'?",
     opts:["Writing code while listening to music for creative flow","Human as director using natural language to command AI as executor — reviewing and redirecting rather than writing line-by-line","Informal, undocumented rapid prototyping","A React component architecture pattern"],ans:1,
     exp:"<strong>Vibe Coding</strong> (Karpathy): the human provides high-level direction in natural language; the AI (e.g. Claude Code) executes. The human's role shifts from writing code to directing, reviewing, and steering outcomes."},
    {cat:"Architecture",
     q:"What is Mixture-of-Experts (MoE)?",
     opts:["An ensemble of multiple LLM API providers","A neural architecture that activates only a subset of its parameters (experts) for each input token","A multi-agent debate framework for building consensus","A technique for mixing training datasets from different domains"],ans:1,
     exp:"<strong>MoE</strong> routes each token to a small subset of 'expert' feed-forward layers, keeping compute per token constant even as total parameter count grows massively (used in GPT-4, Mixtral, DeepSeek)."},
    {cat:"Retrieval",
     q:"What distinguishes GraphRAG from standard vector RAG?",
     opts:["GraphRAG uses larger embedding models for better recall","GraphRAG builds a knowledge graph and community summaries, enabling multi-hop relational reasoning","GraphRAG is faster because it skips the embedding step","GraphRAG only works with structured tabular data"],ans:1,
     exp:"<strong>GraphRAG</strong> (Microsoft) first builds an entity knowledge graph, then uses LLM-generated community summaries. This enables questions requiring reasoning across multiple interconnected entities — not just semantic similarity."},
    {cat:"Agents",
     q:"What is Human-in-the-loop (HITL) primarily used for in agentic systems?",
     opts:["To replace all AI decisions with human ones","To efficiently collect training labels at scale","To integrate human approval at key checkpoints — especially before irreversible or high-risk actions","To bypass automated pipelines when they fail"],ans:2,
     exp:"<strong>HITL</strong> integrates human intervention at specific decision points — not to replace AI, but to ensure high-stakes or irreversible actions receive human approval. A core principle of the 12-Factor Agents methodology."},
  ]
},

/* ══════════════════════════════════════════════════════════════
   TOPIC 3 — Algorithmic Trading
   Source wiki: wiki/concepts/Algorithmic Trading.md
                wiki/concepts/Smart Order Routing.md
                wiki/infrastructure/Securities Firm Systems.md
══════════════════════════════════════════════════════════════ */
{
  id: 'algo-trading',
  title: 'Algorithmic Trading',
  icon: '⚡',
  color: '#f59e0b',
  description: 'VWAP, TWAP, IS, POV, Iceberg — automated execution in wholesale equity markets',
  slideCount: 5,
  wikiPages: [
    'wiki/concepts/Algorithmic Trading.md',
    'wiki/concepts/Smart Order Routing.md',
    'wiki/infrastructure/Securities Firm Systems.md',
    'wiki/concepts/Capital Markets.md',
  ],

  slides: [
    {
      num: '01',
      title: 'What is Algorithmic Trading?',
      body: '<strong>Algorithmic Trading</strong> is the automated execution of trades according to pre-defined mathematical rules. In wholesale (institutional) equity trading, it minimizes execution costs and precisely controls the trade-off between <strong>market impact</strong> and <strong>opportunity cost</strong>.',
      table: {
        headers: ['Concept', 'Definition'],
        rows: [
          ['Market Impact', 'Price movement caused by your own trade — selling pushes price down'],
          ['Opportunity Cost', 'Cost of executing too slowly and missing a favourable price'],
          ['Execution Cost', 'Total of market impact + opportunity cost + fees'],
          ['Facilitation', 'Firm acts as counterparty, providing liquidity; later unwinds position in market'],
        ]
      },
      keyPoints: [
        { color: 'blue',  text: 'The core trade-off: execute fast (low opportunity cost, high market impact) vs. execute slowly (low market impact, high opportunity cost). Each algorithm manages this differently.' },
        { color: 'green', text: 'Facilitation: a securities firm crosses a client trade bilaterally, taking on the position itself, then uses algo execution to unwind that position with minimal market impact.' },
      ],
      wikiSource: ['wiki/concepts/Algorithmic Trading.md', 'wiki/concepts/Capital Markets.md']
    },
    {
      num: '02',
      title: 'VWAP & TWAP — Volume and Time Anchoring',
      body: 'The two most widely-used baseline algorithms — one anchors to <strong>market volume</strong>, the other to <strong>time</strong>.',
      formula: 'VWAP = Σ(Price × Volume) / Σ(Volume)  over the trading day',
      table: {
        headers: ['Algorithm', 'Strategy', 'Best for'],
        rows: [
          ['VWAP', 'Distribute execution proportional to historical intraday volume profile', 'Mid-cap stocks; most common benchmark'],
          ['TWAP', 'Split order uniformly across fixed time intervals', 'Patient strategies; illiquid stocks; predictable execution'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'VWAP is the most commonly used algo technique. A trader "beating VWAP" bought below the daily average price — a standard institutional performance benchmark.' },
        { color: 'yellow', text: 'TWAP is simpler and more predictable but ignores volume patterns. Useful when you want steady market participation regardless of what volume is doing.' },
      ],
      wikiSource: ['wiki/concepts/Algorithmic Trading.md']
    },
    {
      num: '03',
      title: 'IS & POV — Minimizing Cost and Tracking Volume',
      body: 'More sophisticated algorithms that respond dynamically to market conditions.',
      table: {
        headers: ['Algorithm', 'Full Name', 'Core Mechanism'],
        rows: [
          ['IS', 'Implementation Shortfall', 'Explicitly minimizes total trading cost (timing cost + market impact). Adjusts execution in real-time to market changes.'],
          ['POV', 'Participation of Volume', 'Maintains a constant participation ratio (e.g. 10% of market volume). Adapts automatically to intraday volume variations.'],
        ]
      },
      keyPoints: [
        { color: 'blue',  text: 'IS (Implementation Shortfall): measures the gap between the decision price (when you decided to trade) and the final execution price. Minimizing IS = minimizing total real cost.' },
        { color: 'green', text: 'POV: if market volume spikes, POV executes more; if volume dries up, it slows down. Reduces information leakage by avoiding predictable patterns.' },
        { color: 'yellow', text: 'IS vs VWAP: IS optimizes for absolute cost; VWAP optimizes relative to a benchmark. Urgency matters — IS can "front-load" execution when prices are moving against you.' },
      ],
      wikiSource: ['wiki/concepts/Algorithmic Trading.md']
    },
    {
      num: '04',
      title: 'Iceberg, Pegging & Facilitation',
      body: 'Advanced execution techniques for large orders and liquidity provision.',
      table: {
        headers: ['Technique', 'Description', 'Purpose'],
        rows: [
          ['Iceberg Orders', 'Shows only a small "visible" slice of a large order; rest is hidden and auto-refills', 'Conceal order size; avoid front-running'],
          ['Pegging', 'Automatically tracks and follows the best bid or ask quote', 'Stay at top of order book without manual updates'],
          ['Facilitation', 'Securities firm crosses client trade as counterparty; unwinds position using algos', 'Provide immediate liquidity to institutional clients'],
        ]
      },
      keyPoints: [
        { color: 'blue',  text: 'Iceberg orders prevent information leakage. A 1M share order shown as 10,000 shares at a time avoids telegraphing intent to the market and triggering adverse price moves.' },
        { color: 'green', text: 'Facilitation is how major securities firms generate revenue: they absorb client order flow at a known price (risk), then algorithmically manage the resulting position to minimize loss.' },
      ],
      wikiSource: ['wiki/concepts/Algorithmic Trading.md', 'wiki/infrastructure/Securities Firm Systems.md']
    },
    {
      num: '05',
      title: 'Smart Order Routing & Execution Environment',
      body: 'Modern algo execution spans <strong>multiple venues</strong>. Smart Order Routing (SOR) decides where to send each order in real time.',
      table: {
        headers: ['Venue (Japan)', 'Type'],
        rows: [
          ['Tokyo Stock Exchange (TSE)', 'Primary exchange'],
          ['SBI Japannext', 'PTS (Proprietary Trading System)'],
          ['Chi-X Japan', 'PTS'],
          ['Osaka Exchange', 'Derivatives focus'],
        ]
      },
      keyPoints: [
        { color: 'blue',  text: 'SOR continuously scans all available venues for best price, liquidity, and fees. Algo + SOR = split orders optimally across TSE, Japannext, Chi-X for best combined execution.' },
        { color: 'green', text: 'Competitive advantage: <strong>latency reduction</strong> via co-location (server physically close to exchange matching engine) + <strong>dynamic algorithm selection</strong> tuned to real-time market conditions.' },
        { color: 'yellow', text: 'TSE ArrowHead (2010): order processing 3s → 10ms, quote distribution 600 → 8,200 ticks/sec. This infrastructure arms race made low-latency execution viable for all institutional players.' },
      ],
      wikiSource: ['wiki/concepts/Algorithmic Trading.md', 'wiki/concepts/Smart Order Routing.md', 'wiki/infrastructure/Tokyo Stock Exchange arrowhead.md']
    },
  ],

  questions: [
    {cat:"Algo Trading",
     q:"What is the core trade-off that algorithmic trading manages?",
     opts:["Regulatory compliance vs. profitability","Market impact vs. opportunity cost","Speed vs. accuracy","Domestic vs. cross-border execution"],ans:1,
     exp:"<strong>Market impact vs. opportunity cost</strong>: executing slowly reduces market impact (you don't move the price against yourself) but increases opportunity cost (the price may move away before you finish). Every algorithm manages this trade-off differently."},
    {cat:"VWAP",
     q:"What does VWAP stand for and what does it measure?",
     opts:["Volume-Weighted Average Price — average price weighted by traded volume over the day","Value-Weighted Average Price — portfolio value per unit","Volume-Weighted Algorithmic Protocol — execution instructions","Variable-Weighted Allocation Percentage — position sizing"],ans:0,
     exp:"<strong>VWAP = Volume-Weighted Average Price</strong>: Σ(Price × Volume) / Σ(Volume). It is the most commonly used execution benchmark in institutional equity trading. 'Beating VWAP' means buying below the day's average price."},
    {cat:"TWAP",
     q:"How does TWAP distribute order execution?",
     hint:"Think about what 'time-weighted' means — what does it split by?",
     opts:["Proportional to historical volume profile","Uniformly across equal time intervals","Proportional to real-time market volume","Dynamically based on price momentum"],ans:1,
     exp:"<strong>TWAP</strong> splits the order <strong>uniformly across fixed time intervals</strong> (e.g., equal slices every 30 minutes). It is simpler and more predictable than VWAP but ignores volume patterns. Useful for patient execution in illiquid stocks."},
    {cat:"IS",
     q:"What does IS (Implementation Shortfall) measure and optimize?",
     opts:["The gap between bid and ask prices","The number of shares executed vs. planned","The difference between decision price and final execution price","The ratio of algo vs. manual trades"],ans:2,
     exp:"<strong>IS = Implementation Shortfall</strong> measures the gap between the price when you <em>decided</em> to trade and the actual final execution price. Minimizing IS = minimizing the true total cost of the trade, including timing costs and market impact."},
    {cat:"POV",
     q:"What does a POV (Participation of Volume) algorithm maintain constant?",
     opts:["Execution price relative to VWAP","A fixed percentage participation in market volume","Order size per time interval","Spread between bid and ask"],ans:1,
     exp:"<strong>POV maintains a constant participation ratio</strong> — e.g., always execute 10% of whatever volume the market trades. When volume spikes, POV executes more; when volume is low, it slows down. This reduces information leakage by avoiding predictable patterns."},
    {cat:"Iceberg",
     q:"What is the purpose of an Iceberg order?",
     opts:["To execute as fast as possible with maximum visibility","To display only a small portion of a large order, hiding the full size","To participate at a fixed percentage of market volume","To anchor execution to the time-weighted average price"],ans:1,
     exp:"An <strong>Iceberg order</strong> shows only a small 'visible' slice (e.g., 10,000 shares) of a large order (e.g., 1,000,000 shares). As each slice fills, the next auto-refills. Purpose: conceal order size to avoid front-running and adverse price movements."},
    {cat:"Facilitation",
     q:"In facilitation, what role does the securities firm play?",
     opts:["Executes client orders directly on the exchange","Acts as counterparty to the client trade, then unwinds the position using algorithms","Routes orders to the best venue via SOR","Provides market data analytics to clients"],ans:1,
     exp:"In <strong>Facilitation</strong>, the securities firm <em>crosses</em> the client trade bilaterally — taking on the position itself at a known price. It then uses algorithmic execution to unwind that position in the market with minimal impact. This provides immediate liquidity to institutional clients."},
    {cat:"Smart Order Routing",
     q:"What does Smart Order Routing (SOR) do?",
     opts:["Selects which algorithm (VWAP, TWAP, IS) to use for an order","Splits and routes order flow across multiple venues to find best price, liquidity, and fees","Manages the risk of overnight positions","Monitors compliance with exchange rules"],ans:1,
     exp:"<strong>SOR (Smart Order Routing)</strong> continuously scans all available venues (TSE, Japannext, Chi-X, etc.) and routes or splits orders to where price and liquidity are best. It works alongside algo execution to optimize the full execution path."},
    {cat:"Market Structure",
     q:"TSE ArrowHead (2010) reduced order processing time from 3 seconds to what?",
     opts:["100 milliseconds","10 milliseconds","1 millisecond","10 microseconds"],ans:1,
     exp:"<strong>TSE ArrowHead</strong> (launched 2010) reduced order entry from 3 seconds to <strong>10 milliseconds</strong> — a 300× improvement. Quote distribution grew from 600 to 8,200 ticks/second (~13.5×). This arms race made low-latency co-location essential for institutional traders."},
    {cat:"Algo Trading",
     q:"What competitive advantage does co-location provide in algorithmic trading?",
     opts:["Lower brokerage fees","Better compliance monitoring","Reduced network latency by physically placing servers near the exchange","Access to dark pool liquidity"],ans:2,
     exp:"<strong>Co-location</strong> (colocation) places a firm's execution servers physically close to the exchange's matching engine, dramatically reducing network round-trip latency. Combined with dynamic algorithm selection, this is the core competitive advantage in modern institutional equity execution."},
  ]
},

/* ══════════════════════════════════════════════════════════════
   TOPIC 4 — Claude Code & Agentic Development
   Source wiki: wiki/concepts/Claude Code CLI.md
                wiki/concepts/12-Factor Agents.md
                wiki/concepts/Vibe Coding.md
                wiki/concepts/Software 3.0.md
══════════════════════════════════════════════════════════════ */
{
  id: 'claude-code',
  title: 'Claude Code & Agentic Dev',
  icon: '🤖',
  color: '#8b5cf6',
  description: 'Claude Code CLI, 12-Factor Agents, Vibe Coding, and production-grade AI engineering',
  slideCount: 6,
  wikiPages: [
    'wiki/concepts/Claude Code CLI.md',
    'wiki/concepts/12-Factor Agents.md',
    'wiki/concepts/Vibe Coding.md',
    'wiki/concepts/Software 3.0.md',
    'wiki/concepts/Agentic AI.md',
    'wiki/concepts/Human-in-the-loop.md',
  ],

  slides: [
    {
      num: '01',
      title: 'Claude Code — Agentic CLI',
      body: '<strong>Claude Code</strong> is an agentic command-line interface developed by Anthropic. Unlike passive AI chatbots, it is an active collaborator that can plan, execute, and self-correct within a local development environment — a "self-driving" engineer.',
      table: {
        headers: ['Feature', 'What it does'],
        rows: [
          ['Autonomous Execution', 'Handles multi-step workflows: find, replace, test, commit — all in one command'],
          ['MCP Integration', 'Connects to external data sources, docs, and internal APIs for context-aware solutions'],
          ['Semantic Code Understanding', 'Uses LSP to navigate by definitions/references, not text matching'],
          ['Persistent Memory', 'CLAUDE.md files + SQLite session history for project-specific context'],
          ['Subagents', 'Spawns specialized worker agents to handle parallel tasks simultaneously'],
        ]
      },
      keyPoints: [
        { color: 'blue',  text: 'Claude Code is CLI-native and high-autonomy. In the AI dev tools landscape: GitHub Copilot = low autonomy + IDE; Cursor = medium autonomy + IDE; Claude Code = high autonomy + CLI.' },
        { color: 'green', text: 'CLAUDE.md is a project-level instruction file Claude Code reads on startup — equivalent to a senior engineer\'s onboarding doc, written once, reused on every session.' },
      ],
      calc: 'sw30',
      wikiSource: ['wiki/concepts/Claude Code CLI.md']
    },
    {
      num: '02',
      title: 'The Agentic Loop — REPL for Autonomous Execution',
      body: 'Claude Code operates on a <strong>Read-Eval-Print Loop (REPL)</strong> designed for autonomous task completion, not just conversation.',
      table: {
        headers: ['Step', 'Action', 'Tool used'],
        rows: [
          ['Plan', 'Deconstruct goal into subtasks', 'Internal reasoning'],
          ['Execute', 'Run a tool call (Bash, Edit, Read, Git…)', 'Bash / Edit / Write / Glob'],
          ['Observe', 'Analyse output, errors, and side-effects', 'Read / console output'],
          ['Decide', 'Goal met? → return. Still working? → loop back to Plan', 'Internal reasoning'],
          ['Review', 'Final output shown to human for approval', 'Human review'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'The loop can run dozens of iterations autonomously — e.g., "refactor all deprecated API calls, run tests, fix failures, commit" can execute in one prompt.' },
        { color: 'yellow', text: 'Context management: a 5-layer context compressor + prompt caching reduces token costs by up to 90%. Older context is summarized and stored in SQLite, not dropped.' },
      ],
      wikiSource: ['wiki/concepts/Claude Code CLI.md']
    },
    {
      num: '03',
      title: 'Safety & Security Model',
      body: 'Anthropic built a <strong>defense-in-depth</strong> security strategy to make Claude Code safe for production use. Four layers of protection.',
      table: {
        headers: ['Layer', 'Mechanism', 'What it prevents'],
        rows: [
          ['Permission Gating', 'Explicit approval required for write ops and terminal commands', 'Accidental destructive actions'],
          ['Local Sandboxing', '/sandbox command for isolated code execution', 'Malicious or untrusted scripts'],
          ['Incremental Trust', 'Users grant temp or permanent permissions for safe commands (e.g. npm test)', 'Over-broad permissions'],
          ['Injection Protection', 'Scans tool outputs for malicious instructions designed to hijack the agent', 'Prompt injection attacks'],
        ]
      },
      keyPoints: [
        { color: 'red',    text: 'Prompt injection: observed tool output (web pages, files, emails) can contain text designed to trick the agent into taking unauthorized actions. The scanner layer blocks this.' },
        { color: 'green',  text: 'Incremental trust is key to usability — a team can grant "allow npm test always" while keeping destructive ops (git reset --hard, rm -rf) behind explicit approval each time.' },
      ],
      wikiSource: ['wiki/concepts/Claude Code CLI.md']
    },
    {
      num: '04',
      title: '12-Factor Agents — Production Reliability',
      body: 'The <strong>12-Factor Agent</strong> methodology applies cloud-native software principles to LLM agents, solving the "Reliability Gap" between demos and production.',
      table: {
        headers: ['Factor', 'Principle'],
        rows: [
          ['1', 'Natural Language → Tool Calls: translate intent into structured API calls'],
          ['2', 'Own Your Prompts: version and test prompts like source code'],
          ['3', 'Own Your Control Flow: use deterministic code for the main loop, not the LLM'],
          ['5', 'Own Your Context Window: avoid the "Dumb Zone" (>40-50% full = performance drop)'],
          ['8', 'Human-in-the-Loop via Tool Calls: "ask a human" is a standard tool call'],
          ['12', 'Stateless Reducer Mindset: agent = pure function (State + Input) → (New State + Output)'],
        ]
      },
      keyPoints: [
        { color: 'red',    text: '"The Dumb Zone": when context window fills beyond 40–50%, LLM instruction-following drops exponentially. Factor 5 mandates active context curation via RAG and summarization.' },
        { color: 'blue',   text: 'Factor 8 (HITL via Tool Call): the agent recognizes its own uncertainty and calls request_human_intervention(), pausing execution until a human provides guidance or approval.' },
      ],
      wikiSource: ['wiki/concepts/12-Factor Agents.md']
    },
    {
      num: '05',
      title: 'Vibe Coding — The Developer Experience',
      body: '<strong>Vibe Coding</strong> (coined by Andrej Karpathy, 2025) is Software 3.0 in practice: the developer provides high-level intent, the AI handles implementation.',
      table: {
        headers: ['Aspect', 'Traditional Coding', 'Vibe Coding'],
        rows: [
          ['Primary language', 'Python / TypeScript / etc.', 'Natural language (English)'],
          ['Developer role', 'Logic designer / syntax writer', 'Intent provider / verifier'],
          ['Source code', 'Files with syntax', 'Prompts + CLAUDE.md + context'],
          ['Workflow', 'Write → debug → commit', 'Prompt → generate → review → refine'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Benefits: 5–10× productivity (senior engineers), democratization (non-technical founders build MVPs), focus shifts from boilerplate to product design.' },
        { color: 'red',    text: 'Risks: silent technical debt (AI-generated code may contain subtle flaws), context rot (stale context causes hallucinations), Junior Crisis (entry-level roles being automated away).' },
        { color: 'yellow', text: 'Technical foundation: massive context windows (Claude 3.5 = 200k tokens) + MCP standardization. MCP grounds vibe in the actual codebase — not a generic guess.' },
      ],
      wikiSource: ['wiki/concepts/Vibe Coding.md', 'wiki/concepts/Software 3.0.md']
    },
    {
      num: '06',
      title: 'Claude Code in This Workflow',
      body: 'Everything in this app — slides, questions, wiki sources — is managed by Claude Code using exactly the principles above. Here\'s the live example.',
      table: {
        headers: ['Step', 'What happened'],
        rows: [
          ['CLAUDE.md', 'You told Claude Code to read this file first — it defined the quiz schema'],
          ['wiki source links', 'Claude Code read each wiki file and wrote accurate questions from the content'],
          ['topics.js', 'All quiz content lives here — Claude Code edits this file, never the app shell'],
          ['Git push', 'Claude Code committed and pushed — GitHub Pages auto-deployed in ~60s'],
          ['This slide', 'Generated from wiki/concepts/Claude Code CLI.md + 12-Factor Agents.md'],
        ]
      },
      keyPoints: [
        { color: 'green', text: 'To add more topics: open a new Claude Code session, say "Read quiz/CLAUDE.md then read wiki/concepts/X.md and add a quiz topic for it" — done in minutes.' },
        { color: 'blue',  text: 'This is the 12-Factor pattern in action: Factor 3 (control flow in code), Factor 5 (context curated via CLAUDE.md), Factor 8 (human reviews before push).' },
      ],
      wikiSource: ['wiki/concepts/Claude Code CLI.md', 'wiki/concepts/12-Factor Agents.md', 'wiki/concepts/Vibe Coding.md']
    },
  ],

  questions: [
    {cat:"Claude Code",
     q:"What type of tool is Claude Code and what makes it different from tools like GitHub Copilot?",
     opts:["A code review tool with AI suggestions","An agentic CLI that autonomously plans, executes, and self-corrects — not just autocomplete","A chat interface for asking coding questions","An IDE extension for syntax highlighting"],ans:1,
     exp:"<strong>Claude Code</strong> is an <strong>agentic CLI</strong> — it runs a full Read-Eval-Print Loop to complete multi-step tasks autonomously. GitHub Copilot is low-autonomy autocomplete; Claude Code can write, test, fix, and commit in one workflow."},
    {cat:"Agentic Loop",
     q:"What does REPL stand for in the context of Claude Code's execution model?",
     opts:["Remote Execution and Programming Layer","Read-Eval-Print Loop","Recursive Error Prevention Logic","Real-time Execution Planning Language"],ans:1,
     exp:"<strong>REPL = Read-Eval-Print Loop</strong>. In Claude Code: Plan → Execute (tool call) → Observe (output) → loop until goal met → final human review. This loop can run dozens of iterations autonomously."},
    {cat:"Claude Code",
     q:"What is CLAUDE.md and what is it used for?",
     opts:["A markdown viewer built into Claude Code","A project-level instruction file that Claude Code reads on startup for project-specific context","A log file where Claude Code records completed actions","A configuration file for API authentication"],ans:1,
     exp:"<strong>CLAUDE.md</strong> is a project-level instruction file placed in the repo. Claude Code reads it on every session startup — defining repo structure, coding conventions, and workflows. Like a senior engineer's onboarding doc, written once, reused forever."},
    {cat:"Safety",
     q:"What is Prompt Injection and how does Claude Code defend against it?",
     opts:["Overly long prompts that cause token overflow — defended by context compression","Malicious instructions hidden in tool outputs (files, web pages) designed to hijack the agent — defended by an injection scanner layer","SQL injection adapted for LLMs — defended by input sanitization","Social engineering in the chat interface — defended by rate limiting"],ans:1,
     exp:"<strong>Prompt Injection</strong>: malicious text in observed content (a webpage, a file) that tries to re-direct the agent's actions. Claude Code scans all tool outputs for such instructions before processing them — a dedicated defense layer."},
    {cat:"12-Factor",
     q:"What is 'The Dumb Zone' in 12-Factor Agent terminology?",
     opts:["A warning logged when the agent calls an undefined tool","The performance degradation that occurs when context window fills beyond 40–50%","The period after context compaction when memory is reset","A quadrant chart zone for low-reliability, low-autonomy agents"],ans:1,
     exp:"<strong>The Dumb Zone</strong>: research showed LLM instruction-following drops exponentially when context window exceeds 40–50% full. Factor 5 mandates active context curation — using RAG and summarization to keep the 'active' context lean."},
    {cat:"12-Factor",
     q:"Factor 3 of the 12-Factor Agents states: 'Own Your Control Flow'. What does this mean?",
     opts:["The LLM should decide all branching logic autonomously","Use deterministic code (Python/TypeScript) for the main agent loop, not the LLM","All agent decisions must be logged to a control-flow database","Human operators should manually approve every step"],ans:1,
     exp:"<strong>Factor 3 — Own Your Control Flow</strong>: the main agent loop (branching, retries, error handling) should be written in deterministic code, not delegated to the LLM. The LLM handles reasoning and tool calls; your code handles the scaffolding."},
    {cat:"12-Factor",
     q:"In a 12-Factor Agent system, how is Human-in-the-Loop (Factor 8) implemented?",
     opts:["A separate web dashboard where humans approve batches of actions","'Ask a human' is implemented as a standard tool call that pauses execution","Humans manually review and replay all agent logs daily","A flag in the config file that enables human review mode"],ans:1,
     exp:"<strong>Factor 8</strong>: treat 'ask a human' as a standard tool call. The agent calls <code>request_human_intervention()</code> when it recognizes uncertainty, pausing execution state (Factor 7) until a human provides guidance or approval, then resuming."},
    {cat:"Vibe Coding",
     q:"What are the two key technical breakthroughs that made Vibe Coding possible?",
     opts:["Faster CPUs and cheaper cloud storage","Massive context windows (hundreds of thousands of tokens) and MCP standardization","Improved code editors and Git workflow automation","Lower API costs and open-source model releases"],ans:1,
     exp:"Vibe Coding requires <strong>massive context windows</strong> (Claude 3.5 = 200k tokens, enabling AI to 'read' an entire project) and <strong>MCP (Model Context Protocol)</strong>, which standardizes how AI agents connect to local files, databases, and APIs — grounding the AI in your actual codebase."},
    {cat:"Vibe Coding",
     q:"What is 'Context Rot' in Vibe Coding?",
     opts:["When the AI's training data becomes outdated","Hallucinations caused by stale or poorly managed context that breaks existing code patterns","The accumulation of commented-out code in AI-generated files","Token budget exhaustion during a long session"],ans:1,
     exp:"<strong>Context Rot</strong>: if the AI's context isn't actively managed (wrong files loaded, old summaries, conflicting instructions), it starts 'hallucinating' solutions that break existing patterns or contradict earlier decisions. Prevented by good CLAUDE.md and regular /compact."},
    {cat:"Claude Code",
     q:"What does Claude Code's 5-layer context compressor achieve?",
     opts:["Reduces file size of generated code","Encrypts session state for security","Reduces token costs by up to 90% by summarizing and caching older context","Compresses images in the codebase"],ans:2,
     exp:"Claude Code's <strong>5-layer context compressor</strong> combined with prompt caching can reduce token costs by up to 90%. Older context is summarized and stored in SQLite (not dropped) so it can be recalled without consuming active context window space."},
    {cat:"12-Factor",
     q:"Factor 12 describes the 'Stateless Reducer Mindset'. What is the correct mental model?",
     opts:["Agents should not store any state between runs","Agent = pure function: (State + Input) → (New State + Output) — like a database transaction","Agents should reduce context size on each loop iteration","Only stateless HTTP calls should be used for tool interactions"],ans:1,
     exp:"<strong>Factor 12 — Stateless Reducer Mindset</strong>: think of the agent as a pure function — given the same (State + Input), it should produce the same (New State + Output). This makes agents testable, predictable, and resumable after failures — like a database transaction log."},
    {cat:"Claude Code",
     q:"What is the purpose of spawning subagents in Claude Code?",
     opts:["To run on separate machines for distributed computing","To handle parallel tasks simultaneously — e.g., searching docs while refactoring code","To create isolated security sandboxes for untrusted code","To reduce costs by using smaller models for simpler tasks"],ans:1,
     exp:"<strong>Subagents</strong> in Claude Code are specialized worker agents spawned for parallel tasks. Example: one subagent searches documentation, another refactors code, a third runs tests — all simultaneously. This mirrors the agentic 'swarm' pattern in Software 3.0."},
  ]
},

/* ══════════════════════════════════════════════════════════════
   TOPIC 5 — Securities Firm Systems
   Source wiki: wiki/infrastructure/Securities Firm Systems.md
                wiki/infrastructure/DVP and STP Settlement.md
                wiki/infrastructure/Tokyo Stock Exchange arrowhead.md
                wiki/entities/Japan Exchange Group.md
══════════════════════════════════════════════════════════════ */
{
  id: 'securities-systems',
  title: 'Securities Firm Systems',
  icon: '🏗️',
  color: '#06b6d4',
  description: '6-system architecture, front vs. back office, risk types, historical failures — J-COM and Flash Crash',
  slideCount: 5,
  wikiPages: [
    'wiki/infrastructure/Securities Firm Systems.md',
    'wiki/infrastructure/DVP and STP Settlement.md',
    'wiki/infrastructure/Tokyo Stock Exchange arrowhead.md',
    'wiki/entities/Japan Exchange Group.md',
    'wiki/entities/Japan Securities Clearing Corporation.md',
    'wiki/entities/Japan Securities Depository Center.md',
    'wiki/concepts/Algorithmic Trading.md',
  ],

  slides: [
    {
      num: '01',
      title: 'The 6 Core Systems of a Securities Firm',
      body: 'A securities firm\'s IT infrastructure must balance <strong>front-office speed</strong> with <strong>back-office stability</strong>. Six primary systems support end-to-end operations from sales through settlement.',
      table: {
        headers: ['#', 'System', 'Role', 'Users'],
        rows: [
          ['①', 'Retail Operations', 'Customer info, orders, deposits, portfolio management', 'Retail sales'],
          ['②', 'Order & Execution', 'Algo trading, pricing, position management, execution analysis', 'Front office'],
          ['③', 'Reconciliation & Settlement', 'Trade matching, settlement processing, security/cash balances', 'Back office'],
          ['④', 'Enterprise Management', 'Accounting, HR, risk management (Oracle/SAP packages)', 'Enterprise'],
          ['⑤', 'Master Data', 'Securities, customer, valuation data management', 'All systems'],
          ['⑥', 'External Connectivity', 'Exchange, JSCC, JASDEC, BOJ, Bloomberg/Reuters/QUICK', 'All systems'],
        ]
      },
      keyPoints: [
        { color: 'blue', text: 'All 6 systems depend on ⑤ Master Data (the single source of truth for securities, customer, and valuation data) and ⑥ External Connectivity (exchange and clearing/settlement pipes).' },
      ],
      wikiSource: ['wiki/infrastructure/Securities Firm Systems.md']
    },
    {
      num: '02',
      title: 'Front Office vs. Back Office',
      body: 'The most fundamental architectural split in a securities firm: trading (front) vs. settlement (back) have opposite requirements.',
      table: {
        headers: ['Dimension', 'Front Office', 'Back Office'],
        rows: [
          ['Primary requirement', 'Speed + accuracy', 'Stability above all'],
          ['Key system', '② Order & Execution', '③ Reconciliation & Settlement'],
          ['Technology', 'Co-location, algo engines, low-latency infra', 'Mainframes (still dominant), batch processing'],
          ['Typical vendors', 'Custom / in-house builds', 'NRI STAR series, Accenture APTP, Broadridge Gloss'],
          ['Processing style', 'Real-time, sub-millisecond', 'Heavy overnight batch'],
        ]
      },
      keyPoints: [
        { color: 'blue',   text: 'Back-office mainframes are not a legacy problem — they are intentional. Mainframes offer unmatched reliability and throughput for settlement batch processing. "If it ain\'t broke, don\'t fix it."' },
        { color: 'yellow', text: 'Accenture APTP (Accenture Post-Trade Processing) is one of the dominant back-office vendors in the Japan securities market — relevant context for Accenture FS work.' },
      ],
      wikiSource: ['wiki/infrastructure/Securities Firm Systems.md']
    },
    {
      num: '03',
      title: 'Settlement Systems — DVP and STP',
      body: 'Settlement is where trades become final. Two key concepts: <strong>DVP</strong> eliminates settlement risk, <strong>STP</strong> eliminates manual intervention.',
      table: {
        headers: ['Concept', 'Full Name', 'What it does'],
        rows: [
          ['DVP', 'Delivery versus Payment', 'Securities delivered if and only if cash is simultaneously received — eliminates principal risk'],
          ['STP', 'Straight-Through Processing', 'Automated end-to-end processing from trade to settlement without manual intervention'],
          ['JSCC', 'Japan Securities Clearing Corporation', 'Central counterparty: novates trades (becomes buyer to every seller and seller to every buyer)'],
          ['JASDEC', 'Japan Securities Depository Center', 'Central securities depository: holds securities in book-entry form, runs settlement'],
        ]
      },
      keyPoints: [
        { color: 'blue',  text: 'Without DVP, a seller could deliver securities before receiving cash — and if the counterparty defaults, the seller loses both. DVP makes delivery and payment atomic.' },
        { color: 'green', text: 'STP reduces operational risk: every manual step in a trade lifecycle is a potential error, delay, or fraud vector. Full STP means a trade goes from execution to settlement with zero human touches.' },
      ],
      wikiSource: ['wiki/infrastructure/DVP and STP Settlement.md', 'wiki/entities/Japan Securities Clearing Corporation.md']
    },
    {
      num: '04',
      title: 'Risk Classification in Securities Operations',
      body: 'A securities firm manages 6 distinct risk types across its systems. Each has a dedicated mitigation domain.',
      table: {
        headers: ['Risk Type', 'Definition', 'Mitigation'],
        rows: [
          ['Market Risk', 'Stock/interest/FX price changes causing value loss', 'VaR models, hedging'],
          ['Credit Risk', 'Counterparty default or downgrade', 'Middle/back office controls, CVA'],
          ['Liquidity Risk', 'Asset illiquidity causing payment inability', 'Smart Order Routing, liquidity buffers'],
          ['Operational Risk', 'Internal error, system failure, fraud', 'Compliance monitoring, dual controls'],
          ['Settlement Risk', 'Settlement failure / failed trades', 'DVP, STP, JSCC novation'],
          ['Reputational Risk', 'Reputation damage causing business losses', 'Compliance, incident management'],
        ]
      },
      keyPoints: [
        { color: 'yellow', text: 'Settlement risk is distinct from credit risk: even if a counterparty is creditworthy, a technical failure (system outage, incorrect instruction) can cause settlement to fail — triggering cascading fails across the market.' },
      ],
      wikiSource: ['wiki/infrastructure/Securities Firm Systems.md', 'wiki/infrastructure/DVP and STP Settlement.md']
    },
    {
      num: '05',
      title: 'Historical Failures — J-COM and Flash Crash',
      body: 'Two landmark incidents that defined modern securities system design, operational risk controls, and regulatory response.',
      table: {
        headers: ['Incident', 'Date', 'What happened', 'Loss / Outcome'],
        rows: [
          ['J-COM Misorder', 'Dec 2005', 'Mizuho Securities input "1 yen × 610,000 shares sell" instead of "¥610,000 × 1 share sell"', '¥40B loss; Supreme Court ordered TSE to pay ¥10.7B (2015)'],
          ['Flash Crash', 'May 2010', 'Algorithmic trading runaway; Dow dropped 1,000 points in minutes; 19B shares traded abnormally', 'Circuit breakers mandated globally; algo oversight tightened'],
        ]
      },
      keyPoints: [
        { color: 'red',    text: 'J-COM lesson: the TSE\'s cancellation system had a bug that prevented the order from being cancelled after execution started. Both human error AND system failure contributed.' },
        { color: 'yellow', text: 'SE lesson from J-COM: confirmation dialogs must default-focus Cancel (not Confirm). One accidental Enter key on the wrong dialog sent 610,000 shares instead of 1.' },
        { color: 'blue',   text: 'Flash Crash lesson: a single large sell order by a mutual fund triggered a cascade of algo stop-losses that amplified the move. Circuit breakers (automatic trading halts) were introduced to prevent runaway feedback loops.' },
      ],
      wikiSource: ['wiki/infrastructure/Securities Firm Systems.md', 'wiki/infrastructure/Tokyo Stock Exchange arrowhead.md']
    },
  ],

  questions: [
    {cat:"Systems Architecture",
     q:"How many primary systems does a securities firm's IT infrastructure comprise, and what underpins them all?",
     opts:["3 systems — front, middle, and back office","6 systems, all dependent on Master Data (⑤) and External Connectivity (⑥)","4 systems — trading, settlement, risk, and compliance","8 systems including separate DR and compliance systems"],ans:1,
     exp:"A securities firm has <strong>6 primary systems</strong>: ① Retail Ops ② Order & Execution ③ Reconciliation & Settlement ④ Enterprise Management ⑤ Master Data ⑥ External Connectivity. All systems depend on ⑤ Master Data (single source of truth) and ⑥ External Connectivity (exchange/clearing pipes)."},
    {cat:"Front vs. Back",
     q:"Why do back-office systems at securities firms still predominantly use mainframes?",
     opts:["Regulatory requirement mandates legacy technology","Mainframes offer unmatched reliability and batch processing throughput for settlement — intentional, not legacy debt","The cost of migration is too high","Front-office systems also use mainframes for consistency"],ans:1,
     exp:"<strong>Back-office mainframes are intentional</strong>: they provide unmatched reliability, throughput, and auditability for settlement batch processing. NRI STAR series and Broadridge Gloss dominate. 'If it ain\'t broke, don\'t fix it' — stability trumps modernity in settlement."},
    {cat:"Settlement",
     q:"What does DVP (Delivery versus Payment) eliminate and how?",
     opts:["It eliminates counterparty credit risk by requiring credit checks","It eliminates settlement risk by making securities delivery and cash payment simultaneous and atomic","It eliminates operational risk by automating all settlement instructions","It eliminates market risk by fixing exchange rates at trade time"],ans:1,
     exp:"<strong>DVP (Delivery versus Payment)</strong> makes securities delivery and cash payment <em>atomic</em> — they happen simultaneously or not at all. This eliminates principal risk: you can never deliver securities without simultaneously receiving payment."},
    {cat:"Settlement",
     q:"What is STP (Straight-Through Processing) in a securities context?",
     opts:["A technology for real-time stock price streaming","Automated end-to-end trade lifecycle processing from execution to settlement with zero manual intervention","A risk management protocol for cross-border trades","A settlement timing standard (T+2)"],ans:1,
     exp:"<strong>STP (Straight-Through Processing)</strong>: automated processing from trade execution through to settlement without any manual touchpoints. Every manual step = a potential error, delay, or fraud vector. Full STP means the entire trade lifecycle runs without human intervention."},
    {cat:"Settlement",
     q:"What role does JSCC (Japan Securities Clearing Corporation) play in the settlement process?",
     opts:["Holds securities in book-entry form on behalf of participants","Acts as central counterparty via novation — becomes buyer to every seller and seller to every buyer","Connects exchanges to broker-dealers via FIX protocol","Manages the master data for all listed securities"],ans:1,
     exp:"<strong>JSCC</strong> is the central counterparty clearing house. Through <strong>novation</strong>, it inserts itself as the buyer to every seller and seller to every buyer — so participants face JSCC's credit risk, not each other's. This dramatically reduces bilateral credit exposure."},
    {cat:"Risk",
     q:"What is Settlement Risk and how does it differ from Credit Risk?",
     opts:["They are the same risk — both relate to counterparty default","Settlement Risk is the risk that settlement fails due to technical/operational failure, even if both parties are creditworthy","Settlement Risk is only present in bond markets, not equities","Settlement Risk means a counterparty can't pay due to insolvency"],ans:1,
     exp:"<strong>Settlement Risk</strong> is distinct: even a creditworthy counterparty can fail to settle due to system outages, incorrect instructions, or processing errors. A failed settlement can trigger cascading failures across the market. DVP and STP address this. Credit Risk addresses default."},
    {cat:"J-COM Incident",
     q:"What were the two contributing factors to the J-COM misorder incident (2005)?",
     opts:["Regulatory gap and market manipulation","Human input error AND a TSE system bug that prevented cancellation after execution began","Server outage and network failure at Mizuho Securities","Algorithmic trading runaway and insufficient circuit breakers"],ans:1,
     exp:"<strong>J-COM (2005)</strong>: Mizuho input '1 yen × 610,000 shares' instead of '¥610,000 × 1 share'. Two failures: ① human entry error and ② TSE cancellation system bug that allowed execution despite cancellation requests. ¥40B loss; Supreme Court ordered TSE to pay ¥10.7B compensation."},
    {cat:"Flash Crash",
     q:"What was the primary lesson from the Flash Crash (2010) for algorithmic trading regulation?",
     opts:["All algorithmic trading should be banned in equities markets","Algorithms must be circuit-breaker equipped; automatic trading halts needed to prevent runaway algo feedback loops","Exchanges must increase tick size to slow down HFT","Human approval required for orders above 1,000 shares"],ans:1,
     exp:"<strong>Flash Crash (May 2010)</strong>: one large mutual fund sell order triggered a cascade of algo stop-losses, dropping the Dow 1,000 points in minutes. Lesson: algo feedback loops can amplify moves catastrophically. <strong>Circuit breakers</strong> (automatic trading halts at threshold moves) were mandated globally."},
    {cat:"ArrowHead",
     q:"What performance improvement did TSE ArrowHead (2010) deliver for order entry?",
     opts:["10 seconds → 1 second (10× faster)","3 seconds → 10 milliseconds (300× faster)","1 second → 100 microseconds (10,000× faster)","500ms → 1ms (500× faster)"],ans:1,
     exp:"<strong>TSE ArrowHead</strong> (2010): order entry improved from 3 seconds to <strong>10 milliseconds — a 300× improvement</strong>. Quote distribution grew from 600 to 8,200 ticks/second (~13.5×). This made co-location essential and transformed the competitive landscape for HFT."},
    {cat:"Systems Architecture",
     q:"Which back-office vendor is associated with Accenture in the Japan securities post-trade market?",
     opts:["Broadridge Gloss","NRI STAR","Accenture APTP (Accenture Post-Trade Processing)","Oracle Fusion Finance"],ans:2,
     exp:"<strong>Accenture APTP (Accenture Post-Trade Processing)</strong> is a prominent back-office settlement system in the Japan securities market, alongside NRI STAR and Broadridge Gloss. Relevant context for Accenture Financial Services engagements."},
    {cat:"Settlement",
     q:"What does JASDEC do in the Japanese securities settlement ecosystem?",
     opts:["Clears and novates equity trades as central counterparty","Acts as central securities depository — holds securities in book-entry form and runs settlement","Manages market surveillance and regulatory reporting","Operates the TSE matching engine"],ans:1,
     exp:"<strong>JASDEC (Japan Securities Depository Center)</strong> is Japan's central securities depository (CSD). It holds all listed securities in book-entry (dematerialized) form on behalf of participants, and runs the actual securities settlement process. JSCC = clearing; JASDEC = custody & settlement."},
    {cat:"Risk",
     q:"In the 6-risk classification for securities firms, which system primarily addresses Operational Risk?",
     opts:["② Order & Execution — automated algo controls","Compliance monitoring and ④ Enterprise Management — audit trails, dual controls, incident response","③ Reconciliation & Settlement — failed trade detection","⑥ External Connectivity — FIX protocol validation"],ans:1,
     exp:"<strong>Operational Risk</strong> (internal errors, system failures, fraud) is primarily managed through <strong>compliance monitoring</strong> and controls embedded in ④ Enterprise Management — including audit trails, dual-person controls, and incident response procedures."},
  ]
},

/* ══════════════════════════════════════════════════════════════
   TOPIC 6 — Financial Quant, Risk & Macro
   Source wiki: wiki/concepts/Financial Quant Risk Management.md
══════════════════════════════════════════════════════════════ */
{
  id: 'fin-quant',
  title: 'Financial Quant, Risk & Macro',
  icon: '🧮',
  color: '#f59e0b',
  description: 'Three-office structure, VaR, Black-Scholes Greeks, CVA/XVA, and the 2022–2026 macro cycle',
  slideCount: 5,
  wikiPages: [
    'wiki/concepts/Financial Quant Risk Management.md',
    'wiki/concepts/Derivatives.md',
    'wiki/concepts/Capital Markets.md',
    'wiki/concepts/Value at Risk.md',
    'raw/notes/fin-quant-risk-ja.md',
  ],

  slides: [
    {
      num: '01',
      title: 'The Three-Office Model',
      body: 'Financial institutions divide into three coordinated offices. <strong>Front Office</strong> (traders) generates revenue by taking market positions. <strong>Middle Office</strong> (quants) measures and controls risk using mathematical models. <strong>Back Office</strong> reconciles trades, confirms settlement, and signs off on daily P&L.',
      formula: null,
      table: {
        headers: ['Office', 'Role', 'Key Output'],
        rows: [
          ['Front', 'Trade & generate revenue', 'Open positions, raw trade data'],
          ['Middle', 'Risk quantification & control', 'VaR, CVA, backtesting'],
          ['Back', 'Settlement & reconciliation', 'Confirmed Mark-to-Market P&L'],
        ]
      },
      riskMap: false,
      keyPoints: [
        { color: 'blue', text: 'Quants live in the Middle Office — they build the models that price risk' },
        { color: 'yellow', text: 'Backtesting = comparing yesterday\'s VaR forecast vs today\'s actual P&L' },
      ],
      calc: null,
      wikiSource: ['wiki/concepts/Financial Quant Risk Management.md'],
    },
    {
      num: '02',
      title: 'Positions & Mark-to-Market P&L',
      body: '<strong>Long (+)</strong>: bought an asset — profits if price rises, maximum loss is the amount invested. <strong>Short (−)</strong>: borrowed and sold an asset — profits if price falls, but loss is theoretically <strong>unlimited</strong> if price rises. The short seller must also compensate the lender for any dividends or interest paid during the hold. <strong>Mark-to-Market (MTM) P&L</strong> is the unrealised gain/loss valued at today\'s market price — a large negative MTM triggers a <strong>margin call</strong>.',
      formula: null,
      table: null,
      riskMap: false,
      keyPoints: [
        { color: 'red', text: 'Short position: unlimited downside — price rises are uncapped losses' },
        { color: 'green', text: 'MTM P&L = unrealised; Realised P&L = locked in on close/settlement' },
      ],
      calc: null,
      wikiSource: ['wiki/concepts/Financial Quant Risk Management.md'],
    },
    {
      num: '03',
      title: 'VaR, Volatility Models & Bond Math',
      body: '<strong>Value at Risk (VaR)</strong> answers: "At 99% confidence, what is the worst daily loss?" Formula: <code>VaR = z × σ × V × √t</code>. <strong>Implied Volatility (IV)</strong> is back-solved from option market prices — the market\'s forecast of future uncertainty. <strong>GARCH</strong> captures volatility clustering: rough days tend to cluster. <strong>Convexity</strong> is the second-order correction to bond duration — it accounts for the curvature of the price-yield curve when rates move sharply.',
      formula: 'VaR = z × σ × V × √t',
      table: {
        headers: ['Model', 'Captures'],
        rows: [
          ['Historical Vol (HV)', 'Past price dispersion via EWMA'],
          ['Implied Vol (IV)', 'Market\'s forward uncertainty (from options)'],
          ['GARCH', 'Volatility clustering — rough periods persist'],
          ['Convexity', 'Bond price curvature beyond linear duration'],
        ]
      },
      riskMap: false,
      keyPoints: [
        { color: 'blue', text: 'IV is forward-looking; HV is backward-looking' },
        { color: 'yellow', text: 'Higher convexity = better price behaviour for bond investors when rates move' },
      ],
      calc: 'var',
      wikiSource: ['wiki/concepts/Financial Quant Risk Management.md', 'wiki/concepts/Value at Risk.md'],
    },
    {
      num: '04',
      title: 'Black-Scholes & CVA',
      body: 'The <strong>Black-Scholes equation</strong> prices European options: <code>C = S·N(d₁) − K·e^(−rT)·N(d₂)</code>. Risk sensitivities (Greeks): <strong>Delta (Δ)</strong> = price sensitivity per £1 move; <strong>Gamma (Γ)</strong> = rate of change of delta; <strong>Vega (ν)</strong> = sensitivity to implied volatility changes. <strong>CVA</strong> (Credit Valuation Adjustment) subtracts the present value of expected counterparty default losses: <code>CVA = (1−R) × ∫EE(t)·dPD(t)</code>, where EE = Expected Exposure and PD = default probability from CDS spreads.',
      formula: 'CVA = (1 − R) × ∫₀ᵀ EE(t) · dPD(t)',
      table: {
        headers: ['Greek', 'Measures'],
        rows: [
          ['Delta (Δ)', '£1 move in underlying → option price change'],
          ['Gamma (Γ)', 'Rate of change of Delta (acceleration)'],
          ['Vega (ν)', 'IV change → option price change'],
          ['Theta (Θ)', 'Daily time decay'],
        ]
      },
      riskMap: false,
      keyPoints: [
        { color: 'red', text: 'CVA was mandated post-Lehman — counterparty default risk must be priced in' },
        { color: 'blue', text: 'CDS spread = annualised default insurance premium (in basis points)' },
      ],
      calc: null,
      wikiSource: ['wiki/concepts/Financial Quant Risk Management.md', 'wiki/concepts/Derivatives.md'],
    },
    {
      num: '05',
      title: 'Macro Cycle 2022–2026',
      body: 'The Fed\'s aggressive hiking (2022–2023) drove bond prices sharply lower — exposing banks like <strong>SVB</strong> that held large long-duration bond portfolios to catastrophic MTM losses. Japan\'s <strong>YCC</strong> (Yield Curve Control) kept its 10-year rate near 0% while the US hit 5.25%, widening the rate differential to 525 bps and driving USD/JPY to ~160. The <strong>inverted yield curve</strong> (short rates > long rates) is a classic recession signal. By 2026, BOJ rate hikes and Fed cuts narrowed the spread to ~2.5%, pulling the yen back toward 135.',
      formula: 'E[Δe] ≈ i_US − i_JP  (Interest Rate Parity)',
      table: {
        headers: ['Year', 'US Rate', 'JP Rate', 'Spread', 'USD/JPY'],
        rows: [
          ['2022', '1.5%', '0.0%', '1.5%', '130'],
          ['2023', '5.0%', '0.0%', '5.0%', '145'],
          ['2024', '5.25%', '0.1%', '5.15%', '155'],
          ['2025', '4.0%', '0.5%', '3.5%', '140'],
          ['2026', '3.5%', '1.0%', '2.5%', '135'],
        ]
      },
      riskMap: false,
      keyPoints: [
        { color: 'yellow', text: 'SVB failed because rising rates destroyed the MTM value of its bond portfolio' },
        { color: 'green', text: 'Inverted yield curve = short rates > long rates → historically precedes recession' },
      ],
      calc: null,
      wikiSource: ['wiki/concepts/Financial Quant Risk Management.md'],
    },
  ],

  questions: [
    {cat:"Structure",
     q:"Which office compares yesterday's VaR forecast against today's actual realised P&L to validate the risk model?",
     opts:["Front Office — traders","Middle Office — quants","Back Office — settlement","Compliance"],ans:1,
     exp:"<strong>Backtesting</strong> is a Middle Office quant function. Quants build the VaR model and are responsible for checking whether the forecast loss bounds held in reality."},
    {cat:"Structure",
     q:"A short seller holds a borrowed position and the stock pays a dividend. What happens?",
     opts:["The short seller receives the dividend","The dividend is cancelled","The short seller must pay the dividend to the stock lender","No adjustment — dividends don't affect short positions"],ans:2,
     exp:"Short selling means you borrowed someone else's shares. The original owner retains the right to dividends — so the short seller must <strong>compensate the lender</strong> out of pocket, adding to the cost of maintaining the position."},
    {cat:"Risk Math",
     q:"Implied Volatility (IV) vs Historical Volatility (HV) — which one is forward-looking?",
     opts:["Historical Volatility","Implied Volatility","GARCH","EWMA"],ans:1,
     exp:"<strong>Implied Volatility</strong> is back-calculated from current option market prices. Because options are priced by what investors expect to happen, IV reflects the market's consensus forecast of <em>future</em> uncertainty — not past data."},
    {cat:"Risk Math",
     q:"Which model captures volatility clustering — the empirical tendency for rough markets to stay rough?",
     opts:["Black-Scholes","CAPM","GARCH","Duration"],ans:2,
     exp:"<strong>GARCH</strong> (Generalised Autoregressive Conditional Heteroskedasticity) explicitly models the fact that large shocks tend to be followed by more large shocks. The variance equation includes both last period's shock and last period's variance."},
    {cat:"Bond Math",
     q:"What does Convexity correct for in bond pricing that Modified Duration cannot?",
     opts:["Credit risk","The curvature of the price-yield relationship for large rate moves","Daily time decay","Dividend payments"],ans:1,
     exp:"<strong>Duration</strong> is a linear (first-order) approximation. For large yield changes, the actual price-yield curve is curved (convex), not straight. <strong>Convexity</strong> is the second-order Taylor expansion term that corrects for this curvature."},
    {cat:"Derivatives",
     q:"Delta hedging a portfolio means keeping Delta near zero. What Greek measures how quickly Delta itself changes?",
     opts:["Vega","Theta","Gamma","Rho"],ans:2,
     exp:"<strong>Gamma (Γ)</strong> is the second derivative of option price with respect to the underlying — i.e. the rate of change of Delta. A high-Gamma position requires frequent rehedging because Delta shifts rapidly as the underlying moves."},
    {cat:"XVA",
     q:"In the CVA formula CVA = (1−R) × ∫EE(t)·dPD(t), what does EE stand for and where does PD come from?",
     opts:["EE = Economic Exposure; PD from equity markets","EE = Expected Exposure (amount at risk if counterparty defaults); PD from CDS spreads","EE = Excess Equity; PD from credit ratings","EE = Earned Equity; PD from bond yields"],ans:1,
     exp:"<strong>EE (Expected Exposure)</strong> is the expected positive value of the trade at a future date — how much you'd lose if the counterparty defaulted while you're in the money (calculated via Monte Carlo). <strong>PD</strong> is the default probability, derived from observed <strong>CDS spreads</strong> in the market."},
    {cat:"Macro",
     q:"Why did SVB (Silicon Valley Bank) collapse in March 2023?",
     opts:["It had excessive exposure to crypto assets","The Fed's rate hikes caused the MTM value of its large treasury/bond holdings to collapse, creating a bank run","It was fined for money laundering violations","It lost on speculative FX positions"],ans:1,
     exp:"SVB was long duration — it held a large portfolio of long-term treasuries and MBS. When the Fed hiked rates aggressively, <strong>bond prices fell sharply</strong>, creating massive unrealised (MTM) losses. When depositors learned of these losses, a bank run ensued."},
    {cat:"Macro",
     q:"What is an Inverted Yield Curve and why is it watched as a recession signal?",
     opts:["Short-term rates fall below long-term rates — indicates economic expansion","Short-term rates exceed long-term rates — historically precedes recessions by 6–24 months","The yield curve flattens perfectly — neutral signal","Long-term rates spike above 10% — indicates hyperinflation"],ans:1,
     exp:"An <strong>inverted yield curve</strong> (short > long rates) occurs when central banks hike short-term rates aggressively (e.g. to fight inflation). Markets interpret this as policy overtightening that will eventually cause a slowdown — making it a reliable leading recession indicator."},
    {cat:"Macro",
     q:"Japan's YCC (Yield Curve Control) pegged the 10-year JGB near 0% while US rates reached 5.25%. What exchange-rate consequence followed?",
     opts:["The yen strengthened dramatically against the dollar","USD/JPY pushed toward 160 as carry traders borrowed yen to buy US assets","The Japanese yen was officially pegged to the dollar","Japan raised rates faster than the US, causing yen appreciation"],ans:1,
     exp:"<strong>Interest rate parity</strong> (E[Δe] ≈ i_US − i_JP) predicts that a large rate differential drives the lower-rate currency weaker. With a ~525 bps spread, carry traders borrowed in cheap yen and invested in US assets, driving USD/JPY to historic highs near 160."},
    {cat:"History",
     q:"The world's first derivatives exchange (Dojima Rice Exchange, Osaka 1730) pioneered a settlement method still used in modern futures. What was it?",
     opts:["Physical delivery only","Cash settlement (差金決済) — only the price difference changes hands","Government-guaranteed settlement","Bilateral OTC settlement"],ans:1,
     exp:"<strong>Cash settlement</strong> (差金決済) means only the monetary difference between the agreed price and the market price is exchanged — no physical rice needed to move. This innovation eliminated costly logistics and is the foundation of modern derivatives settlement."},
  ]
},

/* ══════════════════════════════════════════════════════════════
   TEMPLATES — Copy these to add new topics / questions
══════════════════════════════════════════════════════════════ */

// ── TOPIC_TEMPLATE ──────────────────────────────────────────
/*
{
  id: 'my-topic',
  title: 'Topic Title',
  icon: '📘',
  color: '#a78bfa',
  description: 'One-line description shown on the home card.',
  slideCount: 5,
  wikiPages: [
    'wiki/concepts/My Concept.md',
    'wiki/entities/My Entity.md',
  ],
  slides: [
    {
      num: '01',
      title: 'Slide Title',
      body: 'Explanation. Use <strong>bold</strong> for key terms.',
      formula: null,
      table: null,
      riskMap: false,
      keyPoints: [
        { color: 'blue', text: 'Key insight' }
      ],
      calc: null,
      wikiSource: ['wiki/concepts/My Concept.md'],
    },
  ],
  questions: [
    {
      cat: 'Category',
      q: 'Question?',
      hint: 'Optional hint',
      opts: ['A','B','C','D'],
      ans: 0,
      exp: 'Explanation with <strong>key term</strong> highlighted.',
    },
  ]
},
*/

]; // end window.TOPICS
