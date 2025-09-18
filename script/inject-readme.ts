import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Section = 'client' | 'server' | 'd.ts'

const pkgRoot = resolve(__dirname, '..')
const readmePath = resolve(pkgRoot, 'README.md')

const sectionToFile: Record<Section, { path: string; lang: string }> = {
  client: { path: resolve(pkgRoot, 'example', 'client.tsx'), lang: 'tsx' },
  server: { path: resolve(pkgRoot, 'example', 'server.ts'), lang: 'ts' },
  'd.ts': {
    path: resolve(pkgRoot, 'example', 'tanstack-effect.d.ts'),
    lang: 'ts',
  },
}

function slurp(filePath: string): string {
  return readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n')
}

function makeInjectedBlock(lang: string, code: string): string {
  return ['```' + lang, code.trimEnd(), '```'].join('\n')
}

function replaceBetweenMarkers(
  input: string,
  section: Section,
  replacement: string
): string {
  const begin = `<!-- BEGIN:${section} -->`
  const end = `<!-- END:${section} -->`
  // Escape special regex characters in the markers
  const escapedBegin = begin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}`, 'g')
  return input.replace(regex, `${begin}\n${replacement}\n${end}`)
}

function main(): void {
  let readme = slurp(readmePath)

  ;(Object.keys(sectionToFile) as Section[]).forEach((section) => {
    const { path, lang } = sectionToFile[section]
    const code = slurp(path)
    const block = makeInjectedBlock(lang, code)
    readme = replaceBetweenMarkers(readme, section, block)
  })

  writeFileSync(readmePath, readme, 'utf8')
}

try {
  main()
  console.log('Injected tanstack-effect README sections successfully.')
} catch (err) {
  console.error('Failed to inject tanstack-effect README sections:', err)
  process.exit(1)
}
