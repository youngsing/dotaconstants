import hero_list from '../build/heroes.json' assert { type: 'json' }
import { Aghs, ResponseAghs, ResponseAghsSpecialValue } from '../interfaces/Aghs.ts'
import { pooledMap } from 'https://deno.land/std@0.156.0/async/mod.ts?s=pooledMap'

console.time('deno_run')

// const aghs_desc_urls: string[] = [
//   'http://www.dota2.com/datafeed/herodata?language=schinese&hero_id=1',
//   'http://www.dota2.com/datafeed/herodata?language=schinese&hero_id=2',
//   'http://www.dota2.com/datafeed/herodata?language=schinese&hero_id=3',
//   'http://www.dota2.com/datafeed/herodata?language=schinese&hero_id=4',
//   'http://www.dota2.com/datafeed/herodata?language=schinese&hero_id=5',
//   'http://www.dota2.com/datafeed/herodata?language=schinese&hero_id=137',
// ]

const aghs_desc_urls: string[] = []

for (const hero_id in hero_list) {
  aghs_desc_urls.push(
    'http://www.dota2.com/datafeed/herodata?language=schinese&hero_id=' + hero_id
  )
}

function parseAghanimDesc(
  desc: string,
  specialValues: ResponseAghsSpecialValue[] | null | undefined
) {
  let ret = desc.replaceAll('%%', '%')

  if (specialValues?.length) {
    const matched = ret.match(/\%([a-z_]+?)\%/gi)
    if (matched) {
      for (const m of matched) {
        const key = m.slice(1, -1)
        if (key) {
          const obj = specialValues.find((v) => v.name === key)
          if (obj) {
            ret = ret.replace(m, parseHeroSpecialValues(obj))
          }
        }
      }
    } else {
      ret =
        desc +
        specialValues
          .filter((v) => v.heading_loc)
          .map((v) => v.heading_loc + parseHeroSpecialValues(v))
          .join('；')
    }
  }

  return ret
}

function parseHeroSpecialValues(obj: ResponseAghsSpecialValue) {
  let ret = ''
  if (obj.values_float?.length) {
    ret += obj.values_float.join(',')
  }
  if (obj.values_int?.length) {
    ret += obj.values_int.join(',')
  }
  return ret
}

function handleAghsResponse(respObj: ResponseAghs): [string, Aghs] | null {
  if (!respObj || !respObj.result) {
    console.log('fetch aghs desc failed: ', respObj)
    return null
  }

  const hd_hero = respObj.result.data.heroes[0]

  // object to store data about aghs scepter/shard for a hero
  const aghs_element = {
    hero_name: hd_hero.name,
    hero_id: hd_hero.id,

    has_scepter: false,
    scepter_desc: '',
    scepter_skill_name: '',
    scepter_new_skill: false,

    has_shard: false,
    shard_desc: '',
    shard_skill_name: '',
    shard_new_skill: false,
  }

  hd_hero.abilities.forEach((ability) => {
    // skip unused skills
    if (ability.name_loc == '' || ability.desc_loc == '') {
      return // i guess this is continue in JS :|
    }

    // ------------- Scepter  -------------
    if (ability.ability_is_granted_by_scepter) {
      // scepter grants new ability
      aghs_element.scepter_desc = parseAghanimDesc(
        ability.desc_loc,
        ability.special_values
      )
      aghs_element.scepter_skill_name = ability.name_loc
      aghs_element.scepter_new_skill = true
      aghs_element.has_scepter = true
    } else if (ability.ability_has_scepter && !(ability.scepter_loc == '')) {
      // scepter ugprades an ability
      aghs_element.scepter_desc = parseAghanimDesc(
        ability.scepter_loc,
        ability.special_values
      )
      aghs_element.scepter_skill_name = ability.name_loc
      aghs_element.scepter_new_skill = false
      aghs_element.has_scepter = true
    }
    // -------------- Shard  --------------
    if (ability.ability_is_granted_by_shard) {
      // scepter grants new ability
      aghs_element.shard_desc = parseAghanimDesc(ability.desc_loc, ability.special_values)
      aghs_element.shard_skill_name = ability.name_loc
      aghs_element.shard_new_skill = true
      aghs_element.has_shard = true
    } else if (ability.ability_has_shard && !(ability.shard_loc == '')) {
      // scepter ugprades an ability

      aghs_element.shard_desc = parseAghanimDesc(
        ability.shard_loc,
        ability.special_values
      )
      aghs_element.shard_skill_name = ability.name_loc
      aghs_element.shard_new_skill = false
      aghs_element.has_shard = true
    }
  })

  // Error handling
  if (!aghs_element.has_shard) {
    console.log(
      aghs_element.hero_name +
        '[' +
        aghs_element.hero_id +
        ']' +
        ": Didn't find a shard..."
    )
  }
  if (!aghs_element.has_scepter) {
    console.log(
      aghs_element.hero_name +
        '[' +
        aghs_element.hero_id +
        ']' +
        ": Didn't find a scepter..."
    )
  }

  return [hd_hero.id.toString(), aghs_element]
}

const ret: Record<string, Aghs> = {}
const pool = pooledMap<string, ResponseAghs>(10, aghs_desc_urls, (url) =>
  fetch(url)
    .then((resp) => resp.json())
    .catch((e) => {
      console.error('fetch error: ', url.split('=').pop(), e)
      return null
    })
)

try {
  for await (const obj of pool) {
    if (!obj) {
      continue
    }

    const aghs = handleAghsResponse(obj)
    if (aghs) {
      ret[aghs[0]] = aghs[1]
    }
  }

  Deno.writeTextFileSync('./build/aghs_desc_cn.json', JSON.stringify(ret, null, 2))
} catch (e) {
  console.error('error: ', e)
}

console.timeEnd('deno_run')
