import {
  BadNames,
  formatAbilitySpecial,
  formatBehavior,
  formatValues,
  getNeutralItemNameTierMap,
  replaceBonusSValues,
  replaceSValues,
  replaceSpecialAttribs,
  formatVpkHero,
  replaceSpecialAbilityValues,
} from './helper.ts'
import {
  ResponseAbilities,
  ResponseItemAbilities,
  ResponseNpcHeroes,
  ResponseHeroLore,
  ResponseNeutral,
} from '../interfaces/Response.ts'
import { mapAbilities, parseVdf } from './utils/utils.ts'
import myHeroes from '../tasks/customize_heroes.json' assert { type: 'json' }
import { Hero } from '../interfaces/Hero.ts'

const TOTAL_RUN = true

const sources: {
  run: boolean
  key: string
  urls: string[]
  // deno-lint-ignore no-explicit-any
  transform: (...args: any[]) => JsonObject
}[] = [
  {
    run: TOTAL_RUN && true,
    key: 'items_cn',
    urls: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_schinese.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/items.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/neutral_items.txt',
    ],
    transform: (respObj: [ResponseAbilities, ResponseItemAbilities, ResponseNeutral]) => {
      const strings = mapAbilities(respObj[0].lang.Tokens)
      const scripts = respObj[1].DOTAAbilities
      const neutrals = respObj[2]

      // parse neutral items into name => tier map
      const neutralItemNameTierMap = getNeutralItemNameTierMap(neutrals)

      // Fix places where valve doesnt care about correct case
      Object.keys(strings).forEach((key) => {
        if (key.includes('DOTA_Tooltip_Ability_')) {
          strings[key.replace('DOTA_Tooltip_Ability_', 'DOTA_Tooltip_ability_')] =
            strings[key]
        }
      })

      const items: JsonObject = {}

      Object.keys(scripts)
        .filter((key) => {
          return (
            !(key.includes('item_recipe') && scripts[key].ItemCost === '0') &&
            key !== 'Version'
          )
        })
        .forEach((key) => {
          const script = scripts[key]

          const item: JsonObject = {
            ...(replaceSpecialAttribs(
              strings[`DOTA_Tooltip_ability_${key}_Description`],
              script.AbilitySpecial,
              true,
              script,
              key
            ) as JsonObject),
          }

          item.id = parseInt(script.ID)
          item.img = `/apps/dota2/images/items/${key.replace(
            /^item_/,
            ''
          )}_lg.png?t=${1593393829403}`
          if (key.includes('item_recipe')) {
            item.img = `/apps/dota2/images/items/recipe_lg.png?t=${1593393829403}`
          }

          item.dname = strings[`DOTA_Tooltip_ability_${key}`]
          item.qual = script.ItemQuality
          item.cost = parseInt(script.ItemCost)

          const notes: string[] = []
          for (let i = 0; strings[`DOTA_Tooltip_ability_${key}_Note${i}`]; i++) {
            notes.push(strings[`DOTA_Tooltip_ability_${key}_Note${i}`])
          }

          item.notes = notes.join('\n')

          item.attrib = formatAbilitySpecial(
            script.AbilitySpecial,
            strings,
            `DOTA_Tooltip_ability_${key}_`
          ).filter((attr) => !attr.generated || attr.key === 'lifetime')

          item.mc = parseInt(script.AbilityManaCost) || false
          item.cd = parseInt(script.AbilityCooldown) || false

          item.lore = (strings[`DOTA_Tooltip_ability_${key}_Lore`] || '').replace(
            /\\n/g,
            '\r\n'
          )

          item.components = null
          item.created = false
          item.charges = parseInt(script.ItemInitialCharges) || false
          if (neutralItemNameTierMap[key]) {
            item.tier = neutralItemNameTierMap[key]
          }
          items[key.replace(/^item_/, '')] = item
        })

      // Load recipes
      Object.keys(scripts)
        .filter((key) => scripts[key].ItemRequirements && scripts[key].ItemResult)
        .forEach((key) => {
          const result_key: string = scripts[key].ItemResult.replace(/^item_/, '')
          items[result_key].components = scripts[key].ItemRequirements[0]
            .split(';')
            .map((item: string) => item.replace(/^item_/, '').replace('*', ''))
          items[result_key].created = true
        })

      //Manually Adding DiffBlade2 for match data prior to 7.07
      items['diffusal_blade_2'] = {
        id: 196,
        img: '/apps/dota2/images/items/diffusal_blade_2_lg.png?3',
        dname: '净魂之刃 等级2',
        qual: 'artifact',
        cost: 3850,
        desc: '主动: 如果目标是敌方单位，其身上的增益效果会被立刻移除，移动速度也会被减缓，持续4秒。施法距离：600\n被动: 每次攻击将燃烧目标50点魔法，而且每燃烧一点魔法都会造成0.8点物理伤害。 近战英雄的幻象每次攻击将燃烧16点魔法。远程英雄的幻象每次攻击将燃烧8点魔法。 驱散类型: 基础驱散',
        notes: '不与其他法力破坏技能叠加。',
        attrib: [
          {
            key: 'bonus_agility',
            header: '',
            value: ['25', '35'],
            footer: '敏捷',
          },
          {
            key: 'bonus_intellect',
            header: '',
            value: ['10', '15'],
            footer: '智力',
          },
          {
            key: 'initial_charges',
            header: '初始充能次数：',
            value: '8',
            generated: true,
          },
          {
            key: 'feedback_mana_burn',
            header: '每次攻击燃烧魔法量 (英雄)：',
            value: '50',
            generated: true,
          },
          {
            key: 'feedback_mana_burn_illusion_melee',
            header: '每次攻击燃烧魔法量 (近战幻象)：',
            value: '16',
            generated: true,
          },
          {
            key: 'feedback_mana_burn_illusion_ranged',
            header: '每次攻击燃烧魔法量 (远程幻象)：',
            value: '8',
            generated: true,
          },
          {
            key: 'purge_summoned_damage',
            header: 'PURGE SUMMONED DAMAGE:',
            value: '99999',
            generated: true,
          },
          {
            key: 'purge_rate',
            header: 'PURGE RATE:',
            value: '5',
            generated: true,
          },
          {
            key: 'purge_root_duration',
            header: '非英雄缠绕时间：',
            value: '3',
            generated: true,
          },
          {
            key: 'purge_slow_duration',
            header: '减速时间：',
            value: '4',
            generated: true,
          },
          {
            key: 'damage_per_burn',
            header: '每点魔法燃烧造成伤害：',
            value: '0.8',
            generated: true,
          },
          {
            key: 'cast_range_tooltip',
            header: '施法距离：',
            value: '600',
            generated: true,
          },
        ],
        mc: false,
        cd: 4,
        lore: '一把直接切入敌人灵魂的魔力之刃。',
        components: ['diffusal_blade', 'recipe_diffusal_blade'],
        created: true,
      }

      //Manually added for match data prior to 7.07
      items['recipe_iron_talon'] = {
        id: 238,
        img: '/apps/dota2/images/items/recipe_lg.png?3',
        dname: '图纸（寒铁钢爪）',
        cost: 125,
        desc: '',
        notes: '',
        attrib: [],
        mc: false,
        cd: false,
        lore: '',
        components: null,
        created: false,
      }

      return items
    },
  },
  {
    run: TOTAL_RUN && true,
    key: 'abilities_cn',
    urls: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_schinese.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json',
    ],
    transform: (respObj: [ResponseAbilities, ResponseItemAbilities]) => {
      const tokens = respObj[0].lang.Tokens
      const scripts = respObj[1].DOTAAbilities

      const not_abilities = [
        'Version',
        'ability_base',
        'default_attack',
        'attribute_bonus',
        'ability_deward',
      ]

      const abilities: JsonObject = {}

      Object.keys(scripts)
        .filter((key) => !not_abilities.includes(key))
        .forEach((key) => {
          const script = scripts[key]

          let ability: JsonObject = {}

          ability.dname = replaceSValues(
            tokens[`DOTA_Tooltip_ability_${key}`] ??
              tokens[`DOTA_Tooltip_Ability_${key}`],
            script.AbilitySpecial ??
              (script.AbilityValues ? [script.AbilityValues] : undefined)
          )

          // Check for unreplaced `s:bonus_<talent>`
          // TODO: Create a replace function for the remaining `s:bonus_<talent>` templates whose values are placed in one of the hero's base abilities.
          if (script.ad_linked_abilities && scripts[script.ad_linked_abilities]) {
            ability.dname = replaceBonusSValues(
              key,
              ability.dname,
              scripts[script.ad_linked_abilities].AbilityValues
            )
          }

          ability.behavior = formatBehavior(script.AbilityBehavior) || undefined
          ability.dmg_type = formatBehavior(script.AbilityUnitDamageType) || undefined
          ability.bkbpierce = formatBehavior(script.SpellImmunityType) || undefined
          ability.target_type = formatBehavior(script.AbilityUnitTargetTeam) || undefined

          ability.desc = replaceSpecialAttribs(
            tokens[`DOTA_Tooltip_ability_${key}_Description`],
            script.AbilitySpecial ??
              (script.AbilityValues ? [script.AbilityValues] : undefined),
            false,
            script,
            key
          )
          if (/%\w+%/g.test(ability.desc)) {
            ability.desc = replaceSpecialAbilityValues(
              tokens[`DOTA_Tooltip_ability_${key}_Description`],
              script
            )
          }

          ability.dmg = script.AbilityDamage && formatValues(script.AbilityDamage)

          ability.attrib = formatAbilitySpecial(
            script.AbilitySpecial,
            tokens,
            `DOTA_Tooltip_ability_${key}_`
          )

          if (script.AbilityManaCost) {
            ability.mc = formatValues(script.AbilityManaCost, false, '/')
          }
          if (script.AbilityCooldown) {
            ability.cd = formatValues(script.AbilityCooldown, false, '/')
          }

          ability.img = `/apps/dota2/images/abilities/${key}_md.png`
          if (key.indexOf('special_bonus') === 0) {
            ability = { dname: ability.dname }
          }
          abilities[key] = ability
        })

      return abilities
    },
  },
  {
    run: TOTAL_RUN && true,
    key: 'heroes_cn',
    urls: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_schinese.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json',
      // "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
    ],
    transform: (respObj: [ResponseAbilities, ResponseNpcHeroes]) => {
      const dotaResp = respObj[0]
      const npcHeroesResp = respObj[1]

      let heroes: Hero[] = []
      const keys = Object.keys(npcHeroesResp.DOTAHeroes).filter(
        (name) => !BadNames.includes(name)
      )
      keys.forEach((name) => {
        const h = formatVpkHero(name, npcHeroesResp, dotaResp.lang.Tokens[name])
        h.localized_name =
          h.localized_name || npcHeroesResp.DOTAHeroes[name].workshop_guide_name
        // h.localized_name = h.localized_name || respObj[2].lang.Tokens[name];
        heroes.push(h)
      })
      heroes = heroes.sort((a, b) => a.id - b.id)

      const heroesObj: Record<string, Hero> = {}
      for (const hero of heroes) {
        Object.assign(hero, myHeroes[hero.id.toString() as keyof typeof myHeroes])
        hero.id = Number(hero.id)
        heroesObj[hero.id] = hero
      }
      return heroesObj
    },
  },
  {
    run: TOTAL_RUN && true,
    key: 'hero_names_cn',
    urls: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_schinese.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json',
      // "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
    ],
    transform: (respObj: [ResponseAbilities, ResponseNpcHeroes]) => {
      const dotaResp = respObj[0]
      const npcHeroesResp = respObj[1]

      let heroes: Hero[] = []
      const keys = Object.keys(npcHeroesResp.DOTAHeroes).filter(
        (name) => !BadNames.includes(name)
      )
      keys.forEach((name) => {
        const h = formatVpkHero(name, npcHeroesResp, dotaResp.lang.Tokens[name])
        h.localized_name =
          h.localized_name || npcHeroesResp.DOTAHeroes[name].workshop_guide_name
        // h.localized_name = h.localized_name || respObj[2].lang.Tokens[name];
        heroes.push(h)
      })
      heroes = heroes.sort((a, b) => a.id - b.id)

      const heroesObj: Record<string, Hero> = {}
      for (const hero of heroes) {
        Object.assign(hero, myHeroes[hero.id.toString() as keyof typeof myHeroes])
        hero.id = Number(hero.id)
        heroesObj[hero.name] = hero
      }
      return heroesObj
    },
  },
  {
    run: TOTAL_RUN && true,
    key: 'hero_lore_cn',
    urls: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/hero_lore_schinese.txt',
    ],
    transform: (respObj: [ResponseHeroLore]) => {
      const obj = Object.entries(respObj[0].tokens)
      const lores: Record<string, string> = {}

      for (const [key, value] of obj) {
        // npc_dota_hero_marci_bio
        const name = key.slice(14).slice(0, -4)
        const bio = value.replace(/\t/gi, '').replace(/<br ?\/?>/gi, '\n')
        lores[name] = bio
      }

      return lores
    },
  },
]

for (const source of sources) {
  if (!source.run) {
    console.log('skipped: ', source.key)
    continue
  }

  console.log('started:', source.key)

  // deno-lint-ignore no-explicit-any
  const promises: Promise<any>[] = []

  for (const url of source.urls) {
    promises.push(
      fetch(url).then(async (resp) => {
        if (url.endsWith('.json')) {
          return resp.json()
        } else {
          const text = await resp.text()
          return parseVdf(text)
        }
      })
    )
  }

  const ret = await Promise.all(promises).catch((e) => {
    console.error('fetch error: ', e)
    return null
  })

  if (ret) {
    const obj = source.transform(ret)
    console.log('completed: ', source.key)
    Deno.writeTextFileSync(`./build/${source.key}.json`, JSON.stringify(obj, null, 2))
  }
}
