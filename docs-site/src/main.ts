import './styles.css'

const repo = 'https://github.com/cubitouch/DataKoala'
const appIcon = 'https://raw.githubusercontent.com/cubitouch/DataKoala/main/build/icon.png'
const githubIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.3.8-.6v-2.2c-3.4.7-4.1-1.4-4.1-1.4-.5-1.4-1.3-1.8-1.3-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2A11.2 11.2 0 0 1 12 6.5c1 0 2 .1 3 .4 2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.3 2.9.2 3.2.7.8 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.1v3c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7Z"/></svg>`
const shot = (name: string, alt: string) => `<a class="shot" href="./screenshots/${name}.png"><span class="window-bar" aria-hidden="true"><i></i><i></i><i></i></span><img src="./screenshots/${name}.png" alt="${alt}" loading="lazy"></a>`

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><nav><a class="brand" href="./"><img src="${appIcon}" alt="" aria-hidden="true"><span>DataKoala</span></a><div class="nav-actions"><a class="button button-primary" href="#start">Get started</a><a class="button icon-button" href="${repo}" aria-label="View DataKoala on GitHub" title="View source on GitHub">${githubIcon}</a></div></nav></header>
  <main>
    <section class="hero"><p class="eyebrow">LOCAL-FIRST DATA EXPLORATION</p><h1>Move from data to insight,<br><em>without leaving your desktop.</em></h1><p class="lede">Explore connected data visually, move into SQL when you need it, and turn results into clear charts.</p><div class="hero-actions"><a class="button button-primary hero-button" href="#start">Get started</a><a class="button button-secondary hero-button" href="${repo}">${githubIcon}<span>View source</span></a></div>${shot('docs-overview', 'DataKoala visual Builder configured for monthly market activity with a connected PostgreSQL source and five-series chart')}</section>
    <section class="feature"><div><p class="eyebrow">SQL WORKSPACE</p><h2>Explore with SQL</h2><p>Write highlighted SQL beside searchable metadata, then inspect, filter, and visualize the result in the same workspace.</p></div>${shot('docs-sql', 'SQL query and filtered market activity results table')}</section>
    <section class="feature reverse"><div><p class="eyebrow">VISUAL BUILDER</p><h2>Build queries visually</h2><p>Select relations, time buckets, dimensions, aggregations, and filters while DataKoala creates transparent, reusable queries.</p></div>${shot('docs-builder', 'Visual query Builder configured for monthly market activity')}</section>
    <section class="feature"><div><p class="eyebrow">DATA SOURCES</p><h2>One workspace, varied sources</h2><p>Connect PostgreSQL, BigQuery, read-only SQLite, local CSV/TSV/Parquet/JSON files, and Prometheus. Your data remains on your machine and source services.</p></div>${shot('docs-data-sources', 'DataKoala workspace populated with synthetic data-source profiles')}</section>
    <section class="feature reverse"><div><p class="eyebrow">PROMETHEUS</p><h2>Understand service metrics</h2><p>Browse metrics and compose PromQL from filters, grouping, calculations, and time controls—without depending on a live service for this tour.</p></div>${shot('docs-prometheus', 'PromQL Builder showing a request-duration percentile query')}</section>
    <section class="feature"><div><p class="eyebrow">VISUALIZATION</p><h2>Make results readable</h2><p>Move beyond basic lines and bars when the data calls for it. Configure hierarchy levels to compare values across region, country, and channel.</p></div>${shot('docs-visualization', 'Treemap visualization of synthetic sales grouped by region, country, and channel')}</section>
    <section class="start" id="start"><p class="eyebrow">EARLY BETA</p><h2>Try DataKoala locally</h2><p>DataKoala is evolving. It requires Node 22+, pnpm, and Git.</p><pre><code>git clone https://github.com/cubitouch/DataKoala.git
cd DataKoala
corepack enable
pnpm install --frozen-lockfile
pnpm dev</code></pre><div class="optional-setup"><h3>Using Prometheus / Grafana?</h3><p>Optional on macOS: the Prometheus formula provides <code>promtool</code>, which DataKoala uses for PromQL formatting. <code>gcx</code> connects to Grafana and Grafana Cloud-backed Prometheus sources.</p><pre><code>brew install prometheus
brew install grafana/grafana/gcx
promtool --version
gcx --version

gcx login my-stack --server https://&lt;your-stack&gt;.grafana.net</code></pre><p>If <code>promtool</code> is outside your <code>PATH</code>:</p><pre><code>DATAKOALA_PROMTOOL_PATH=/path/to/promtool pnpm dev</code></pre></div><p>Found a rough edge? <a href="${repo}/issues">Share feedback in GitHub Issues</a>.</p></section>
  </main>
  <footer><span>DataKoala · AGPL-3.0-or-later</span><span><a href="${repo}">Repository</a><a href="${repo}/blob/main/LICENSE">License</a></span></footer>`
