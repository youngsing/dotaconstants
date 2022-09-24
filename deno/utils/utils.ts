import { VDF } from '../vdf.js'

export function safelyJSONParse<T>(text: string | null | undefined) {
  if (!text) {
    return null
  }

  let parsed = null

  try {
    parsed = JSON.parse(text)
  } catch (e) {
    console.error('JSON parse failed: ', e)
  }

  return parsed as T
}

// deno-lint-ignore no-explicit-any
export function safelyJSONStringify(value: any) {
  let parsed = ''

  try {
    parsed = JSON.stringify(value)
  } catch (e) {
    console.error('JSON stringify failed: ', e)
  }

  return parsed
}

const HTML_REGEX = /(<([^>]+)>)/gi

export function mapAbilities(tokens: Record<string, string>) {
  const tokenKeys = Object.keys(tokens)
  tokenKeys.forEach((key) => (tokens[key] = tokens[key].replace(HTML_REGEX, '')))
  return tokens
}

const removeExtraneousWhitespacesFromString = (text: string) => {
  if (!text) {
    return ''
  }

  return text.replace(/\s+/g, ' ').trim()
}

export function cleanupArray(array: string[] | undefined | null) {
  if (!array) {
    return []
  }

  return array.filter((n) => removeExtraneousWhitespacesFromString(n))
}

export function parseVdf(text: string) {
  // 原始格式参看：https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/neutral_items.txt

  let vdf: JsonObject = VDF.parse(text)
  vdf = vdf[Object.keys(vdf)[0]]
  const keys = Object.keys(vdf)
  const normalized: JsonObject = {}
  for (const key of keys) {
    normalized[key.toLowerCase()] = vdf[key]
  }
  return normalized
}
