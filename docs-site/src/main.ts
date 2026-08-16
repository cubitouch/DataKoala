import './styles.css'

const repo = 'https://github.com/cubitouch/DataKoala'
const appIcon = 'https://raw.githubusercontent.com/cubitouch/DataKoala/main/build/icon.png'
const githubIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1C5.923 1 1 5.923 1 12c0 4.867 3.149 8.979 7.521 10.436.55.096.756-.233.756-.522 0-.262-.013-1.128-.013-2.049-3.059.664-3.705-1.295-3.705-1.295-.5-1.269-1.219-1.606-1.219-1.606-.998-.682.075-.668.075-.668 1.102.078 1.683 1.132 1.683 1.132.98 1.679 2.572 1.194 3.199.913.098-.71.383-1.194.698-1.469-2.442-.278-5.01-1.221-5.01-5.436 0-1.2.428-2.182 1.13-2.952-.114-.278-.49-1.397.107-2.91 0 0 .92-.295 3.013 1.128A10.5 10.5 0 0 1 12 6.821c.935.004 1.876.126 2.755.37 2.091-1.423 3.01-1.128 3.01-1.128.598 1.513.222 2.632.109 2.91.703.77 1.129 1.752 1.129 2.952 0 4.225-2.572 5.155-5.022 5.427.394.34.746 1.01.746 2.037 0 1.47-.013 2.653-.013 3.014 0 .292.2.623.762.518C19.855 20.974 23 16.865 23 12c0-6.077-4.923-11-11-11Z"/></svg>`
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
