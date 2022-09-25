import { Hero, emptyHero } from '../interfaces/Hero.ts'
import { ResponseNeutral, ResponseNpcHeroes } from '../interfaces/Response.ts'
import {
  catogerizeItemAbilities,
  getValueFromDota2Attributes,
} from './utils/utils.dota2.ts'
import { cleanupArray } from './utils/utils.ts'

const extraStrings: Record<string, string> = {
  DOTA_ABILITY_BEHAVIOR_NONE: 'None',
  DOTA_ABILITY_BEHAVIOR_PASSIVE: 'Passive',
  DOTA_ABILITY_BEHAVIOR_UNIT_TARGET: 'Unit Target',
  DOTA_ABILITY_BEHAVIOR_CHANNELLED: 'Channeled',
  DOTA_ABILITY_BEHAVIOR_POINT: 'Point Target',
  DOTA_ABILITY_BEHAVIOR_ROOT_DISABLES: 'Root',
  DOTA_ABILITY_BEHAVIOR_AOE: 'AOE',
  DOTA_ABILITY_BEHAVIOR_NO_TARGET: 'No Target',
  DOTA_ABILITY_BEHAVIOR_AUTOCAST: 'Autocast',
  DOTA_ABILITY_BEHAVIOR_ATTACK: 'Attack Modifier',
  DOTA_ABILITY_BEHAVIOR_IMMEDIATE: 'Instant Cast',
  DOTA_ABILITY_BEHAVIOR_HIDDEN: 'Hidden',
  DAMAGE_TYPE_PHYSICAL: 'Physical',
  DAMAGE_TYPE_MAGICAL: 'Magical',
  DAMAGE_TYPE_PURE: 'Pure',
  SPELL_IMMUNITY_ENEMIES_YES: 'Yes',
  SPELL_IMMUNITY_ENEMIES_NO: 'No',
  SPELL_IMMUNITY_ALLIES_YES: 'Yes',
  SPELL_IMMUNITY_ALLIES_NO: 'No',
  SPELL_DISPELLABLE_YES: 'Yes',
  SPELL_DISPELLABLE_NO: 'No',
  DOTA_UNIT_TARGET_TEAM_BOTH: 'Both',
  DOTA_UNIT_TARGET_TEAM_ENEMY: 'Enemy',
  DOTA_UNIT_TARGET_TEAM_FRIENDLY: 'Friendly',
  DOTA_UNIT_TARGET_HERO: 'Hero',
  DOTA_UNIT_TARGET_BASIC: 'Basic',
  DOTA_UNIT_TARGET_BUILDING: 'Building',
  DOTA_UNIT_TARGET_TREE: 'Tree',
}

const ignoreStrings = [
  'DOTA_ABILITY_BEHAVIOR_ROOT_DISABLES',
  'DOTA_ABILITY_BEHAVIOR_DONT_RESUME_ATTACK',
  'DOTA_ABILITY_BEHAVIOR_DONT_RESUME_MOVEMENT',
  'DOTA_ABILITY_BEHAVIOR_IGNORE_BACKSWING',
  'DOTA_ABILITY_BEHAVIOR_TOGGLE',
  'DOTA_ABILITY_BEHAVIOR_IGNORE_PSEUDO_QUEUE',
  'DOTA_ABILITY_BEHAVIOR_SHOW_IN_GUIDES',
]

export const BadNames = ['Version', 'npc_dota_hero_base', 'npc_dota_hero_target_dummy']

const extraAttribKeys = [
  'AbilityCastRange',
  'AbilityChargeRestoreTime',
  'AbilityDuration',
  'AbilityChannelTime',
  'AbilityCastPoint',
  'AbilityCharges',
  'AbilityManaCost',
  'AbilityCooldown',
]

// Formats something like "20 21 22" or [ 20, 21, 22 ] to be "20 / 21 / 22"
export function formatValues(value: unknown, percent = false, separator = ' / ') {
  let values = Array.isArray(value) ? value : String(value).split(' ')
  if (values.every((v) => v == values[0])) {
    values = [values[0]]
  }

  if (percent) {
    values = values.map((v) => v + '%')
  }

  const res = values.join(separator).replace(/\.0+(\D|$)/g, '$1')

  return values.length > 1 ? res.split(separator) : res
}

/**
 * Formats AbilitySpecial for the attrib value for abilities and items
 * @param attributes attributes的格式查看https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/items.json中的AbilitySpecial字段
 * @param strings strings查看https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_schinese.json中的Tokens字段
 * @param strings_prefix 前缀
 * @returns 键值对
 */
