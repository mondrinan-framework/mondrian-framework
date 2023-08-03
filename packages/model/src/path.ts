export type Fragment =
  | { kind: 'field'; fieldName: string }
  | { kind: 'index'; index: number }
  | { kind: 'variant'; variantName: string }

export const empty: () => Path = () => new PathImpl([])
export const fromFragments: (fragments: Fragment[]) => Path = (fragments) => new PathImpl(fragments)

export interface Path {
  prependField(fieldName: string): Path
  prependIndex(index: number): Path
  prependVariant(variantName: string): Path
  toArray(): Fragment[]
  format(): string
}

class PathImpl implements Path {
  fragments: Fragment[]

  constructor(fragments: Fragment[]) {
    this.fragments = fragments
  }

  prependFragment = (fragment: Fragment) => new PathImpl([fragment, ...this.fragments])
  prependField = (fieldName: string) => this.prependFragment({ kind: 'field', fieldName })
  prependIndex = (index: number) => this.prependFragment({ kind: 'index', index })
  prependVariant = (variantName: string) => this.prependFragment({ kind: 'variant', variantName })
  toArray = () => [...this.fragments]

  format = () => {
    let pieces = ['$']
    for (let i = 0; i < this.fragments.length; i++) {
      const fragment = this.fragments[i]
      pieces.push(fragmentToSeparator(fragment), fragmentToString(fragment))
    }
    return pieces.join('')
  }
}

function fragmentToString(fragment: Fragment): string {
  switch (fragment.kind) {
    case 'field':
      return fragment.fieldName
    case 'index':
      return `[${fragment.index.toString()}]`
    case 'variant':
      return fragment.variantName
  }
}

function fragmentToSeparator(lookahead: Fragment): string {
  switch (lookahead.kind) {
    case 'field':
      return '.'
    case 'index':
      return ''
    case 'variant':
      return '.'
  }
}