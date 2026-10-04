import './styles.css'

const repo = 'https://github.com/cubitouch/DataKoala'
const appIcon =
  'https://raw.githubusercontent.com/cubitouch/DataKoala/main/build/icon.png'
const githubIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-3.059.664-3.705-1.295-3.705-1.295-.5-1.269-1.219-1.606-1.219-1.606-.998-.682.075-.668.075-.668 1.102.078 1.683 1.132 1.683 1.132.98 1.679 2.572 1.194 3.199.913.098-.71.383-1.194.698-1.469-2.442-.278-5.01-1.221-5.01-5.436 0-1.2.428-2.182 1.13-2.952-.114-.278-.49-1.397.107-2.91 0 0 .92-.295 3.013 1.128A10.5 10.5 0 0 1 12 6.821c.935.004 1.876.126 2.755.37 2.091-1.423 3.01-1.128 3.01-1.128.598 1.513.222 2.632.109 2.91.703.77 1.129 1.752 1.129 2.952 0 4.225-2.572 5.155-5.022 5.427.394.34.746 1.01.746 2.037 0 1.47-.013 2.653-.013 3.014 0 .292.2.623.762.518C19.855 20.974 23 16.865 23 12c0-6.077-4.923-11-11-11Z"/></svg>`

const shot = (name: string, alt: string) =>
  `<a class="shot" href="./screenshots/${name}.png">
    <span class="window-bar" aria-hidden="true">
      <i></i><i></i><i></i><span>DataKoala</span>
    </span>
    <img src="./screenshots/${name}.png" alt="${alt}" loading="lazy">
  </a>`

