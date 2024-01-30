const getAppData = require('./../../lib/store-api/get-app-data')
const updateAppData = require('./../../lib/store-api/update-app-data')

exports.post = ({ appSdk, admin }, req, res) => {
  console.log('>>Webhook Pagaleve: POST')
  const { body, query } = req
  let { storeId, code } = query
  storeId = parseInt(storeId, 10)
  console.log('>> Store: ', storeId, ' code: ', code, ' <<')
  if (storeId > 100 && code) {
    return appSdk.getAuth(storeId)
      .then(async (auth) => {
        try {
          // waiting for app approval at Pagaleve station
        } catch (error) {
          console.error(error)
          const { response, config } = error
          let status
          if (response) {
            status = response.status
            const err = new Error(`#${storeId} Pagaleve Webhook error ${status}`)
            err.url = config && config.url
            err.status = status
            err.response = JSON.stringify(response.data)
            console.error(err)
          }
          if (!res.headersSent) {
            res.send({
              status: status || 500,
              msg: `#${storeId} Pagaleve Webhook error`
            })
          }
        }
      })
      .catch(() => {
        console.log('Unauthorized')
        if (!res.headersSent) {
          res.sendStatus(401)
        }
      })
    res.status(200)
  } else {
    return res.send({
      status: 404,
      msg: `StoreId #${storeId} not found`
    })
  }
}
