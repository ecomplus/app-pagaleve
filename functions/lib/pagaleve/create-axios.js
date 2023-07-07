const axios = require('axios')
module.exports = (accessToken, isSandbox) => {
  const headers = {
    'Content-Type': 'application/json'
  }
  
  const baseURL = `${isSandbox ? 'https://sandbox-api.pagaleve.io' : 'https://api.pagaleve.com.br'}`

  if (accessToken) {
    console.log('> token ', accessToken)
    headers.Authorization = `Bearer ${accessToken}`
  }

  return axios.create({
    baseURL,
    headers
  })
}
