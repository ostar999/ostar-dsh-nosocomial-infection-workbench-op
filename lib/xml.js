/**
 * A minimal XML reader.
 *
 * Office Open XML parts (docx/xlsx) are regular, namespace-prefixed XML. A full
 * parser is unnecessary; what matters here is preserving document order, the raw
 * prefixed tag names, and text with entities decoded.
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
}

/** Decode the five predefined entities plus numeric character references. */
export function decodeEntities (input) {
  if (input.indexOf('&') === -1) return input
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
      if (Number.isFinite(code) && code >= 0 && code <= 0x10ffff) {
        try { return String.fromCodePoint(code) } catch { return whole }
      }
      return whole
    }
    const hit = NAMED_ENTITIES[body]
    return hit === undefined ? whole : hit
  })
}

/**
 * Parse XML into `{ tag, attrs, children }` nodes; text children are strings.
 * Comments, processing instructions, DOCTYPE, and CDATA are handled.
 */
export function parseXml (input) {
  const root = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  const push = (child) => stack[stack.length - 1].children.push(child)
  let i = 0
  const n = input.length
  while (i < n) {
    const lt = input.indexOf('<', i)
    if (lt < 0) {
      push(decodeEntities(input.slice(i)))
      break
    }
    if (lt > i) push(decodeEntities(input.slice(i, lt)))
    if (input.startsWith('<!--', lt)) {
      const end = input.indexOf('-->', lt + 4)
      i = end < 0 ? n : end + 3
      continue
    }
    if (input.startsWith('<![CDATA[', lt)) {
      const end = input.indexOf(']]>', lt + 9)
      push(input.slice(lt + 9, end < 0 ? n : end))
      i = end < 0 ? n : end + 3
      continue
    }
    if (input.startsWith('<?', lt) || input.startsWith('<!', lt)) {
      const end = input.indexOf('>', lt + 2)
      i = end < 0 ? n : end + 1
      continue
    }
    let j = lt + 1
    let quote = ''
    while (j < n) {
      const c = input[j]
      if (quote) {
        if (c === quote) quote = ''
      } else if (c === '"' || c === "'") {
        quote = c
      } else if (c === '>') break
      j++
    }
    const raw = input.slice(lt + 1, j)
    i = j + 1
    if (raw.startsWith('/')) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1) : raw
    const name = /^[^\s/>]+/.exec(body)
    const node = { tag: name ? name[0] : '', attrs: {}, children: [] }
    const attrRe = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    let am
    while ((am = attrRe.exec(body))) {
      node.attrs[am[1]] = decodeEntities(am[2] !== undefined ? am[2] : am[3])
    }
    push(node)
    if (!selfClosing) stack.push(node)
  }
  return root
}

/** All descendant elements with an exact tag name, in document order. */
export function findAll (node, tag, out = []) {
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (child.tag === tag) out.push(child)
    findAll(child, tag, out)
  }
  return out
}

/** First descendant element with an exact tag name. */
export function find (node, tag) {
  for (const child of node.children) {
    if (typeof child === 'string') continue
    if (child.tag === tag) return child
    const hit = find(child, tag)
    if (hit !== undefined) return hit
  }
  return undefined
}

/** Concatenated text of every descendant text node. */
export function textOf (node) {
  if (typeof node === 'string') return node
  let out = ''
  for (const child of node.children) out += textOf(child)
  return out
}
