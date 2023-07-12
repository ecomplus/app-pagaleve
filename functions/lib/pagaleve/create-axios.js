const axios = require('axios')
const ecomUtils = require('@ecomplus/utils')

module.exports = (token, isSandbox) => {
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': ecomUtils.randomObjectId()
  }
  
  const baseURL = `${isSandbox ? 'https://sandbox-api.pagaleve.io' : 'https://api.pagaleve.com.br'}`

  if (token) {
    console.log('> token ', token)
    headers.Authorization = `Bearer ${token}`
  }

  return axios.create({
    baseURL,
    headers
  })
}
