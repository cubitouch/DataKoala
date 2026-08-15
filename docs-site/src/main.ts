import './styles.css'

const repo = 'https://github.com/cubitouch/DataKoala'
const shot = (name: string, alt: string) => `<a class="shot" href="./screenshots/${name}.png"><img src="./screenshots/${name}.png" alt="${alt}" loading="lazy"></a>`

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header><nav><a class="brand" href="./">DataKoala</a><div><a href="#start">Get started</a><a class="button" href="${repo}">View source</a></div></nav></header>
  <main>
    <section class="hero"><p class="eyebrow">LOCAL-FIRST DATA EXPLORATION</p><h1>Move from data to insight,<br><em>without leaving your desktop.</em></h1><p class="lede">Query databases and local files with SQL or a visual Builder, explore Prometheus metrics, and turn results into clear charts.</p>${shot('docs-overview', 'DataKoala SQL workspace with an analytics schema and market activity chart')}</section>
    <section class="feature"><div><p class="eyebrow">SQL WORKSPACE</p><h2>Explore with SQL</h2><p>Write highlighted SQL beside searchable metadata, then inspect, filter, and visualize the result in the same workspace.</p></div>${shot('docs-sql', 'SQL query and filtered market activity results table')}</section>
    <section class="feature reverse"><div><p class="eyebrow">VISUAL BUILDER</p><h2>Build queries visually</h2><p>Select relations, time buckets, dimensions, aggregations, and filters while DataKoala creates transparent, reusable queries.</p></div>${shot('docs-builder', 'Visual query Builder configured for monthly market activity')}</section>
    <section class="feature"><div><p class="eyebrow">PROMETHEUS</p><h2>Understand service metrics</h2><p>Browse metrics and compose PromQL from filters, grouping, calculations, and time controls—without depending on a live service for this tour.</p></div>${shot('docs-prometheus', 'PromQL Builder showing a request-duration percentile query')}</section>
    <section class="feature reverse"><div><p class="eyebrow">VISUALIZATION</p><h2>Make results readable</h2><p>Switch between tables and charts, choose axes and series, apply result filters, and export the view you need.</p></div>${shot('docs-visualization', 'Multi-series line chart of synthetic monthly market activity')}</section>
    <section class="feature"><div><p class="eyebrow">DATA SOURCES</p><h2>One workspace, varied sources</h2><p>Connect PostgreSQL, BigQuery, read-only SQLite, local CSV/TSV/Parquet/JSON files, and Prometheus. Your data remains on your machine and source services.</p></div>${shot('docs-data-sources', 'DataKoala workspace populated with synthetic data-source profiles')}</section>
    <section class="start" id="start"><p class="eyebrow">EARLY BETA</p><h2>Try DataKoala locally</h2><p>DataKoala is evolving. It requires Node 22+, pnpm, and Git.</p><pre><code>git clone https://github.com/cubitouch/DataKoala.git
cd DataKoala
corepack enable
pnpm install --frozen-lockfile
pnpm dev</code></pre><p>Found a rough edge? <a href="${repo}/issues">Share feedback in GitHub Issues</a>.</p></section>
  </main>
  <footer><span>DataKoala · AGPL-3.0-or-later</span><span><a href="${repo}">Source</a><a href="${repo}/blob/main/LICENSE">License</a><a href="${repo}">Repository</a></span></footer>`
