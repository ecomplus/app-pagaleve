const getAppData = require('./../../lib/store-api/get-app-data')
const PagaLeveAxios = require('./../../lib/pagaleve/create-access')

const findOrderById = (appSdk, storeId, auth, orderId) => {
  return new Promise((resolve, reject) => {
    appSdk.apiRequest(storeId, `/orders/${orderId}.json`, 'GET', null, auth)
      .then(({ response }) => {
        resolve(response.data)
      })
      .catch((err) => {
        reject(err)
      })
  })
}

const parseStatusToEcom = (pagaleveTransactionStatus) => {
  switch (pagaleveTransactionStatus.toLowerCase()) {
    case 'pending':
    case 'new':
    case 'accepted':
      return 'pending'

    case 'authorized':
    case 'completed':
    case 'paid':
      return 'paid'

    case 'expired':
    case 'declined':
    case 'cancelled':
    case 'abandoned':
    case 'canceled':
      return 'voided'
  }
  return 'unknown' // INTERNAL_ERROR
}

const validateStatus = function (status) {
  return status >= 200 && status <= 301
}

exports.post = ({ appSdk, admin }, req, res) => {
  console.log('>>Webhook Pagaleve: ')
  const { body, query } = req
  let { storeId } = query
  storeId = parseInt(storeId, 10)
  const {
    id,
    orderReference,
    amount
  } = body
  console.log('>> Store: ', storeId, ' body: ', JSON.stringify(body), ' <<')
  if (storeId > 100) {
    return appSdk.getAuth(storeId)
      .then(async (auth) => {
        try {
          const appData = await getAppData({ appSdk, storeId, auth })
          const pagaleveAxios = new PagaLeveAxios(appData.username, appData.password, false, storeId)
          await pagaleveAxios.preparing
          const { axios } = pagaleveAxios
          return axios.get(`/v1/purchase-requests/${id}`, {
            maxRedirects: 0,
            validateStatus
          }).then(async ({ data }) => {
            console.log('>> Get payment status <<', JSON.stringify(data))
            const state = data.status
            const order = await findOrderById(appSdk, storeId, auth, orderReference)
            if (order) {
              const transaction = order.transactions.find(({ intermediator }) => {
                return intermediator && intermediator.transaction_id === id
              })
              if (transaction && transaction._id) {
                // update payment
                const transactionId = transaction._id
                const responsePaymentHistory = await appSdk.apiRequest(
                  storeId,
                  `orders/${order._id}/payments_history.json`,
                  'POST',
                  {
                    date_time: new Date().toISOString(),
                    status: parseStatusToEcom(state),
                    transaction_id: transactionId,
                    flags: ['Pagaleve']
                  },
                  auth
                )
                if (responsePaymentHistory) {
                  console.log('updated order', order._id)
                }
                if (state && state.toLowerCase() === 'paid') {
                  console.log('> SendPayment Pagaleve: ', JSON.stringify({
                    'checkout_id': id,
                    'currency': 'BRL',
                    amount,
                    'intent': 'CAPTURE'
                  }), ' <<')
                  // https://axios-http.com/ptbr/docs/req_config
                  
                  return axios.post('/v1/payments', {
                    'checkout_id': id,
                    'currency': 'BRL',
                    amount,
                    'intent': 'CAPTURE'
                  }, { 
                    maxRedirects: 0,
                    validateStatus
                  }).then(({ data }) => {
                    console.log('>> Created payment <<', JSON.stringify(data))
                    res.status(200).send(body)
                  })
                  .catch(error => {console.log('erro na criação do pagamento', error)})
                }
              } else {
                console.log('não encontrou pedido')
                res.status(400).send({
                  error: 'não encontrou o pedido'
                })
              } 
            }
          })
          .catch(error => {console.log('erro pra buscar status', error); throw error})
        } catch (error) {
          console.error(error)
          const { response, config } = error
          let status
          if (response) {
            status = response.status
            const err = new Error(`#${storeId} Pagalve Webhook error ${status}`)
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
  } else {
    return res.send({
      status: 404,
      msg: `StoreId #${storeId} not found`
    })
  }
}
