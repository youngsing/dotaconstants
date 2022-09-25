/**
 * V社好像不注重大小写。。。
 * 查找一个给定的key是否存在于object中，忽略大小写
 * @param key key
 * @param obj object
 * @returns 如果存在，返回在object中的实际key；如果不存在，返回null
 */
function checkKeyExisted(key: string, obj: JsonObject) {
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === key.toLowerCase()) {
      return k
    }
  }

  return null
}

function getValueFrom(key: string, obj: JsonObject) {
  const v = obj[key]
  if (v && v.value) {
    return v.value
  } else if (typeof v === 'string' || typeof v === 'number') {
    return v
  }

  return key
}

const lookupKeys = ['AbilityValues', 'AbilitySpecial']

export function getValueFromDota2Attributes(key: string, attributes: JsonObject) {
  // 剑圣的治疗守卫（juggernaut_healing_ward）的持续时间是在外层的，即ability里面，但key是纯小写。。。
  // 而其他的一般都在内层，即ability.AbilityValues里面
  // 最后，还有可能是在ability.AbilitySpecial里面

  if (attributes) {
    for (const lookup of lookupKeys) {
      if (attributes[lookup]) {
        const actualKey = checkKeyExisted(key, attributes[lookup])
        if (actualKey) {
          return getValueFrom(actualKey, attributes[lookup])
        }
      }
    }

    const actualKey = checkKeyExisted(key, attributes)
    if (actualKey) {
      return getValueFrom(actualKey, attributes)
    }
  }

  return key
}

export function catogerizeItemAbilities(abilities: string[], allData: JsonObject) {
  const itemAbilities: JsonObject = {}

  abilities.forEach((ability) => {
    if (!ability.includes('<h1>')) {
      // console.log('allData: '.red(), allData)
      ability = ability.replaceAll('%%', '%')
      ability = ability.replace(/%([a-z_]+)%/g, function (_str, name: string) {
        // console.log('name: '.red(), name)

        return getValueFromDota2Attributes(name, allData)
      })
      ;(itemAbilities.hint = itemAbilities.hint || []).push(ability)
    } else {
      ability = ability.replace(/<[^h1>]*>/gi, '')
      const regExp = /<h1>\s*(.*)\s*:\s*(.*)\s*<\/h1>\s*([\s\S]*)/gi
      try {
        const [_, type, name, desc] = regExp.exec(ability)!
        ;(itemAbilities[type.toLowerCase()] =
          itemAbilities[type.toLowerCase()] || []).push({
          name: name,
          desc: desc,
        })
      } catch (e) {
        console.error(e)
      }
    }
  })

  return itemAbilities
}
