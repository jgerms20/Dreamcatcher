import { Fragment, type ReactNode } from 'react'

// Minimal markdown renderer for Claude output: ### headers, **bold**, *italic*, - lists.
// Deliberately tiny — no raw HTML pass-through, so model output stays inert text.

function inline(text: string, keyBase: string): ReactNode[] {
  const parts: ReactNode[] = []
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] != null) parts.push(<strong key={`${keyBase}-${i++}`} className="text-dusk-100">{m[1]}</strong>)
    else if (m[2] != null) parts.push(<em key={`${keyBase}-${i++}`}>{m[2]}</em>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export default function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let list: string[] = []
  let key = 0

  const flushList = () => {
    if (!list.length) return
    blocks.push(
      <ul key={`ul-${key++}`} className="my-2 list-disc space-y-1 pl-5 text-dusk-200">
        {list.map((item, i) => (
          <li key={i}>{inline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const listMatch = line.match(/^\s*[-*]\s+(.*)/)
    if (listMatch) {
      list.push(listMatch[1])
      continue
    }
    flushList()
    const header = line.match(/^(#{1,4})\s+(.*)/)
    if (header) {
      blocks.push(
        <h4 key={`h-${key++}`} className="font-display mt-4 mb-1 text-base text-dusk-100">
          {inline(header[2], `h-${key}`)}
        </h4>,
      )
    } else if (line.trim()) {
      blocks.push(
        <p key={`p-${key++}`} className="my-2 leading-relaxed text-dusk-200">
          {inline(line, `p-${key}`)}
        </p>,
      )
    }
  }
  flushList()
  return <Fragment>{blocks}</Fragment>
}