const bentoShot = (name: string, alt: string) =>
  `<a class="bento-media" href="./screenshots/${name}.png">
    <img src="./screenshots/${name}.png" alt="${alt}" loading="lazy">
  </a>`

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="site-header">
    <nav>
      <a class="brand" href="./">
        <span class="brand-mark"><img src="${appIcon}" alt="" aria-hidden="true"></span>
        <span>DataKoala</span>
      </a>
      <div class="nav-links" aria-label="Primary navigation">
        <a href="#workspace">Product</a>
        <a href="#why">Why DataKoala</a>
      </div>
      <div class="nav-actions">
        <a class="button button-ghost" href="${repo}">
          <span class="github-mark" aria-hidden="true">${githubIcon}</span>
          <span class="nav-source-label">GitHub</span>
        </a>
        <a class="button button-primary" href="#start">Try DataKoala</a>
      </div>
    </nav>
  </header>

  <main>
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow hero-kicker"><span class="eyebrow-dot"></span>OPEN SOURCE · LOCAL-FIRST · DESKTOP</p>
        <h1>Explore data <em>without leaving your desktop.</em></h1>
        <p class="lede">Query databases, metrics, logs, and traces from one focused workspace. Start visually, then drop into SQL, PromQL, LogQL, or TraceQL whenever you want full control.</p>
        <div class="hero-actions">
          <a class="button button-primary button-large" href="#start">Try DataKoala <span aria-hidden="true">→</span></a>
          <a class="button button-secondary button-large" href="${repo}">
            <span class="github-mark" aria-hidden="true">${githubIcon}</span>
            <span>View on GitHub</span>
          </a>
        </div>
        <div class="hero-proof" aria-label="DataKoala product principles">
          <span><i aria-hidden="true"></i>Read-only by default</span>
          <span><i aria-hidden="true"></i>Data stays at the source</span>
          <span><i aria-hidden="true"></i>Transparent queries</span>
        </div>
      </div>

      <div class="hero-product">
        <div class="hero-product-glow" aria-hidden="true"></div>
        <a class="product-window" href="./screenshots/docs-overview.png">
          <span class="product-window-bar" aria-hidden="true">
            <span class="traffic-lights"><i></i><i></i><i></i></span>
            <span class="product-window-title">DataKoala · PostgreSQL</span>
            <span class="product-window-status">LOCAL</span>
          </span>
          <img src="./screenshots/docs-overview.png" alt="DataKoala visual Builder configured for monthly market activity with a connected PostgreSQL source and five-series chart">
        </a>
      </div>
    </section>

    <section class="source-strip" aria-label="Supported data sources">
      <p>ONE WORKSPACE FOR YOUR DATA + OBSERVABILITY STACK</p>
      <div class="source-list">
        <span>PostgreSQL</span>
        <span>BigQuery</span>
        <span>SQLite</span>
        <span>CSV / Parquet / JSON</span>
        <span>Prometheus</span>
        <span>Grafana Loki</span>
        <span>Grafana Tempo</span>
      </div>
    </section>

    <section class="workspace" id="workspace">
      <div class="section-heading">
        <p class="eyebrow">ONE WORKSPACE</p>
        <h2>Follow the question,<br>not the tool.</h2>
        <p>Explore structured data and production signals without rebuilding your context every time the investigation moves to another source.</p>
      </div>

      <div class="bento-grid">
        <article class="bento-card bento-card-sql">
          <div class="bento-copy">
            <span class="card-index">01</span>
            <p class="card-kicker">SQL + VISUAL BUILDER</p>
            <h3>Start where you are comfortable.</h3>
            <p>Browse metadata, build queries visually, or write SQL directly. The query stays visible and reusable either way.</p>
          </div>
          ${bentoShot('docs-sql', 'SQL query beside searchable metadata and filtered market activity results')}
        </article>

        <article class="bento-card bento-card-logs">
          <div class="bento-copy">
            <span class="card-index">02</span>
            <p class="card-kicker">LOKI</p>
            <h3>Turn noisy logs into a line of inquiry.</h3>
            <p>Search, filter, inspect structured fields, and keep the event context beside the result.</p>
          </div>
          ${bentoShot('loki-log-list', 'Loki production checkout log list with filters and a selected error event inspector')}
        </article>

        <article class="bento-card bento-card-metrics">
          <div class="bento-copy">
            <span class="card-index">03</span>
            <p class="card-kicker">PROMETHEUS</p>
            <h3>Understand the shape of a problem.</h3>
            <p>Compose PromQL from metadata, grouping, calculations, and time controls, then move straight into the result.</p>
          </div>
          ${bentoShot('docs-prometheus', 'PromQL Builder showing a request-duration percentile query')}
        </article>

        <article class="bento-card bento-card-traces">
          <div class="bento-copy">
            <span class="card-index">04</span>
            <p class="card-kicker">TEMPO</p>
            <h3>Follow the request to the root cause.</h3>
            <p>Search traces, compare latency and status, then inspect the full waterfall without leaving the workspace.</p>
          </div>
          ${bentoShot('tempo-waterfall', 'Tempo trace waterfall showing checkout spans, timing, status, filters, and a selected payment span')}
        </article>
      </div>
    </section>

    <section class="deep-dives">
      <div class="section-heading section-heading-compact">
        <p class="eyebrow">GO DEEPER</p>
        <h2>Keep context as the investigation narrows.</h2>
      </div>

      <div class="feature">
        <div class="feature-copy">
          <p class="eyebrow">LOG PATTERNS</p>
          <h3>See recurring messages, not a wall of text.</h3>
          <p>Group loaded Loki logs into explainable templates, compare frequency and severity, inspect representative values, and drill back into matching events.</p>
        </div>
        ${shot('loki-log-patterns', 'Loki log patterns with an expanded cluster, examples, and variable values')}
      </div>

      <div class="feature reverse">
        <div class="feature-copy">
          <p class="eyebrow">LOG VOLUME</p>
          <h3>Move from a spike to the events behind it.</h3>
          <p>Break down log volume by a discovered label and drag across an interesting window to rerun the same investigation over a narrower range.</p>
        </div>
        ${shot('loki-log-chart', 'Loki log-volume chart showing a production incident spike and service breakdown')}
      </div>

      <div class="feature">
        <div class="feature-copy">
          <p class="eyebrow">TEMPO SERVICE MAP</p>
          <h3>Find bottlenecks across a trace cohort.</h3>
          <p>Turn Tempo search results into a service map, compare synchronous and async branches, group dense graphs by namespace, and inspect ranked bottleneck candidates.</p>
        </div>
        ${shot('tempo-service-map', 'Tempo synthetic cohort service map and bottlenecks')}
      </div>

      <div class="feature reverse">
        <div class="feature-copy">
          <p class="eyebrow">RESULT EXPLORER</p>
          <h3>Make the answer readable.</h3>
          <p>Move from tables to lines, bars, scatter plots, treemaps, and hierarchy views without exporting your result into another tool first.</p>
        </div>
        ${shot('docs-visualization', 'Sunburst visualization of synthetic payments grouped by currency and country')}
      </div>
    </section>

    <section class="principles" id="why">
      <div class="section-heading">
        <p class="eyebrow">BUILT FOR THE INVESTIGATOR</p>
        <h2>Your tools should help you think,<br>not hide what they did.</h2>
      </div>
      <div class="principle-grid">
        <article>
          <span class="principle-number">01</span>
          <h3>Local-first</h3>
          <p>Your data remains on your machine and source services. DataKoala connects to the systems you already use instead of becoming another place to copy data into.</p>
        </article>
        <article>
          <span class="principle-number">02</span>
          <h3>Transparent</h3>
          <p>Visual builders produce queries you can inspect and reuse. Drop into raw query mode whenever you need more control.</p>
        </article>
        <article>
          <span class="principle-number">03</span>
          <h3>Open source</h3>
          <p>DataKoala is licensed AGPL-3.0-or-later. Inspect the implementation, follow the roadmap, and report the rough edges in public.</p>
        </article>
      </div>
    </section>

    <section class="start" id="start">
      <div class="start-copy">
        <p class="eyebrow">EARLY BETA</p>
        <h2>Take it for a spin.</h2>
        <p>DataKoala currently runs from source and requires Node 24, pnpm, and Git. PostgreSQL, SQLite, and local files need no additional authentication tooling.</p>
        <div class="start-links">
          <a href="${repo}#getting-started">Full setup guide <span aria-hidden="true">→</span></a>
          <a href="${repo}/issues">Share feedback <span aria-hidden="true">→</span></a>
        </div>
      </div>
      <div class="terminal" aria-label="DataKoala installation commands">
        <div class="terminal-bar" aria-hidden="true"><span></span><span></span><span></span><strong>~/DataKoala</strong></div>
        <pre><code><span class="prompt">$</span> git clone https://github.com/cubitouch/DataKoala.git
<span class="prompt">$</span> cd DataKoala
<span class="prompt">$</span> corepack enable
<span class="prompt">$</span> pnpm install --frozen-lockfile
<span class="prompt">$</span> pnpm dev</code></pre>
      </div>
    </section>
  </main>

  <footer>
    <a class="brand footer-brand" href="./">
      <span class="brand-mark"><img src="${appIcon}" alt="" aria-hidden="true"></span>
      <span>DataKoala</span>
    </a>
    <p>Local-first data exploration for databases, metrics, logs, and traces.</p>
    <span class="footer-links"><a href="${repo}">Repository</a><a href="${repo}/blob/main/LICENSE">AGPL-3.0-or-later</a></span>
  </footer>
`
