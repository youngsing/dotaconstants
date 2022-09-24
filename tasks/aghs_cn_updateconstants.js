const request = require('request')
const async = require('async')
const fs = require('fs')
const simplevdf = require('simple-vdf')
const hero_list = require('../build/heroes.json')

console.time('node_run')

String.prototype.red = function () {
  return `\u001b[31;1m${this}\x1b[0m`
}

const aghs_desc_urls = []

for (const hero_id in hero_list) {
  aghs_desc_urls.push(
    'http://www.dota2.com/datafeed/herodata?language=schinese&hero_id=' + hero_id
  )
}

const sources = [
  {
    key: 'aghs_desc_cn',
    url: aghs_desc_urls,
    transform: (respObj) => {
      const herodata = respObj
      const aghs_desc_arr = []
      const aghs_desc_dict = {}

      // for every hero
      herodata.forEach((hd_hero) => {
        if (!hd_hero || !hd_hero.result) {
          console.log('fetch aghs desc failed: '.red(), hd_hero)
          return
        }
        hd_hero = hd_hero.result.data.heroes[0]

        // object to store data about aghs scepter/shard for a hero
        var aghs_element = {
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
            aghs_element.shard_desc = parseAghanimDesc(
              ability.desc_loc,
              ability.special_values
            )
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
        // push the current hero's element into the array
        aghs_desc_arr.push(aghs_element)
        aghs_desc_dict[hd_hero.id] = aghs_element
      })

      return aghs_desc_dict
    },
  },
]

// "heropickerdata": "http://www.dota2.com/jsfeed/heropickerdata?l=english",
// "heropediadata": "http://www.dota2.com/jsfeed/heropediadata?feeds=herodata",
// "leagues": "https://api.opendota.com/api/leagues",
async.eachLimit(
  sources,
  5,
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

    console.timeEnd('node_run')
    process.exit(0)
  }
)

function parseAghanimDesc(desc, specialValues) {
  let ret = desc.replaceAll('%%', '%')

  if (specialValues && specialValues.length) {
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

function parseHeroSpecialValues(obj) {
  let ret = ''
  if (obj.values_float && obj.values_float.length) {
    ret += obj.values_float.join(',')
  }
  if (obj.values_int && obj.values_int.length) {
    ret += obj.values_int.join(',')
  }
  return ret
}
