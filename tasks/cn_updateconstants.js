const request = require('request')
const async = require('async')
const fs = require('fs')
const simplevdf = require('simple-vdf')
const { mapAbilities, cleanupArray } = require('../utils')
const myHeroes = require('./customize_heroes.json')

const extraStrings = {
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

const badNames = ['Version', 'npc_dota_hero_base', 'npc_dota_hero_target_dummy']

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
function formatValues(value, percent = false, separator = ' / ') {
  var values = Array.isArray(value) ? value : String(value).split(' ')
  if (values.every((v) => v == values[0])) {
    values = [values[0]]
  }
  if (percent) {
    values = values.map((v) => v + '%')
  }
  let len = values.length
  let res = values.join(separator).replace(/\.0+(\D|$)/g, '$1')
  return len > 1 ? res.split(separator) : res
}

// Formats AbilitySpecial for the attrib value for abilities and items
function formatAttrib(attributes, strings, strings_prefix) {
  if (attributes && !Array.isArray(attributes)) attributes = Object.values(attributes)
  return (attributes || [])
    .map((attr) => {
      let key = Object.keys(attr).find((key) => `${strings_prefix}${key}` in strings)
      if (!key) {
        for (item in attr) {
          key = item
          break
        }
        return {
          key: key,
          header: `${key.replace(/_/g, ' ').toUpperCase()}:`,
          value: formatValues(attr[key]),
          generated: true,
        }
      }

      let final = { key: key }
      let header = strings[`${strings_prefix}${key}`]
      let match = header.match(/(%)?(\+\$)?(.*)/)
      header = match[3]

      if (match[2]) {
        final.header = '+'
        final.value = formatValues(attr[key], match[1])
        final.footer = strings[`dota_ability_variable_${header}`]
        if ('dota_ability_variable_attack_range'.includes(header))
          final.footer = final.footer.replace(/<[^>]*>/g, '')
      } else {
        final.header = header.replace(/<[^>]*>/g, '')
        final.value = formatValues(attr[key], match[1])
      }

      return final
    })
    .filter((a) => a)
}

function replaceSValues(template, attribs) {
  let values = {}
  if (template && attribs && Array.isArray(attribs)) {
    attribs.forEach((attrib) => {
      let key = Object.keys(attrib)[0]
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

function replaceBonusSValues(key, template, attribs) {
  if (template && attribs) {
    Object.keys(attribs).forEach((bonus) => {
      if (typeof attribs[bonus] == 'object' && attribs[bonus]?.hasOwnProperty(key)) {
        // remove redundant signs
        var bonus_value = attribs[bonus][key]
          .replace('+', '')
          .replace('-', '')
          .replace('x', '')

        template = template
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
function replaceSpecialAttribs(
  template,
  attribs,
  isItem = false,
  allData = {},
  key // For error tracing
) {
  if (!template) {
    return template
  }

  // Fix weird attrib formatting on very rare cases.
  // e.g.: spirit_breaker_empowering_haste
  if (!Array.isArray(attribs) && typeof attribs == 'object') {
    attribs = Object.keys(attribs).map((key) => {
      return attribs[key]
    })
  }
  if (attribs) {
    //additional special ability keys being catered
    extraAttribKeys.forEach((abilitykey) => {
      if (abilitykey in allData) {
        let value = allData[abilitykey].split(' ') //can have multiple values
        value = value.length === 1 ? Number(value[0]) : value.map((v) => Number(v))
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
    }

    template = template.replace(/%([^% ]*)%/g, function (str, name) {
      if (name == '') {
        return '%'
      }
      if (!Array.isArray(attribs)) attribs = Object.values(attribs)
      var attr = attribs.find((attr) => name in attr)
      if (!attr && name[0] === 'd') {
        // Because someone at valve messed up in 4 places
        name = name.substr(1)
        attr = attribs.find((attr) => name in attr)
      }
      if (!attr) {
        if (name === 'lifesteal') {
          //special cases, in terms of template context and dota2 gamepedia
          return attribs.find((obj) => 'lifesteal_percent' in obj).lifesteal_percent
        } else if (name === 'movement_slow') {
          return attribs.find((obj) => 'damage_pct' in obj).damage_pct
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

function formatBehavior(string) {
  if (!string) return false

  let split = string
    .split(' | ')
    .filter(
      (a) => !ignoreStrings.includes(a.trim()) && extraStrings.hasOwnProperty(a.trim())
    )
    .map((item) => {
      return extraStrings[item.trim()]
    })

  if (split.length === 1) {
    return split[0]
  } else {
    return split
  }
}

function formatVpkHero(key, vpkr, localized_name) {
  let h = {}

  let vpkrh = vpkr.DOTAHeroes[key]
  let baseHero = vpkr.DOTAHeroes.npc_dota_hero_base

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
  h.url = vpkrh.url

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

const getNeutralItemNameTierMap = (neutrals) => {
  var ret = {}
  Object.keys(neutrals).forEach((tier) => {
    var items = neutrals[tier].items
    Object.keys(items).forEach((itemName) => {
      ret[itemName] = ret[itemName.replace(/recipe_/gi, '')] = parseInt(tier)
    })
  })
  return ret
}

/* -------------------------------------------------------------------------- */
/*                                custom codes                                */
/* -------------------------------------------------------------------------- */
function catogerizeItemAbilities(abilities, allData) {
  const itemAbilities = {}
  abilities.forEach((ability) => {
    if (!ability.includes('<h1>')) {
      // console.log('allData: '.red(), allData)
      ability = ability.replaceAll('%%', '%')
      ability = ability.replace(/%([a-z_]+)%/g, function (str, name) {
        // console.log('name: '.red(), name)
        if (allData) {
          if (name === 'abilitycastrange' && allData.AbilityCastRange) {
            return allData.AbilityCastRange
          }
          if (name === 'abilityduration' && allData.AbilityDuration) {
            return allData.AbilityDuration
          }
          if (allData.AbilityValues) {
            return allData.AbilityValues[name] || name
          }
        }
        return name
      })
      ;(itemAbilities.hint = itemAbilities.hint || []).push(ability)
    } else {
      ability = ability.replace(/<[^h1>]*>/gi, '')
      const regExp = /<h1>\s*(.*)\s*:\s*(.*)\s*<\/h1>\s*([\s\S]*)/gi
      try {
        const [_, type, name, desc] = regExp.exec(ability)
        ;(itemAbilities[type.toLowerCase()] =
          itemAbilities[type.toLowerCase()] || []).push({
          name: name,
          desc: desc,
        })
      } catch (e) {
        console.log(e)
      }
    }
  })
  return itemAbilities
}

String.prototype.red = function () {
  return `\u001b[31;1m${this}\x1b[0m`
}

const sources = [
  {
    key: 'items_cn',
    url: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_schinese.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/items.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/neutral_items.txt',
    ],
    transform: (respObj) => {
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

      var items = {}

      Object.keys(scripts)
        .filter((key) => {
          return (
            !(key.includes('item_recipe') && scripts[key].ItemCost === '0') &&
            key !== 'Version'
          )
        })
        .forEach((key) => {
          var item = {
            ...replaceSpecialAttribs(
              strings[`DOTA_Tooltip_ability_${key}_Description`],
              scripts[key].AbilitySpecial,
              true,
              scripts[key]
            ),
          }

          item.id = parseInt(scripts[key].ID)
          item.img = `/apps/dota2/images/items/${key.replace(
            /^item_/,
            ''
          )}_lg.png?t=${1593393829403}`
          if (key.includes('item_recipe')) {
            item.img = `/apps/dota2/images/items/recipe_lg.png?t=${1593393829403}`
          }

          item.dname = strings[`DOTA_Tooltip_ability_${key}`]
          item.qual = scripts[key].ItemQuality
          item.cost = parseInt(scripts[key].ItemCost)

          var notes = []
          for (let i = 0; strings[`DOTA_Tooltip_ability_${key}_Note${i}`]; i++) {
            notes.push(strings[`DOTA_Tooltip_ability_${key}_Note${i}`])
          }

          item.notes = notes.join('\n')

          item.attrib = formatAttrib(
            scripts[key].AbilitySpecial,
            strings,
            `DOTA_Tooltip_ability_${key}_`
          ).filter((attr) => !attr.generated || attr.key === 'lifetime')

          item.mc = parseInt(scripts[key].AbilityManaCost) || false
          item.cd = parseInt(scripts[key].AbilityCooldown) || false

          item.lore = (strings[`DOTA_Tooltip_ability_${key}_Lore`] || '').replace(
            /\\n/g,
            '\r\n'
          )

          item.components = null
          item.created = false
          item.charges = parseInt(scripts[key].ItemInitialCharges) || false
          if (neutralItemNameTierMap[key]) {
            item.tier = neutralItemNameTierMap[key]
          }
          items[key.replace(/^item_/, '')] = item
        })

      // Load recipes
      Object.keys(scripts)
        .filter((key) => scripts[key].ItemRequirements && scripts[key].ItemResult)
        .forEach((key) => {
          result_key = scripts[key].ItemResult.replace(/^item_/, '')
          items[result_key].components = scripts[key].ItemRequirements[0]
            .split(';')
            .map((item) => item.replace(/^item_/, '').replace('*', ''))
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
    key: 'abilities_cn',
    url: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/abilities_schinese.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_abilities.json',
    ],
    transform: (respObj) => {
      const strings = respObj[0].lang.Tokens
      const scripts = respObj[1].DOTAAbilities

      var not_abilities = [
        'Version',
        'ability_base',
        'default_attack',
        'attribute_bonus',
        'ability_deward',
      ]

      var abilities = {}

      Object.keys(scripts)
        .filter((key) => !not_abilities.includes(key))
        .forEach((key) => {
          var ability = {}

          ability.dname = replaceSValues(
            strings[`DOTA_Tooltip_ability_${key}`] ??
              strings[`DOTA_Tooltip_Ability_${key}`],
            scripts[key].AbilitySpecial ??
              (scripts[key].AbilityValues ? [scripts[key].AbilityValues] : undefined)
          )

          // Check for unreplaced `s:bonus_<talent>`
          // TODO: Create a replace function for the remaining `s:bonus_<talent>` templates whose values are placed in one of the hero's base abilities.
          if (
            scripts[key].ad_linked_abilities &&
            scripts[scripts[key].ad_linked_abilities]
          ) {
            ability.dname = replaceBonusSValues(
              key,
              ability.dname,
              scripts[scripts[key].ad_linked_abilities].AbilityValues
            )
          }

          ability.behavior = formatBehavior(scripts[key].AbilityBehavior) || undefined
          ability.dmg_type =
            formatBehavior(scripts[key].AbilityUnitDamageType) || undefined
          ability.bkbpierce = formatBehavior(scripts[key].SpellImmunityType) || undefined
          ability.target_type =
            formatBehavior(scripts[key].AbilityUnitTargetTeam) || undefined

          ability.desc = replaceSpecialAttribs(
            strings[`DOTA_Tooltip_ability_${key}_Description`],
            scripts[key].AbilitySpecial,
            false,
            scripts[key]
          )
          ability.dmg =
            scripts[key].AbilityDamage && formatValues(scripts[key].AbilityDamage)

          ability.attrib = formatAttrib(
            scripts[key].AbilitySpecial,
            strings,
            `DOTA_Tooltip_ability_${key}_`
          )

          if (scripts[key].AbilityManaCost || scripts[key].AbilityCooldown) {
            if (scripts[key].AbilityManaCost) {
              ability.mc = formatValues(scripts[key].AbilityManaCost, false, '/')
            }
            if (scripts[key].AbilityCooldown) {
              ability.cd = formatValues(scripts[key].AbilityCooldown, false, '/')
            }
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
    key: 'heroes_cn',
    url: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_schinese.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json',
      // "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
    ],
    transform: (respObj) => {
      let heroes = []
      let keys = Object.keys(respObj[1].DOTAHeroes).filter(
        (name) => !badNames.includes(name)
      )
      keys.forEach((name) => {
        let h = formatVpkHero(name, respObj[1], respObj[0].lang.Tokens[name])
        h.localized_name =
          h.localized_name || respObj[1]['DOTAHeroes'][name].workshop_guide_name
        // h.localized_name = h.localized_name || respObj[2].lang.Tokens[name];
        heroes.push(h)
      })
      heroes = heroes.sort((a, b) => a.id - b.id)

      let heroesObj = {}
      for (hero of heroes) {
        Object.assign(hero, myHeroes[hero.id])
        hero.id = Number(hero.id)
        heroesObj[hero.id] = hero
      }
      return heroesObj
    },
  },
  {
    key: 'hero_names_cn',
    url: [
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/dota_schinese.json',
      'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/scripts/npc/npc_heroes.json',
      // "https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/dota_english.json",
    ],
    transform: (respObj) => {
      let heroes = []
      let keys = Object.keys(respObj[1].DOTAHeroes).filter(
        (name) => !badNames.includes(name)
      )
      keys.forEach((name) => {
        let h = formatVpkHero(name, respObj[1], respObj[0].lang.Tokens[name])
        h.localized_name =
          h.localized_name || respObj[1]['DOTAHeroes'][name].workshop_guide_name
        // h.localized_name = h.localized_name || respObj[2].lang.Tokens[name];
        heroes.push(h)
      })
      heroes = heroes.sort((a, b) => a.id - b.id)
      let heroesObj = {}
      for (hero of heroes) {
        Object.assign(hero, myHeroes[hero.id])
        hero.id = Number(hero.id)
        heroesObj[hero.name] = hero
      }
      return heroesObj
    },
  },
  {
    key: 'hero_lore_cn',
    url: 'https://raw.githubusercontent.com/dotabuff/d2vpkr/master/dota/resource/localization/hero_lore_schinese.txt',
    transform: (respObj) => {
      const obj = Object.entries(respObj['tokens'])
      const lores = {}

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

async.eachLimit(
  sources,
  3,
  function (s, cb) {
    const url = s.url
    //grab raw data from each url and save
    console.log('grab raw data from each url and save: ', s.key.red())
    if (typeof url === 'object') {
      async.map(
        url,
        (urlString, cb) => {
          request(urlString, (err, resp, body) => {
            cb(err, parseJson(body))
          })
        },
        (err, resultArr) => {
          handleResponse(
            err,
            {
              statusCode: 200,
            },
            JSON.stringify(resultArr)
          )
        }
      )
    } else {
      request(url, handleResponse)
    }

    function parseJson(text) {
      try {
        return JSON.parse(text)
      } catch (err) {
        try {
          let vdf = simplevdf.parse(text)
          vdf = vdf[Object.keys(vdf)[0]]
          let keys = Object.keys(vdf)
          let normalized = {}
          for (let key of keys) {
            normalized[key.toLowerCase()] = vdf[key]
          }
          return normalized
        } catch {
          console.log(text)
          return {}
        }
      }
    }

    function handleResponse(err, resp, body) {
      if (err || resp.statusCode !== 200) {
        return cb(err)
      }
      body = parseJson(body)
      if (s.transform) {
        body = s.transform(body)
      }
      fs.writeFileSync('./build/' + s.key + '.json', JSON.stringify(body, null, 2))
      console.log('completed: ', s.key.red())
      cb(err)
    }
  },
  function (err) {
    if (err) {
      throw err
    }
    // Copy manual json files to build
    const jsons = fs.readdirSync('./json')
    jsons.forEach((filename) => {
      fs.writeFileSync(
        './build/' + filename,
        fs.readFileSync('./json/' + filename, 'utf-8')
      )
    })

    process.exit(0)
  }
)
