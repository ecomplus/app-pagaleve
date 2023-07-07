module.exports = (username, password, storeId, isSandbox) => new Promise((resolve, reject) => {
  //  https://api-docs.addi-staging-br.com/#/Authentication/createAuthToken
  const axios = require('./create-axios')(null, isSandbox)
  const request = isRetry => {
    console.log(`>> Create Auth s:${storeId}-Sandbox: ${isSandbox}`)
    axios.post('/v1/authentication', {
      username,
      password
    })
      .then(({ data }) => resolve(data))
      .catch(err => {
        console.log('Deu erro', JSON.stringify(err))
        // console.log('Deu erro quero response status', err.response.status)
        if (!isRetry && err.response && err.response.status >= 429) {
          setTimeout(() => request(true), 7000)
        }
        reject(err)
      })
  }
  request()
})
