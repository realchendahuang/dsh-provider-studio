/** The provider template catalog: curated presets first, long tail second. */

import { CURATED_TEMPLATES } from './curated.js'
import { MORE_TEMPLATES } from './more.js'

export const PROVIDER_TEMPLATES = CURATED_TEMPLATES.concat(MORE_TEMPLATES)

/** The "custom provider" card: no preset, everything typed by hand. */
export const CUSTOM_TEMPLATE = {
  id: 'custom',
  label: '',
  api: 'openai-completions',
  baseURL: '',
}
