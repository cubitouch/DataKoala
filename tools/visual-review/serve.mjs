import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateBoard, boardRoot } from './generate.mjs'

const siteRoot = resolve(boardRoot, 'site')
const imageRoot = resolve(boardRoot, 'images')
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
}
function safePath(requestPath) {
  let url
  try {
    url = decodeURIComponent(new URL(requestPath, 'http://localhost').pathname)
  } catch {
    return null
  }
  if (url === '/') url = '/index.html'
  if (
    [
      '/index.html',
      '/app.mjs',
      '/styles.css',
      '/decisions.mjs',
      '/data.json',
    ].includes(url)
  ) {
    return {
      path: resolve(siteRoot, url.slice(1)),
      type: contentTypes[url.slice(url.lastIndexOf('.'))],
    }
  }
  if (!/^\/images\/(?:audit\/)?[a-z0-9-]+\.png$/.test(url)) return null
  const path = resolve(imageRoot, url.slice('/images/'.length))
  if (!path.startsWith(imageRoot + sep)) return null
  return { path, type: contentTypes['.png'] }
}
export async function startServer({ port = 4178, host = '127.0.0.1' } = {}) {
  await generateBoard()
  const server = createServer(async (req, res) => {
    const item = safePath(req.url)
    if (req.method !== 'GET' || !item) {
      res.writeHead(404)
      res.end('Not found')
      return
    }
    try {
      const bytes = await readFile(item.path)
      res.writeHead(200, {
        'Content-Type': item.type,
        'Content-Length': bytes.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      res.end(bytes)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
  await new Promise((yes, no) => {
    server.once('error', no)
    server.listen(port, host, yes)
  })
  return server
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const port = Number(process.env.PORT ?? 4178)
    const server = await startServer({ port })
    console.log(
      'DataKoala VIS-01 board: http://127.0.0.1:' + server.address().port,
    )
    console.log(
      'Decisions persist in this browser and can be exported/imported.',
    )
  } catch (error) {
    console.error('VIS-01 server failed:', error)
    process.exitCode = 1
  }
}
