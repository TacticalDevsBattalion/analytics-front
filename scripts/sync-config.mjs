import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '..')
const projectRoot = path.resolve(frontendRoot, '..')
let sourceDir = process.env.FRONTEND_CONFIG_DIR
  ? path.resolve(process.env.FRONTEND_CONFIG_DIR)
  : path.join(projectRoot, 'config', 'frontend')
if (!process.env.FRONTEND_CONFIG_DIR) {
  try { await access(sourceDir) } catch { sourceDir = path.join(frontendRoot, 'config', 'frontend') }
}
const destinationDir = path.join(frontendRoot, 'public', 'config', 'frontend')

await rm(destinationDir, { recursive: true, force: true })
await mkdir(destinationDir, { recursive: true })

const runtimeFiles = ['app.json', 'api.json', 'ui.json', 'map.json', 'pwa.json']
for (const file of runtimeFiles) {
  await cp(path.join(sourceDir, file), path.join(destinationDir, file))
}

const pwa = JSON.parse(await readFile(path.join(sourceDir, 'pwa.json'), 'utf8'))
await writeFile(
  path.join(frontendRoot, 'public', 'manifest.webmanifest'),
  `${JSON.stringify(pwa.manifest, null, 2)}\n`,
  'utf8',
)

const app = JSON.parse(await readFile(path.join(sourceDir, 'app.json'), 'utf8'))
const indexPath = path.join(frontendRoot, 'index.html')
let index = await readFile(indexPath, 'utf8')
index = index
  .replace(/<title>.*?<\/title>/s, `<title>${app.branding.app_name}</title>`)
  .replace(/<meta name="theme-color" content="[^"]*"\s*\/>/, `<meta name="theme-color" content="${pwa.manifest.theme_color}" />`)
  .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*"\s*\/>/, `<meta name="apple-mobile-web-app-title" content="${app.branding.short_name}" />`)
await writeFile(indexPath, index, 'utf8')

console.log(`Synced frontend config from ${sourceDir}`)
