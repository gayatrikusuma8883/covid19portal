const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

function authenticateToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

const convertStateDBObjectToResponseObj = dbObject => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  }
}
const convertDistDBObjToResponseObj = dbObject => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  }
}

//API 1
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT * FROM user 
    WHERE username='{$username}'
    `
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(password, db.password)
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.send(400)
      response.status('Invalid password')
    }
  }
})

//API 2
app.get('/states/', authenticateToken, async (request, response) => {
  const getStatesQuery = `
  SELECT *FROM state 
  `
  const getStatesListQuery = await db.all(getStatesQuery)
  response.send(
    getStatesListQuery.map(eachState =>
      convertStateDBObjectToResponseObj(eachState),
    ),
  )
})

//API 3
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `
  SELECT *FROM state 
  WHERE state_id=${stateId}
  `
  const getStateBasedOnIdQuery = await db.get(getStateQuery)
  response.send(convertDistDBObjToResponseObj(getStateBasedOnIdQuery))
})

//API 4
app.post('/districts/', authenticateToken, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body
  const createDistQuery = `
INSERT INTO district (districtName, stateId, cases, cured, active, deaths)
VALUES ('${districtName}',${stateId},${cases},${cured},${active},${deaths})
`
  await db.run(createDistQuery)
  response.send('District Successfully Added')
})

//API 5
app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistQuery = `
  SELECT * FROM district WHERE district_id=${districtId}
  `
    const getDistrictQuery = await db.get(getDistQuery)
    response.send(convertDistDBObjToResponseObj(getDistrictQuery))
  },
)

//API 6
app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteDistQuery = `
  DELETE FROM district WHERE district_id=${districtId}
  `
    await db.run(deleteDistQuery)
    response.send('District Removed')
  },
)

//API 7
app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body
    const updateDistQuery = `
    UPDATE district 
    SET 
    district_name='${districtName}',
    state_id=${stateId},
    cases=${cases},
    cured=${cured},
    active=${active},
    deaths=${deaths}; 
    WHERE district_id=${districtId}`
    await db.run(updateDistQuery)
    response.send('District Details Updated')
  },
)
//API 8
app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getStatesStatisticsQuery = `SELECT
  SUM(cases),
  SUM(cured),
  SUM(active),
  SUM(deaths) 
  FROM district 
  WHERE state_id=${stateId}
  `
    const stats = await db.get(getStatesStatisticsQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)
module.exports = app
