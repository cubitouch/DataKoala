import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import { build } from 'vite'

const result = await build({
  configFile: false,
  logLevel: 'silent',
  resolve: {
    alias: { '@shared': resolve('src/shared') },
  },
  build: {
    ssr: 'src/renderer/src/lib/chartAnomalySampling.ts',
    write: false,
    rollupOptions: { output: { format: 'es' } },
  },
})
const output = Array.isArray(result) ? result[0].output : result.output
const moduleSource = output.find((item) => item.type === 'chunk').code
const { sampleChartSeries } = await import(
  `data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`
)

const pointCount = 10_000
const values = Array.from({ length: pointCount }, (_, index) =>
  index < 6_000 ? 20 + (index % 5) : 80 + (index % 5),
)
values[1_333] = 500
values[8_444] = -100
const xValues = Array.from({ length: pointCount }, (_, index) => index)
const budgets = [32, 128, 256]
const seriesCount = 8
const iterations = 100

console.log('Chart anomaly sampling benchmark')
console.log(
  `Fixture: ${seriesCount} series × ${pointCount.toLocaleString()} points, ${iterations} runs`,
)
console.log(
  'budget\tselected\tavg ms/request\tJSON bytes\tspike series\tdrop series\tpre/post shift reps',
)

for (const budget of budgets) {
  const started = performance.now()
  let samples
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    samples = Array.from({ length: seriesCount }, (_, index) =>
      sampleChartSeries(`requests-${index + 1}`, values, xValues, budget),
    )
  }
  const elapsed = performance.now() - started
  const serialized = JSON.stringify({
    chartType: 'line',
    xColumn: 'timestamp',
    valueColumn: 'value',
    series: samples.map((sample) => ({
      name: sample.name,
      originalPointCount: sample.originalPointCount,
      validPointCount: sample.validPointCount,
      sampleCoverage: sample.sampleCoverage,
      samplingMethod: sample.samplingMethod,
      points: sample.points.map(({ x, y }) => ({ x, y })),
      bucketSummaries: sample.bucketSummaries,
    })),
  })
  const totalPoints = samples.reduce(
    (count, sample) => count + sample.points.length,
    0,
  )
  const spikeSeries = samples.filter((sample) =>
    sample.points.some(({ originalIndex }) => originalIndex === 1_333),
  ).length
  const dropSeries = samples.filter((sample) =>
    sample.points.some(({ originalIndex }) => originalIndex === 8_444),
  ).length
  const preShift = samples.reduce(
    (count, sample) =>
      count +
      sample.points.filter(({ originalIndex }) => originalIndex < 6_000).length,
    0,
  )
  const postShift = totalPoints - preShift
  console.log(
    [
      budget,
      totalPoints,
      (elapsed / iterations).toFixed(3),
      Buffer.byteLength(serialized),
      `${spikeSeries}/${seriesCount}`,
      `${dropSeries}/${seriesCount}`,
      `${preShift}/${postShift}`,
    ].join('\t'),
  )
}