export function formatAbilitySpecial(
  attributes: JsonObject[],
  strings: Record<string, string>,
  strings_prefix: string
) {
  if (attributes && !Array.isArray(attributes)) attributes = Object.values(attributes)
  return (attributes || []).map((attr) => {
    let key = Object.keys(attr).find((key) => `${strings_prefix}${key}` in strings)
    if (!key) {
      for (const item in attr) {
        key = item
        break
      }
      return {
        key: key,
        header: `${key!.replace(/_/g, ' ').toUpperCase()}:`,
        value: formatValues(attr[key!]),
        generated: true,
      }
    }

    const final: JsonObject = { key: key }
    let header = strings[`${strings_prefix}${key}`]
    const match = header.match(/(%)?(\+\$)?(.*)/)

    if (match) {
      header = match[3]

      if (match[2]) {
        final.header = '+'
        final.value = formatValues(attr[key], match[1] ? true : false)
        final.footer = strings[`dota_ability_variable_${header}`]
        if ('dota_ability_variable_attack_range'.includes(header)) {
          final.footer = final.footer.replace(/<[^>]*>/g, '')
        }
      } else {
        final.header = header.replace(/<[^>]*>/g, '')
        final.value = formatValues(attr[key], match[1] ? true : false)
      }
    }

    return final
  })
  ///???: 不知道有什么作用
  // .filter((a) => a)
}

export function replaceSValues(template: string, attribs: JsonObject[]) {
  const values: JsonObject = {}
  if (template && attribs && Array.isArray(attribs)) {
    attribs.forEach((attrib) => {
      const key = Object.keys(attrib)[0]
      values[key] = attrib[key]
    })
    Object.keys(values).forEach((key) => {
      if (typeof values[key] != 'object') {
        // TODO: fix special_bonus_unique_bloodseeker_rupture_charges
        template = template.replace(`{s:${key}}`, values[key])
      }
    })
  }
  return template
}

export function replaceBonusSValues(
  key: string,
  template: Optional<string>,
  attribs: Optional<JsonObject>
) {
  if (template && attribs) {
    Object.keys(attribs).forEach((bonus) => {
      if (typeof attribs[bonus] == 'object' && attribs[bonus]?.hasOwnProperty(key)) {
        // remove redundant signs
        const bonus_value = attribs[bonus][key]
          .replace('+', '')
          .replace('-', '')
          .replace('x', '')

        template = template!
          // Most of the time, the bonus value template is named bonus_<bonus_key>
          .replace(`{s:bonus_${bonus}}`, bonus_value)
          // But sometimes, it"s just value
          .replace(`{s:value}`, bonus_value)
      }
    })
  }
  return template
}

// Formats templates like "Storm"s movement speed is %storm_move_speed%" with "Storm"s movement speed is 32"
// args are the template, and a list of attribute dictionaries, like the ones in AbilitySpecial for each ability in the npc_abilities.json from the vpk
export function replaceSpecialAttribs(
  template: string | null | undefined,
  attribs: JsonObject[],
  isItem = false,
  allData: JsonObject = {},
  key: string | null = null // For error tracing
) {
  if (!template) {
    return template
  }

  // Fix weird attrib formatting on very rare cases.
  // e.g.: spirit_breaker_empowering_haste
  if (!Array.isArray(attribs) && typeof attribs == 'object') {
    // attribs = Object.keys(attribs).map((key) => {
    //   return attribs[key]
    // })
    attribs = Object.values(attribs)
  }

  if (attribs) {
    //additional special ability keys being catered
    extraAttribKeys.forEach((abilitykey) => {
      if (abilitykey in allData) {
        let value = allData[abilitykey].split(' ') //can have multiple values
        value =
          value.length === 1 ? Number(value[0]) : value.map((v: unknown) => Number(v))
        attribs.push({ [abilitykey.toLowerCase()]: value })
        //these are also present with another attrib name
        if (abilitykey === 'AbilityChargeRestoreTime') {
          attribs.push({ charge_restore_time: value })
        }
        if (abilitykey === 'AbilityCharges') {
          attribs.push({ max_charges: value })
        }
      }
    })

    if (template.includes('%customval_team_tomes_used%')) {
      //in-game line not required in tooltip
      template = template.replace(/[ a-zA-Z]+: %\w+%/g, '')
      // 上面的正则不支持中文。直接将知识之书的已使用数量替换为0
      template = template.replace('%customval_team_tomes_used%', '0')
    }

    template = template.replace(/%([^% ]*)%/g, function (_str, name) {
      if (name == '') {
        return '%'
      }
      if (!Array.isArray(attribs)) attribs = Object.values(attribs)
      let attr = attribs.find((attr) => name in attr)
      if (!attr && name[0] === 'd') {
        // Because someone at valve messed up in 4 places
        name = name.substr(1)
        attr = attribs.find((attr) => name in attr)
      }
      if (!attr) {
        if (name === 'lifesteal') {
          //special cases, in terms of template context and dota2 gamepedia
          return attribs.find((obj) => 'lifesteal_percent' in obj)!.lifesteal_percent
        } else if (name === 'movement_slow') {
          return attribs.find((obj) => 'damage_pct' in obj)!.damage_pct
        } else if (name === 'movemont_speed_min') {
          // 低级的拼写错误？
          return attribs.find((obj) => 'movement_speed_min' in obj)!.movement_speed_min
        }

        console.log(`cant find attribute %${name}% in %${key}%`)
        return `%${name}%`
      }

      if (attr[name].value) {
        return attr[name].value
      }

      return attr[name]
    })
  }
  if (isItem) {
    template = template.replace(/<br>/gi, '\n')
    const abilities = template.split('\\n')
    // 自定义修改
    return catogerizeItemAbilities(cleanupArray(abilities), allData)
  }
  template = template.replace(/\\n/g, '\n').replace(/<[^>]*>/g, '')
  return template
}

