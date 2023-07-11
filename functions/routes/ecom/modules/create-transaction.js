const ecomUtils = require('@ecomplus/utils')
const { baseUri } = require('./../../../__env')
const PagaLeveAxios = require('../../../lib/pagaleve/create-access')

exports.post = ({ appSdk, admin }, req, res) => {
  /**
   * Requests coming from Modules API have two object properties on body: `params` and `application`.
   * `application` is a copy of your app installed by the merchant,
   * including the properties `data` and `hidden_data` with admin settings configured values.
   * JSON Schema reference for the Create Transaction module objects:
   * `params`: https://apx-mods.e-com.plus/api/v1/create_transaction/schema.json?store_id=100
   * `response`: https://apx-mods.e-com.plus/api/v1/create_transaction/response_schema.json?store_id=100
   *
   * Examples in published apps:
   * https://github.com/ecomplus/app-pagarme/blob/master/functions/routes/ecom/modules/create-transaction.js
   * https://github.com/ecomplus/app-custom-payment/blob/master/functions/routes/ecom/modules/create-transaction.js
   */

  const { params, application } = req.body
  const { storeId } = req
  // merge all app options configured by merchant
  const appData = Object.assign({}, application.data, application.hidden_data)

  const isSandbox = true

  // create access with axios
  const pagaleveAxios = new PagaLeveAxios(appData.username, appData.password, isSandbox, storeId)

  // setup required `transaction` response object
  const orderId = params.order_id
  const { amount, buyer, to, items } = params

  const transactionLink = {
    intermediator: {
      payment_method: params.payment_method
    },
    currency_id: params.currency_id,
    currency_symbol: params.currency_symbol,
    amount: amount.total,
    status: {
      current: 'pending'
    }
  }

  console.log('> Transaction #', storeId, orderId)
  const finalAmount = amount.total
  const finalFreight = amount.freight

  const pagaleveTransaction = {
    orderId,
    totalAmount: Math.floor(finalAmount),
    shippingAmount: Math.floor(finalFreight) || 0,
    currency: params.currency_id || 'BRL'
  }

  pagaleveTransaction.items = []
  items.forEach(item => {
    if (item.quantity > 0) {
      pagaleveTransaction.items.push({
        sku: item.sku,
        name: item.name || item.sku,
        unitPrice: Math.floor((item.final_price || item.price)),
        quantity: item.quantity
      })
    }
  })
  const parseAddress = to => ({
    lineOne: ecomUtils.lineAddress(to),
    city: to.city,
    country: to.country_code ? to.country_code.toUpperCase() : 'BR'
  })

  pagaleveTransaction.client = {
    idType: buyer.registry_type === 'j' ? 'CNPJ' : 'CPF',
    idNumber: String(buyer.doc_number),
    firstName: buyer.fullname.replace(/\s.*/, ''),
    lastName: buyer.fullname.replace(/[^\s]+\s/, ''),
    email: buyer.email,
    cellphone: buyer.phone.number,
    cellphoneCountryCode: `+${(buyer.phone.country_code || '55')}`,
    address: parseAddress(to)
  }

  pagaleveTransaction.shippingAddress = parseAddress(to)
  pagaleveTransaction.billingAddress = params.billing_address
    ? parseAddress(params.billing_address)
    : pagaleveTransaction.client.address

  pagaleveTransaction.allyUrlRedirection = {
    redirectionUrl: `https://${params.domain}/app/#/order/${orderId}`,
    callbackUrl: `${baseUri}/pagaleve/webhook?storeId=${storeId}`
  }

  pagaleveAxios.preparing
    .then(() => {
      const { axios } = pagaleveAxios
      console.log('> SendTransaction Pagaleve: ', JSON.stringify(pagaleveTransaction), ' <<')
      // https://axios-http.com/ptbr/docs/req_config
      const validateStatus = function (status) {
        return status >= 200 && status <= 301
      }
      return axios.post('/v1/online-applications', pagaleveTransaction, { maxRedirects: 0, validateStatus })
    })
    .then((data) => {
      console.log('>> Created transaction <<')
      transactionLink.payment_link = data.headers.location
      res.send({
        redirect_to_payment: true,
        transaction: transactionLink
      })
    })
    .catch(error => {
      // try to debug request error
      console.error(error)
      const errCode = 'Pagaleve_TRANSACTION_ERR'
      let { message } = error
      const err = new Error(`${errCode} #${storeId} - ${orderId} => ${message}`)
      if (error.response) {
        console.log(error.response)
        const { status, data } = error.response
        if (status !== 401 && status !== 403) {
          err.payment = JSON.stringify(transactionLink)
          err.status = status
          if (typeof data === 'object' && data) {
            err.response = JSON.stringify(data)
          } else {
            err.response = data
          }
        } else if (data && Array.isArray(data.errors) && data.errors[0] && data.errors[0].message) {
          message = data.errors[0].message
        }
      }
      res.status(409)
      res.send({
        error: errCode,
        message
      })
    })
}
