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

export interface ResponseNeutral {
  [key: string]: {
    drop_rates: { [key: string]: { [key: string]: string } }
    items: { [key: string]: string }
  }
}

export interface ResponseHeroLore {
  language: string
  tokens: { [key: string]: string }
}
