/**
 * dsh-provider-studio — the one wire contract both halves import.
 *
 * The Host registers TYPERT_MANIFEST through ctx.typert.register; the Client
 * mounts INVOCATIONS through ctx.remote.$mount. Method names are identical on
 * both sides (the service method IS the wire method), so there is no map to
 * drift.
 */

export const PACKAGE = 'dsh-provider-studio'
export const SERVICE_KEY = 'providerPanel'

export const METHODS = [
  'listProviders',
  'getProvider',
  'saveProvider',
  'createProvider',
  'deleteProvider',
  'discoverModels',
  'testModel',
  'exportProvider',
]

// The strict-codec contract changed between DSH 0.1.x (registry validates
// `codec.schema.parse`) and 0.2.x (validates `codec.create`). Emit both shapes
// from one parser so the bundle activates on either runtime.
const parser = (parse) => ({ parse })
const strictCodec = (typeSymbol, parse) => ({
  mode: 'strict',
  typeSymbol,
  schema: parser(parse),
  create: () => parser(parse),
})

const argsParser = (value) => {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('expected an args object')
  return value
}

const envelopeParser = (value) => {
  if (value === null || typeof value !== 'object' || typeof value.ok !== 'boolean') {
    throw new TypeError('expected an { ok, ... } envelope')
  }
  return value
}

const argParam = {
  name: 'args',
  wire: 'args',
  source: 'json',
  codec: strictCodec(`${PACKAGE}#Args`, argsParser),
}

export const INVOCATIONS = METHODS.map((method) => ({
  id: `${PACKAGE}#${SERVICE_KEY}/${method}`,
  service: SERVICE_KEY,
  namespace: SERVICE_KEY,
  method,
  invocation: { kind: 'direct' },
  parameters: [argParam],
  result: strictCodec(`${PACKAGE}#${method}Result`, envelopeParser),
}))

export const TYPERT_MANIFEST = {
  package: PACKAGE,
  face: 'host',
  schemas: [],
  model: {
    services: [
      {
        key: SERVICE_KEY,
        exportName: 'ProviderPanelRuntime',
        description: 'Provider Panel — browse and edit llm-pi-ai providers, models and API keys.',
        tags: [],
        members: METHODS.map((method) => ({
          kind: 'method',
          name: method,
          signature: `${method}(args: object): Promise<object>`,
        })),
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: INVOCATIONS,
}
