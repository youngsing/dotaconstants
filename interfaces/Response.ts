export interface ResponseAbilities {
  lang: ResponseLang
}

export interface ResponseLang {
  Language: string
  Tokens: { [key: string]: string }
}

export interface ResponseItemAbilities {
  DOTAAbilities: ResponseCommonDota
}

export interface ResponseNpcHeroes {
  DOTAHeroes: ResponseCommonDota
}

export interface ResponseCommonDota {
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
