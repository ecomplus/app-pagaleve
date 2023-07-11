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

const parseStatusToEcom = (addiTransactionStatus) => {
  switch (addiTransactionStatus) {
    case 'PENDING':
      return 'pending'

    case 'APPROVED':
      return 'paid'

    case 'REJECTED':
    case 'DECLINED':
    case 'ABANDONED':
      return 'voided'
  }
  return 'unknown' // INTERNAL_ERROR
}

exports.post = ({ appSdk, admin }, req, res) => {
  console.log('>>Webhook ADDI: ')
  const { body, query } = req
  let { storeId } = query
  storeId = parseInt(storeId, 10)
  const {
    orderId,
    applicationId,
    // approvedAmount,
    status,
    statusTimestamp
  } = body
  console.log('>> Store: ', storeId, ' body: ', JSON.stringify(body), ' <<')
  if (storeId > 100) {
    res.status(200).send(body)
    return appSdk.getAuth(storeId)
      .then(async (auth) => {
        try {
          const order = await findOrderById(appSdk, storeId, auth, orderId)
          if (order) {
            // update payment
            const transactionId = order.transactions[0]._id
            let body = {
              date_time: new Date().toISOString(),
              status: parseStatusToEcom(status),
              transaction_id: transactionId,
              flags: ['Addi']
            }
            const responsePaymentHistory = await appSdk.apiRequest(
              storeId,
              `orders/${order._id}/payments_history.json`,
              'POST',
              body,
              auth
            )
            if (responsePaymentHistory) {
              console.log('> Transaction Code ADDI <')
              body = {
                intermediator: {
                  transaction_id: statusTimestamp || '',
                  transaction_code: applicationId || ''
                }
              }
            }
            const responseUpdateTransaction = await appSdk.apiRequest(
              storeId,
              `orders/${order._id}/transactions/${transactionId}.json`,
              'PATCH',
              body,
              auth
            )
            if (responseUpdateTransaction) {
              console.log('> UPDATE Transaction OK')
            }
          }
        } catch (error) {
          console.error(error)
          const { response, config } = error
          let status
          if (response) {
            status = response.status
            const err = new Error(`#${storeId} ADDI Webhook error ${status}`)
            err.url = config && config.url
            err.status = status
            err.response = JSON.stringify(response.data)
            console.error(err)
          }
          if (!res.headersSent) {
            res.send({
              status: status || 500,
              msg: `#${storeId} ADDI Webhook error`
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
