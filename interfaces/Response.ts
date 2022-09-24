export interface RespAbilities {
  lang: RLang
}

export interface RLang {
  Language: string
  Tokens: { [key: string]: string }
}

export interface RespItemAbilities {
  DOTAAbilities: CommonDotaResponse
}

export interface RespNpcHeroes {
  DOTAHeroes: CommonDotaResponse
}

export interface CommonDotaResponse {
  Version: string
  // deno-lint-ignore no-explicit-any
  [key: string]: any
}