export function formatBehavior(text: string) {
  if (!text) return ''

  const split = text
    .split(' | ')
    .filter((a) => !ignoreStrings.includes(a.trim()) && extraStrings[a.trim()])
    .map((item) => extraStrings[item.trim()])

  if (split.length === 1) {
    return split[0]
  } else {
    return split
  }
}

export function formatVpkHero(
  key: string,
  vpkr: ResponseNpcHeroes,
  localized_name: string
): Hero {
  const h = emptyHero()

  const vpkrh = vpkr.DOTAHeroes[key]
  const baseHero = vpkr.DOTAHeroes.npc_dota_hero_base

  h.id = vpkrh.HeroID
  h.name = key
  h.localized_name = localized_name

  h.primary_attr = vpkrh.AttributePrimary.replace('DOTA_ATTRIBUTE_', '')
    .slice(0, 3)
    .toLowerCase()
  h.attack_type =
    vpkrh.AttackCapabilities == 'DOTA_UNIT_CAP_MELEE_ATTACK' ? 'Melee' : 'Ranged'
  h.roles = vpkrh.Role.split(',')

  h.img =
    '/apps/dota2/images/dota_react/heroes/' + key.replace('npc_dota_hero_', '') + '.png?'
  h.icon =
    '/apps/dota2/images/dota_react/heroes/icons/' +
    key.replace('npc_dota_hero_', '') +
    '.png?'
  ///???: 好像没有作用
  // h.url = vpkrh.url

  h.base_health = Number(vpkrh.StatusHealth || baseHero.StatusHealth)
  h.base_health_regen = Number(vpkrh.StatusHealthRegen || baseHero.StatusHealthRegen)
  h.base_mana = Number(vpkrh.StatusMana || baseHero.StatusMana)
  h.base_mana_regen = Number(vpkrh.StatusManaRegen || baseHero.StatusManaRegen)
  h.base_armor = Number(vpkrh.ArmorPhysical || baseHero.ArmorPhysical)
  h.base_mr = Number(vpkrh.MagicalResistance || baseHero.MagicalResistance)

  h.base_attack_min = Number(vpkrh.AttackDamageMin || baseHero.AttackDamageMin)
  h.base_attack_max = Number(vpkrh.AttackDamageMax || baseHero.AttackDamageMax)

  h.base_str = Number(vpkrh.AttributeBaseStrength)
  h.base_agi = Number(vpkrh.AttributeBaseAgility)
  h.base_int = Number(vpkrh.AttributeBaseIntelligence)

  h.str_gain = Number(vpkrh.AttributeStrengthGain)
  h.agi_gain = Number(vpkrh.AttributeAgilityGain)
  h.int_gain = Number(vpkrh.AttributeIntelligenceGain)

  h.attack_range = Number(vpkrh.AttackRange)
  h.projectile_speed = Number(vpkrh.ProjectileSpeed || baseHero.ProjectileSpeed)
  h.attack_rate = Number(vpkrh.AttackRate || baseHero.AttackRate)

  h.move_speed = Number(vpkrh.MovementSpeed)
  h.turn_rate = Number(vpkrh.MovementTurnRate)

  h.cm_enabled = vpkrh.CMEnabled === '1' ? true : false
  h.legs = Number(vpkrh.Legs || baseHero.Legs)

  return h
}

/**
 * 中立道具的级别
 * 输入参数格式参看https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/neutral_items.txt
 * @param neutrals ResponseNeutral
 * @returns Record<string, number>
 */
export const getNeutralItemNameTierMap = (neutrals: ResponseNeutral) => {
  const ret: Record<string, number> = {}
  Object.keys(neutrals).forEach((tier) => {
    const items = neutrals[tier].items
    Object.keys(items).forEach((itemName) => {
      ///???: 没看懂。。。中立道具的图纸？
      ret[itemName] = ret[itemName.replace(/recipe_/gi, '')] = parseInt(tier)
    })
  })
  return ret
}

export function replaceSpecialAbilityValues(template: string, ability: JsonObject) {
  if (!template || !ability) {
    return template
  }

  template = template.replace(/%([^% ]*)%/g, function (_str, name: string) {
    if (name == '') {
      return '%'
    }

    return getValueFromDota2Attributes(name, ability)
  })

  template = template.replace(/\\n/g, '\n').replace(/<[^>]*>/g, '')

  return template
}
